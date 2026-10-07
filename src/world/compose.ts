import { GROUND_Y, VIEW_MAX_W } from '../core/config';
import { DITHER_LEVELS, ditherCovers } from './dither';

/**
 * Crossfades between two zone scenes with an ordered dither instead of
 * alpha blending, so the pixel art stays crisp (no blended colours).
 */
export class DitherCompositor {
  private canvas: HTMLCanvasElement | null = null;
  private patterns: CanvasPattern[] = [];

  /** Draws `paint`'s output over `g`, covering `amount` (0..1) of the pixels above the ground. */
  blend(g: CanvasRenderingContext2D, amount: number, viewWidth: number, paint: (g: CanvasRenderingContext2D) => void): void {
    const level = Math.round(amount * DITHER_LEVELS);
    if (level <= 0) return;
    if (level >= DITHER_LEVELS) {
      paint(g);
      return;
    }
    const off = this.offscreen();
    off.clearRect(0, 0, VIEW_MAX_W, GROUND_Y);
    off.globalCompositeOperation = 'source-over';
    paint(off);
    off.globalCompositeOperation = 'destination-in';
    off.fillStyle = this.pattern(off, level);
    off.fillRect(0, 0, viewWidth, GROUND_Y);
    off.globalCompositeOperation = 'source-over';
    g.drawImage(off.canvas, 0, 0, viewWidth, GROUND_Y, 0, 0, viewWidth, GROUND_Y);
  }

  private offscreen(): CanvasRenderingContext2D {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = VIEW_MAX_W;
      this.canvas.height = GROUND_Y;
    }
    const g = this.canvas.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    return g;
  }

  private pattern(g: CanvasRenderingContext2D, level: number): CanvasPattern {
    if (this.patterns.length === 0) {
      for (let l = 0; l <= DITHER_LEVELS; l++) {
        const tile = document.createElement('canvas');
        tile.width = 4;
        tile.height = 4;
        const tg = tile.getContext('2d')!;
        tg.fillStyle = '#000';
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) if (ditherCovers(l, x, y)) tg.fillRect(x, y, 1, 1);
        this.patterns.push(g.createPattern(tile, 'repeat')!);
      }
    }
    return this.patterns[level]!;
  }
}
