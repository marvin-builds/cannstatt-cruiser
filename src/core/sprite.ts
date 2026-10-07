import { type Palette, parseSprite, rowsFromString, type SpriteData } from './sprite-data';

export type { Palette };
/** One frame: an array of rows or an indented template literal. */
export type FrameArt = string | readonly string[];

export interface DrawOptions {
  /** Mirror horizontally. */
  flip?: boolean;
}

/**
 * Palette-based pixel sprite with one or more equally sized frames. Frames are
 * rasterised into canvases on first draw and cached (flipped copies too).
 */
export class Sprite {
  readonly width: number;
  readonly height: number;
  private readonly frames: SpriteData[];
  private readonly cache = new Map<string, HTMLCanvasElement>();

  constructor(palette: Palette, frames: readonly FrameArt[]) {
    if (frames.length === 0) throw new Error('Sprite needs at least one frame');
    this.frames = frames.map((art) => parseSprite(typeof art === 'string' ? rowsFromString(art) : art, palette));
    const [first] = this.frames;
    this.width = first!.width;
    this.height = first!.height;
    this.frames.forEach((f, i) => {
      if (f.width !== this.width || f.height !== this.height) {
        throw new Error(`Sprite frame ${i} is ${f.width}x${f.height}, expected ${this.width}x${this.height}`);
      }
    });
  }

  get frameCount(): number {
    return this.frames.length;
  }

  /** Draws frame `frame` (wrapped) with its top-left corner at the rounded (x, y). */
  draw(g: CanvasRenderingContext2D, frame: number, x: number, y: number, options: DrawOptions = {}): void {
    const index = ((Math.floor(frame) % this.frameCount) + this.frameCount) % this.frameCount;
    g.drawImage(this.canvasFor(index, options.flip ?? false), Math.round(x), Math.round(y));
  }

  private canvasFor(index: number, flip: boolean): HTMLCanvasElement {
    const key = `${index}:${flip ? 1 : 0}`;
    let canvas = this.cache.get(key);
    if (!canvas) {
      canvas = rasterise(this.frames[index]!, flip);
      this.cache.set(key, canvas);
    }
    return canvas;
  }
}

function rasterise(data: SpriteData, flip: boolean): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = data.width;
  canvas.height = data.height;
  const g = canvas.getContext('2d')!;
  for (let y = 0; y < data.height; y++) {
    for (let x = 0; x < data.width; x++) {
      const color = data.pixels[y * data.width + x];
      if (!color) continue;
      g.fillStyle = color;
      g.fillRect(flip ? data.width - 1 - x : x, y, 1, 1);
    }
  }
  return canvas;
}

/** Shorthand: `const bin = sprite({ g: '#3a5', k: '#111' }, [frameA, frameB])`. */
export function sprite(palette: Palette, frames: readonly FrameArt[]): Sprite {
  return new Sprite(palette, frames);
}
