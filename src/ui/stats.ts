/**
 * Layout of the HUD stats plate (top left): "Punkte" label and combo, the
 * score, a row with hearts and the star count and, while the chill effect
 * runs, a row with the joint icon and a draining timer bar. The plate is
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

/** Joint icon width + gap in front of the chill bar. */
export const CHILL_ICON_W = 11;
const CHILL_ICON_GAP = 3;
export const CHILL_BAR_W = 30;
export const CHILL_BAR_H = 5;
const CHILL_ROW_W = CHILL_ICON_W + CHILL_ICON_GAP + CHILL_BAR_W;

export interface StatsLayout {
  /** Left edge of the content. */
  x: number;
  /** Top of the label row, the score, the hearts/stars row and the chill row (null while off). */
  label: number;
  score: number;
  hearts: number;
  chill: number | null;
  /** x where the chill bar starts. */
  chillBarX: number;
  /** Bottom edge of the content. */
  bottom: number;
  plate: Rect;
}

/** `contentW`: widest row (label/combo, score, hearts + stars) in view pixels. */
export function statsLayout(contentW: number, chill: boolean): StatsLayout {
  const x = PLATE_X + STATS_PAD;
  const label = PLATE_Y + STATS_PAD;
  const score = label + TEXT_H + 1;
  const hearts = score + SCORE_H + ROW_GAP;
  const chillY = chill ? hearts + TEXT_H + ROW_GAP : null;
  const bottom = chillY !== null ? chillY + TEXT_H - 1 : hearts + TEXT_H;
  const w = Math.max(contentW, chill ? CHILL_ROW_W : 0);
  return {
    x,
    label,
    score,
    hearts,
    chill: chillY,
    chillBarX: x + CHILL_ICON_W + CHILL_ICON_GAP,
    bottom,
    plate: { x: PLATE_X, y: PLATE_Y, w: w + 2 * STATS_PAD, h: bottom - PLATE_Y + STATS_PAD },
  };
}

/** Filled pixels of the chill bar for the remaining time. */
export function chillBarFill(timer: number, duration: number): number {
  if (timer <= 0 || duration <= 0) return 0;
  return Math.min(CHILL_BAR_W, Math.ceil((CHILL_BAR_W * timer) / duration));
}
