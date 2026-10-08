import { VIEW_H } from '../../core/config';

/**
 * Pixel painting helpers for pre-rendered world art. Everything is painted
 * once into offscreen canvases (lazily, on first draw) at integer pixels.
 */

/** Integer pixel painter over a 2D context. */
export class Painter {
  constructor(readonly g: CanvasRenderingContext2D) {}

  rect(color: string, x: number, y: number, w: number, h: number): void {
    if (w <= 0 || h <= 0) return;
    this.g.fillStyle = color;
    this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  px(color: string, x: number, y: number): void {
    this.rect(color, x, y, 1, 1);
  }

  /** Filled ellipse centred on (cx, cy). */
  ellipse(color: string, cx: number, cy: number, rx: number, ry: number): void {
    for (let dy = -ry; dy <= ry; dy++) {
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry + 0.01))));
      this.rect(color, cx - half, cy + dy, half * 2 + 1, 1);
    }
  }

  disc(color: string, cx: number, cy: number, r: number): void {
    this.ellipse(color, cx, cy, r, r);
  }

  /** Bresenham line. */
  line(color: string, x0: number, y0: number, x1: number, y1: number): void {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.px(color, x0, y0);
      if (x0 === x1 && y0 === y1) return;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y0 += sy;
      }
    }
  }

  /** Symmetric gable / pediment: apex at (x + w/2, y), base row at y + h - 1. */
  gable(color: string, x: number, y: number, w: number, h: number): void {
    for (let row = 0; row < h; row++) {
      const half = Math.round(((row + 1) / h) * (w / 2));
      this.rect(color, x + Math.floor(w / 2) - half, y + row, half * 2 + (w % 2), 1);
    }
  }

  /** Fills columns x..x+w-1 from top(x) down to `bottom` (exclusive). */
  profile(color: string, x: number, w: number, bottom: number, top: (col: number) => number): void {
    for (let col = 0; col < w; col++) this.rect(color, x + col, Math.round(top(col)), 1, bottom - Math.round(top(col)));
  }
}

/** Deterministic hash noise in [0, 1) for texture speckles. */
export function noise(x: number, y: number, salt = 0): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(salt | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** A canvas painted on first use and cached. */
export function lazyCanvas(w: number, h: number, paint: (p: Painter) => void): () => HTMLCanvasElement {
  let canvas: HTMLCanvasElement | null = null;
  return () => {
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      paint(new Painter(g));
    }
    return canvas;
  };
}

/** Something placed along a parallax layer. Owns its own vertical position. */
export interface Prop {
  readonly width: number;
  /** Draws with the left edge at integer screen x. */
  draw(g: CanvasRenderingContext2D, x: number, time: number, seed: number): void;
  /** Paints any cached canvases ahead of time (avoids a hitch on first sight). */
  warm(): void;
}

/** A static prop of size w x h whose bottom edge sits at view y `bottom`. */
export function staticProp(w: number, h: number, bottom: number, paint: (p: Painter) => void): Prop {
  const canvas = lazyCanvas(w, h, paint);
  return {
    width: w,
    draw: (g, x) => g.drawImage(canvas(), x, bottom - h),
    warm: () => void canvas(),
  };
}

/** `prop` mirrored left to right, rendered once (static art only: drawn at time 0, seed 0). */
export function mirrored(prop: Prop): Prop {
  const canvas = lazyCanvas(prop.width, VIEW_H, (p) => {
    p.g.translate(prop.width, 0);
    p.g.scale(-1, 1);
    prop.draw(p.g, 0, 0, 0);
  });
  return {
    width: prop.width,
    draw: (g, x) => g.drawImage(canvas(), x, 0),
    warm: () => void canvas(),
  };
}

/** A prop with `frames` pre-rendered animation frames played at `fps`. */
export function animatedProp(
  w: number,
  h: number,
  bottom: number,
  frames: number,
  fps: number,
  paint: (p: Painter, frame: number) => void,
): Prop {
  const canvases = Array.from({ length: frames }, (_, f) => lazyCanvas(w, h, (p) => paint(p, f)));
  return {
    width: w,
    draw: (g, x, time) => g.drawImage(canvases[Math.floor(time * fps) % frames]!(), x, bottom - h),
    warm: () => canvases.forEach((c) => c()),
  };
}

/** A horizontally repeating band (period px wide, h high, top at view y `y`), optionally animated. */
export interface BaseTile {
  readonly period: number;
  readonly y: number;
  frame(time: number): HTMLCanvasElement;
  warm(): void;
}

export function baseTile(
  period: number,
  y: number,
  h: number,
  paint: (p: Painter, frame: number) => void,
  frames = 1,
  fps = 0,
): BaseTile {
  const canvases = Array.from({ length: frames }, (_, f) => lazyCanvas(period, h, (p) => paint(p, f)));
  return {
    period,
    y,
    frame: (time) => canvases[fps > 0 ? Math.floor(time * fps) % frames : 0]!(),
    warm: () => canvases.forEach((c) => c()),
  };
}

/** Periodic wave helper for seamless tiles: sum of sines whose periods divide `period`. */
export function wave(x: number, period: number, terms: ReadonlyArray<readonly [amp: number, harmonic: number, phase: number]>): number {
  return terms.reduce((sum, [amp, k, phase]) => sum + amp * Math.sin((2 * Math.PI * k * x) / period + phase), 0);
}

/** Bump shape 0..1..0 across a width (for hills under landmarks). */
export function bump(col: number, w: number, sharpness = 0.8): number {
  return Math.pow(Math.sin((Math.PI * (col + 0.5)) / w), sharpness);
}
