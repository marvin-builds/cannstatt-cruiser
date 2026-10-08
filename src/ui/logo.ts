/**
 * The "Cannstatt Cruiser" wordmark: two-tone pixel letters with an ink
 * outline and drop shadow, plus a little longboard under "Cruiser".
 * Rendered once into a cached canvas (the outline costs ~10 text passes).
 */
import { drawText, FONT_LINE_HEIGHT, measureText } from '../core/font';
import type { Rect } from '../types';
import { UI } from './art';
import { centreX } from './layout';

const SCALE = 3;
const PAD = 2;
const TOP = 'Cannstatt';
const BOTTOM = 'Cruiser';
/** "Cruiser" sits a bit to the right, like a hand-set sign. */
const BOTTOM_SHIFT = 18;
const LINE_H = FONT_LINE_HEIGHT * SCALE;

/** Top of the logo on the title screen. */
export const LOGO_Y = 8;

let cached: HTMLCanvasElement | null = null;

function logoSize(): { w: number; h: number } {
  const topW = measureText(TOP, SCALE);
  const bottomW = measureText(BOTTOM, SCALE);
  return { w: Math.max(topW, bottomW + BOTTOM_SHIFT) + PAD * 2 + 2, h: LINE_H * 2 + 4 + PAD * 2 };
}

/** Where the title logo is drawn (centred, top at LOGO_Y): the long-press area for the hidden settings. */
export function logoRect(viewWidth: number): Rect {
  const { w, h } = logoSize();
  return { x: centreX(viewWidth) - Math.floor(w / 2), y: LOGO_Y, w, h };
}

/** Draws `word` with outline, shadow and a lighter top half. */
function word(g: CanvasRenderingContext2D, s: string, x: number, y: number, top: string, bottom: string): void {
  const opts = { scale: SCALE };
  drawText(g, s, x + 2, y + 2, { ...opts, color: UI.ink });
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    drawText(g, s, x + dx, y + dy, { ...opts, color: UI.ink });
  }
  drawText(g, s, x, y, { ...opts, color: bottom });
  g.save();
  g.beginPath();
  g.rect(x, y, measureText(s, SCALE), 3 * SCALE + 1);
  g.clip();
  drawText(g, s, x, y, { ...opts, color: top });
  g.restore();
}

function render(): HTMLCanvasElement {
  const bottomW = measureText(BOTTOM, SCALE);
  const { w, h } = logoSize();
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  word(g, TOP, PAD, PAD, UI.yellow, UI.orange);
  const bx = PAD + BOTTOM_SHIFT;
  const by = PAD + LINE_H - 4;
  word(g, BOTTOM, bx, by, UI.white, UI.teal);
  // Longboard: deck under "Cruiser", two wheels.
  const deckY = by + 6 * SCALE + 2;
  g.fillStyle = UI.ink;
  g.fillRect(bx - 1, deckY - 1, bottomW + 2, 4);
  g.fillStyle = UI.red;
  g.fillRect(bx, deckY, bottomW, 2);
  g.fillStyle = UI.ink;
  g.fillRect(bx + 6, deckY + 3, 3, 3);
  g.fillRect(bx + bottomW - 9, deckY + 3, 3, 3);
  return canvas;
}

/** Draws the logo with its top-left at `x`, `y` (the title uses logoRect, the pause screen its own place). */
export function drawLogo(g: CanvasRenderingContext2D, x: number, y: number): void {
  cached ??= render();
  g.drawImage(cached, x, y);
}
