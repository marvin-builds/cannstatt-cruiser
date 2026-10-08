/**
 * Layout of the HUD stats plate (top left): "Punkte" label and combo, the
 * score, a row with hearts and the star count and timer rows (icon and a
 * draining bar): one while the chill effect runs, one while drunk. The plate is
 * sized to exactly this content plus STATS_PAD on every side.
 */
import type { Rect } from '../types';

export const STATS_PAD = 3;
const PLATE_X = 2;
const PLATE_Y = 2;
/** Height of a text row (font line height). */
const TEXT_H = 8;
/** The score is drawn at scale 2. */
const SCORE_H = 16;
const ROW_GAP = 2;

/** Timer row: icon width (joint, gum, Maßkrug) + gap in front of the bar. */
export const TIMER_ICON_W = 11;
const TIMER_ICON_GAP = 3;
export const TIMER_BAR_W = 30;
export const TIMER_BAR_H = 5;
const TIMER_ROW_W = TIMER_ICON_W + TIMER_ICON_GAP + TIMER_BAR_W;

export interface StatsLayout {
  /** Left edge of the content. */
  x: number;
  /** Top of the label row, the score, the hearts/stars row and the timer rows (null while off). */
  label: number;
  score: number;
  hearts: number;
  chill: number | null;
  drunk: number | null;
  /** x where the timer bars start. */
  barX: number;
  /** Bottom edge of the content. */
  bottom: number;
  plate: Rect;
}

/** `contentW`: widest row (label/combo, score, hearts + stars) in view pixels. */
export function statsLayout(contentW: number, chill: boolean, drunk = false): StatsLayout {
  const x = PLATE_X + STATS_PAD;
  const label = PLATE_Y + STATS_PAD;
  const score = label + TEXT_H + 1;
  const hearts = score + SCORE_H + ROW_GAP;
  let bottom = hearts + TEXT_H;
  let next = bottom + ROW_GAP;
  const timerRow = (on: boolean): number | null => {
    if (!on) return null;
    const y = next;
    next += TEXT_H + ROW_GAP;
    bottom = y + TEXT_H - 1;
    return y;
  };
  const chillY = timerRow(chill);
  const drunkY = timerRow(drunk);
  const w = Math.max(contentW, chill || drunk ? TIMER_ROW_W : 0);
  return {
    x,
    label,
    score,
    hearts,
    chill: chillY,
    drunk: drunkY,
    barX: x + TIMER_ICON_W + TIMER_ICON_GAP,
    bottom,
    plate: { x: PLATE_X, y: PLATE_Y, w: w + 2 * STATS_PAD, h: bottom - PLATE_Y + STATS_PAD },
  };
}

/** Filled pixels of a timer bar for the remaining time. */
export function timerBarFill(timer: number, duration: number): number {
  if (timer <= 0 || duration <= 0) return 0;
  return Math.min(TIMER_BAR_W, Math.ceil((TIMER_BAR_W * timer) / duration));
}
