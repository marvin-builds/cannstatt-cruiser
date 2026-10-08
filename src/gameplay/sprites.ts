/**
 * Every gameplay sprite is made with this `sprite()` (core/sprite.ts plus a
 * registry), so warmSprites() can rasterise all of them at startup. A sprite
 * is otherwise rasterised on its first draw, pixel by pixel: mid-run, when a
 * new kind first comes on screen, that was a render spike of several ms on a
 * throttled phone.
 */
import { type FrameArt, type Palette, type Sprite, sprite as coreSprite } from '../core/sprite';

const all: Sprite[] = [];

/** core/sprite.ts sprite(), remembered for warmSprites. */
export function sprite(palette: Palette, frames: readonly FrameArt[]): Sprite {
  const made = coreSprite(palette, frames);
  all.push(made);
  return made;
}

/** A small offscreen context to draw into for warming (null outside the browser, e.g. in unit tests). */
export function scratchContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  return canvas.getContext('2d');
}

/** Rasterises every frame of every gameplay sprite into the sprite caches now. */
export function warmSprites(g: CanvasRenderingContext2D): void {
  for (const s of all) for (let f = 0; f < s.frameCount; f++) s.draw(g, f, 0, 0);
}
