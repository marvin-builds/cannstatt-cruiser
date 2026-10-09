/**
 * The stunt line callout (ROADMAP 27): "Linie xN!" on every `stuntStep`
 * (punching in a size bigger for a moment), "Stunt-Linie!" and the points on
 * a completed line, "Session!" and the bonus when the skater leaves the
 * NorDIY park with points, and the big "Kickflip! +N" on every full
 * `airTrick` (ROADMAP 37c; a stunt step of the same tick joins it as a second
 * line; a reduced kickflip, ROADMAP 41, only gets a plain popup instead).
 * A missed line says nothing: falling off stays quiet.
 *
 * It lives in the top strip of the view, between the HUD stats plate (and
 * the desktop item chip) and the HUD buttons, right of the skater and above
 * the upper level (ledges 40-60 px above the street, the skater and his star
 * trail over them), so it never covers the action. It shrinks where the strip
 * is narrow (portrait, big scores) and waits while the zone banner shows.
 */
import { FONT_LINE_HEIGHT, measureText } from '../core/font';
import { GROUND_Y, PLAYER_X } from '../core/config';
import type { Rect } from '../types';
import { UI } from './art';
import { centreX, type HudButtons, plusPoints, POPUP_MARGIN } from './layout';

/** Seconds a "Linie xN!" stays (the next step replaces it). */
export const COMBO_TIME = 1;
/** Seconds "Kickflip! +N" stays. */
export const KICKFLIP_TIME = 1.4;
/** Seconds "Stunt-Linie! +…" stays. */
export const LINE_DONE_TIME = 1.6;
/** Seconds a fresh combo is drawn one scale bigger. */
export const PUNCH_TIME = 0.12;
/** Font scale of the settled callout (the punch draws one bigger where it fits; a narrow strip makes it smaller). */
export const CALLOUT_SCALE = 2;
/**
 * Top of the upper level band the callout stays above: ledges up to 60 px
 * above the street, the skater on them and the star trails of his jumps.
 */
export const STUNT_BAND_TOP = GROUND_Y - 96;
/** Right edge of the skater (feet at PLAYER_X): the callout stays right of it. */
const SKATER_RIGHT = PLAYER_X + 16;
/** Highest top edge of the callout. */
const CALLOUT_TOP = 4;
/** Least gap between the callout and anything it keeps clear of. */
const GAP = 2;

type CalloutKind = 'step' | 'kickflip' | 'done';

export class StuntCallout {
  lines: string[] = [];
  /** Colour of each line. */
  colors: string[] = [];
  /** A line has started (first step) and not ended yet. */
  lineActive = false;
  private time = 0;
  private life = 0;
  /** What shows now; `fresh` while it was shown in this tick (before the next update). */
  private kind: CalloutKind = 'done';
  private fresh = false;
  /** Showing a combo or kickflip (punches in), not the completed line. */
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

  runStarted(): void {
    this.lineActive = false;
    this.hide();
  }

  step(multiplier: number): void {
    this.lineActive = true;
    const text = `Linie x${multiplier}!`;
    if (this.fresh && this.kind === 'kickflip') this.add(text, UI.orange, COMBO_TIME);
    else this.show([text], UI.orange, COMBO_TIME, 'step');
  }

  /** An air trick (kickflip) was landed (airTrick): the big callout with its points. */
  kickflip(points: number): void {
    const text = `Kickflip! ${plusPoints(points)}`;
    if (this.fresh && this.kind === 'step') this.add(text, UI.pink, KICKFLIP_TIME);
    else this.show([text], UI.pink, KICKFLIP_TIME, 'kickflip');
  }

  end(completed: boolean, points: number): void {
    this.lineActive = false;
    if (!completed) {
      this.hide();
      return;
    }
    this.show(points > 0 ? ['Stunt-Linie!', plusPoints(points)] : ['Stunt-Linie!'], UI.yellow, LINE_DONE_TIME, 'done');
  }

  /** The NorDIY park session ended (sessionEnd): "Session!" and its bonus; nothing without points. */
  session(points: number): void {
    if (points > 0) this.show(['Session!', plusPoints(points)], UI.yellow, LINE_DONE_TIME, 'done');
  }

  /** Advances its time while `shown`; while it cannot be shown (zone banner) it waits. */
  update(dt: number, shown = true): void {
    this.fresh = false;
    if (this.visible && shown) this.time += dt;
  }

  private show(lines: string[], color: string, life: number, kind: CalloutKind): void {
    Object.assign(this, { lines, colors: lines.map(() => color), life, time: 0, kind, fresh: true, combo: kind !== 'done' });
  }

  /** A second line joining the callout shown in this tick. */
  private add(text: string, color: string, life: number): void {
    this.lines = [...this.lines, text];
    this.colors = [...this.colors, color];
    this.life = Math.max(this.life, life);
  }

  private hide(): void {
    this.time = this.life;
  }
}

/** Rows of one callout line at `scale`: the glyphs plus the 1 px outline above and below. */
const lineHeight = (scale: number) => FONT_LINE_HEIGHT * scale + 2;

export interface CalloutRect extends Rect {
  /** Font scale to draw at. */
  scale: number;
}

/** What the callout keeps clear of in the top strip (view px). */
export interface CalloutScene {
  viewWidth: number;
  /** The HUD stats plate as drawn now. */
  plate: Rect;
  /** The desktop item chip next to the plate, or null. */
  chip: Rect | null;
  buttons: HudButtons;
  /** The touch item button and its first-time hint while they show, else null. */
  itemButton: Rect | null;
  itemHint: Rect | null;
  /** The zone banner shows: the callout waits until it is gone. */
  banner: boolean;
}

/** The boxes the callout must not touch (the banner is handled by waiting, see placeCallout). */
export function calloutBlockers(scene: CalloutScene): Rect[] {
  const { plate, chip, buttons, itemButton, itemHint } = scene;
  const blocked = [plate, buttons.pause, buttons.mute];
  for (const r of [chip, buttons.fullscreen, itemButton, itemHint]) if (r) blocked.push(r);
  return blocked;
}

/**
 * The callout's box at font `scale` with its top at `y`: as close to the view
 * centre as the boxes in `blocked` on those rows allow (boxes left of the
 * centre push it right, the others left), right of the skater, above the
 * upper level band. Null if it does not fit there.
 */
function boxAt(lines: readonly string[], scale: number, y: number, viewWidth: number, blocked: readonly Rect[]): CalloutRect | null {
  let w = 0;
  for (const l of lines) w = Math.max(w, measureText(l, scale) + 2);
  const h = lines.length * lineHeight(scale) + (lines.length - 1) * scale;
  if (y + h > STUNT_BAND_TOP - GAP) return null;
  const centre = centreX(viewWidth);
  let left = SKATER_RIGHT + POPUP_MARGIN;
  let right = viewWidth - POPUP_MARGIN;
  for (const b of blocked) {
    if (b.y >= y + h + GAP || y >= b.y + b.h + GAP) continue;
    if (b.x + b.w / 2 < centre) left = Math.max(left, b.x + b.w + GAP);
    else right = Math.min(right, b.x - GAP);
  }
  if (right - left < w) return null;
  const x = Math.min(Math.max(centre - Math.floor(w / 2), left), right - w);
  return { x, y, w, h, scale };
}

/**
 * Where `lines` fit: the highest spot at CALLOUT_SCALE, else at a smaller
 * scale; null if nowhere. A `punch` draws one scale bigger from the same top
 * where that fits too.
 */
export function fitCallout(lines: readonly string[], punch: boolean, viewWidth: number, blocked: readonly Rect[]): CalloutRect | null {
  for (let scale = CALLOUT_SCALE; scale >= 1; scale--) {
    for (let y = CALLOUT_TOP; y < STUNT_BAND_TOP; y++) {
      const settled = boxAt(lines, scale, y, viewWidth, blocked);
      if (!settled) continue;
      return (punch && boxAt(lines, scale + 1, y, viewWidth, blocked)) || settled;
    }
  }
  return null;
}

/**
 * Where the callout shows now: null while hidden, and while the zone banner
 * shows (sliding in and out it crosses the whole strip), so it waits.
 */
export function placeCallout(c: StuntCallout, scene: CalloutScene): CalloutRect | null {
  if (!c.visible || scene.banner) return null;
  return fitCallout(c.lines, c.punch, scene.viewWidth, calloutBlockers(scene));
}

/** Top of line `i` inside a callout rect. */
export function calloutLineY(rect: CalloutRect, i: number): number {
  return rect.y + 1 + i * (lineHeight(rect.scale) + rect.scale);
}
