/**
 * Drawing primitives shared by the ui screens: text with the ink shadow,
 * opaque plates and ribbons, menu buttons. The text helpers reuse one options
 * object: the HUD and popups draw every frame and must not allocate.
 */
import { drawText, type TextOptions } from '../core/font';
import type { Rect, RenderContext } from '../types';
import { UI } from './art';
import { centreX } from './layout';

const NO_TEXT_OPTIONS: TextOptions = {};
const scratch: TextOptions = {};

export function text(r: RenderContext, s: string, x: number, y: number, options = NO_TEXT_OPTIONS): void {
  scratch.color = options.color;
  scratch.scale = options.scale;
  scratch.align = options.align;
  scratch.shadow = options.shadow ?? UI.ink;
  drawText(r.g, s, x, y, scratch);
}

export function centred(r: RenderContext, s: string, y: number, options: TextOptions = {}): void {
  text(r, s, centreX(r.display.viewWidth), y, { align: 'center', ...options });
}

export function fill(r: RenderContext, color: string): void {
  r.g.fillStyle = color;
  r.g.fillRect(0, 0, r.display.viewWidth, r.display.viewHeight);
}

/** Opaque plate with a yellow rule above and below (zone banner, pause prompt), `x`..`x + w`. */
export function ribbon(r: RenderContext, x: number, y: number, w: number, h: number): void {
  const { g } = r;
  g.fillStyle = UI.panel;
  g.fillRect(x, y, w, h);
  g.fillStyle = UI.yellow;
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y + h - 1, w, 1);
}

/** A menu button: rounded face with an edge and a centred label (by default scale 2 once touch-sized). */
export function menuButton(r: RenderContext, rect: Rect, label: string, color: string = UI.white, scale = rect.h >= 24 ? 2 : 1): void {
  const { g } = r;
  const { x, y, w, h } = rect;
  g.fillStyle = UI.buttonEdge;
  g.fillRect(x + 1, y, w - 2, h);
  g.fillRect(x, y + 1, w, h - 2);
  g.fillStyle = UI.buttonFace;
  g.fillRect(x + 1, y + 1, w - 2, h - 2);
  text(r, label, x + Math.floor(w / 2), y + Math.floor((h - 7 * scale) / 2), { align: 'center', scale, color });
}
