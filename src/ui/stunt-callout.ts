/**
 * The stunt line callout (ROADMAP 27): one big text in the upper middle,
 * just below the HUD stats plate, apart from the popup column above the
 * skater. "Combo xN!" on every `stuntStep` (punching in a size bigger for a
 * moment, growing a little with N), "Stunt-Linie!" and the points on a
 * completed line. A missed line says nothing: falling off stays quiet.
 * While it shows, the popup column keeps below it (see index.ts).
 */
import { FONT_LINE_HEIGHT, measureText } from '../core/font';
import { PLAYER_X } from '../core/config';
import type { Rect } from '../types';
import { UI } from './art';
import { BANNER_H, BANNER_Y } from './banner';
import { centreX, plusPoints, POPUP_MARGIN, popupLeft } from './layout';

/** Seconds a "Combo xN!" stays (the next step replaces it). */
export const COMBO_TIME = 1;
/** Seconds "Stunt-Linie! +…" stays. */
export const LINE_DONE_TIME = 1.6;
/** Seconds a fresh combo is drawn one scale bigger. */
export const PUNCH_TIME = 0.12;
/** From this multiplier on the combo is drawn one scale bigger. */
const COMBO_GROW = 4;
/** Right edge of the skater (feet at PLAYER_X): the combo stays right of it. */
const SKATER_RIGHT = PLAYER_X + 16;
/** Gap between the zone banner and a callout below it. */
const BELOW_BANNER = 2;

export class StuntCallout {
  lines: readonly string[] = [];
  color: string = UI.orange;
  /** Multiplier of the last step: the size of the callout. */
  multiplier = 1;
  /** A line has started (first step) and not ended yet. */
  lineActive = false;
  private time = 0;
  private life = 0;
  /** Showing a combo (punches in, grows with N), not the completed line. */
  combo = false;

  get visible(): boolean {
    return this.time < this.life;
  }

  /** Drawn one scale bigger right after a step. */
  get punch(): boolean {
    return this.combo && this.visible && this.time < PUNCH_TIME;
  }

  /** 0 when shown .. 1 at the end of its time (for the fade). */
  get age(): number {
    return this.life > 0 ? Math.min(1, this.time / this.life) : 1;
  }

  /** Font scale on `display`: a combo grows with its multiplier, the completed line keeps the base size. */
  scale(display: { portrait: boolean }): number {
    return calloutScale(display, this.combo ? this.multiplier : 1);
  }

  runStarted(): void {
    this.lineActive = false;
    this.hide();
  }

  step(multiplier: number): void {
    this.lineActive = true;
    this.multiplier = multiplier;
    this.show([`Combo x${multiplier}!`], UI.orange, COMBO_TIME, true);
  }

  end(completed: boolean, points: number): void {
    this.lineActive = false;
    if (!completed) {
      this.hide();
      return;
    }
    this.show(points > 0 ? ['Stunt-Linie!', plusPoints(points)] : ['Stunt-Linie!'], UI.yellow, LINE_DONE_TIME, false);
  }

  update(dt: number): void {
    if (this.visible) this.time += dt;
  }

  private show(lines: readonly string[], color: string, life: number, combo: boolean): void {
    Object.assign(this, { lines, color, life, time: 0, combo });
  }

  private hide(): void {
    this.time = this.life;
  }
}

/** Font scale: 2 (3 in portrait, where a view pixel is ~1 CSS px), one more from COMBO_GROW on. */
export function calloutScale(display: { portrait: boolean }, multiplier: number): number {
  return (display.portrait ? 3 : 2) + (multiplier >= COMBO_GROW ? 1 : 0);
}

/** Top of the callout: right below the HUD plate (`ceiling`), or below the zone banner while it shows. */
export function calloutTop(ceiling: number, bannerVisible: boolean): number {
  return bannerVisible ? Math.max(ceiling, BANNER_Y + BANNER_H + BELOW_BANNER) : ceiling;
}

/** Rows of one callout line at `scale`: the glyphs plus the 1 px outline above and below. */
const lineHeight = (scale: number) => FONT_LINE_HEIGHT * scale + 2;

export interface CalloutRect extends Rect {
  /** Font scale to draw at (the punch adds one where it fits). */
  scale: number;
}

/**
 * The box of the callout's `lines` (outline included), centred in the view
 * but kept right of the skater and off the view edges, from `top` down.
 */
export function calloutRect(lines: readonly string[], scale: number, punch: boolean, viewWidth: number, top: number): CalloutRect {
  const widthAt = (s: number) => Math.max(...lines.map((l) => measureText(l, s))) + 2;
  const s = punch && widthAt(scale + 1) <= viewWidth - 2 * POPUP_MARGIN ? scale + 1 : scale;
  const w = widthAt(s);
  const h = lines.length * lineHeight(s) + (lines.length - 1) * s;
  const cx = Math.max(centreX(viewWidth), SKATER_RIGHT + POPUP_MARGIN + Math.ceil(w / 2));
  return { x: popupLeft(cx, w, viewWidth), y: top, w, h, scale: s };
}

/**
 * Where the callout shows now (null while hidden): below the HUD plate
 * (`ceiling`) or the zone banner. `reserved` is the box the popup column
 * keeps clear of: the punched size, so popups do not jump during the punch.
 */
export function placeCallout(
  c: StuntCallout,
  display: { portrait: boolean; viewWidth: number },
  ceiling: number,
  bannerVisible: boolean,
): { drawn: CalloutRect; reserved: CalloutRect } | null {
  if (!c.visible) return null;
  const scale = c.scale(display);
  const top = calloutTop(ceiling, bannerVisible);
  return {
    drawn: calloutRect(c.lines, scale, c.punch, display.viewWidth, top),
    reserved: calloutRect(c.lines, scale, c.combo, display.viewWidth, top),
  };
}

/** Top of line `i` inside a callout rect. */
export function calloutLineY(rect: CalloutRect, i: number): number {
  return rect.y + 1 + i * (lineHeight(rect.scale) + rect.scale);
}
