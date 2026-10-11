/**
 * Drawing primitives shared by the ui screens: text with the ink shadow,
 * opaque plates and ribbons, menu buttons. The text helpers reuse one options
 * object: the HUD and popups draw every frame and must not allocate.
 */
import { drawText, type TextOptions } from '../core/font';
import type { Rect, RenderContext } from '../types';
import { buttonPlateSprite, type PixelIcon, UI } from './art';
import { centreX, iconOnPlate, type UiMetrics } from './layout';
import { scrollThumb } from './score-layout';

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

/** A HUD-style icon button: the plate centred in its tap area, the icon exactly centred on the plate (layout.ts iconOnPlate). */
export function iconButton(r: RenderContext, m: UiMetrics, hit: Rect, icon: PixelIcon, frame = 0): void {
  const { plate, icon: at } = iconOnPlate(hit, m, icon.width);
  buttonPlateSprite(plate.w).draw(r.g, 0, plate.x, plate.y);
  icon.draw(r.g, frame, at.x, at.y, m.iconScale);
}

/** A bar `w` px wide at a scrolling list's right edge: where the visible rows are in the whole list. */
export function scrollBar(r: RenderContext, list: Rect, contentH: number, scroll: number, w: number): void {
  const { g } = r;
  const x = list.x + list.w - w - 2;
  const track = list.h - 4;
  const thumb = scrollThumb(track, list.h, contentH, scroll, 6);
  g.fillStyle = UI.empty;
  g.fillRect(x, list.y + 2, w, track);
  if (!thumb) return;
  g.fillStyle = UI.muted;
  g.fillRect(x, list.y + 2 + thumb.y, w, thumb.h);
}

/** The red "something new" dot (ROADMAP 70): a `size` px square with an ink rim, its top-left at (x, y). */
export function redDot(r: RenderContext, x: number, y: number, size: number): void {
  const { g } = r;
  g.fillStyle = UI.ink;
  g.fillRect(x - 1, y - 1, size + 2, size + 2);
  g.fillStyle = UI.red;
  g.fillRect(x, y, size, size);
}
