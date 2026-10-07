/**
 * The "Cannstatt Cruiser" wordmark: two-tone pixel letters with an ink
 * outline and drop shadow, plus a little longboard under "Cruiser".
 * Rendered once into a cached canvas (the outline costs ~10 text passes).
 */
import { drawText, FONT_LINE_HEIGHT, measureText } from '../core/font';
import { UI } from './art';

const SCALE = 3;
const PAD = 2;
const TOP = 'Cannstatt';
const BOTTOM = 'Cruiser';
/** "Cruiser" sits a bit to the right, like a hand-set sign. */
const BOTTOM_SHIFT = 18;
const LINE_H = FONT_LINE_HEIGHT * SCALE;

let cached: HTMLCanvasElement | null = null;

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
  const topW = measureText(TOP, SCALE);
  const bottomW = measureText(BOTTOM, SCALE);
  const width = Math.max(topW, bottomW + BOTTOM_SHIFT) + PAD * 2 + 2;
  const height = LINE_H * 2 + 4 + PAD * 2;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
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

/** Draws the logo centred on `cx` with its top at `y`. */
export function drawLogo(g: CanvasRenderingContext2D, cx: number, y: number): void {
  cached ??= render();
  g.drawImage(cached, cx - Math.floor(cached.width / 2), y);
}
