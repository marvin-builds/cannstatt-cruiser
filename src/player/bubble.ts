/**
 * Kid mode chill look: instead of the joint the skater chews bubble gum and
 * blows a pink bubble that slowly grows and pops, on a deterministic loop of
 * BUBBLE_PERIOD seconds that starts at the pickup (see bubbleTime), so the
 * first thing seen is a readable bubble; a crash pops it at once. Pure data
 * and math; render.ts draws it.
 */
import { CHILL_DURATION } from '../core/chill';
import { rowsFromString } from '../core/sprite-data';
import { HEAD_AT, HEAD_MOUTH } from './art';
import type { Point } from './chill';
import { isCrashTimeline, type TimelineName } from './poses';

export const BUBBLE_PALETTE = {
  q: '#ff8cc6', // gum pink
  Q: '#d24b8e', // bubble rim
  w: '#fff2f8', // shine
} as const;

/** Bubble frame indices (see BUBBLE_ART). */
export const F = { gum: 0, bubble1: 1, bubble2: 2, bubble3: 3, pop: 4 } as const;

/** Frames, drawn with the left edge just in front of the mouth and vertically centred on it. */
export const BUBBLE_ART: string[] = [
  `
  qq
  qQ
  `,
  `
  .QQ.
  QwqQ
  QqqQ
  .QQ.
  `,
  `
  .QQQ.
  QwqqQ
  QqqqQ
  QqqqQ
  .QQQ.
  `,
  `
  .QQQQ.
  QwwqqQ
  QwqqqQ
  QqqqqQ
  QqqqqQ
  .QQQQ.
  `,
  `
  Q....Q
  .q..q.
  ..qq..
  ..qq..
  .q..q.
  Q....Q
  `,
];

/** Seconds of one blow-pop-chew cycle. */
export const BUBBLE_PERIOD = 3;
/** Seconds the bubble grows through its three sizes, right from the start of the cycle. */
const GROW_TIME = 1.8;
/** Seconds the burst bubble is shown (also on a crash). */
export const BUBBLE_POP_TIME = 0.2;
/** Chewing for the rest of the cycle: the gum shows at the lips every other CHEW_STEP. */
const CHEW_STEP = 0.2;
const GROW_FRAMES = [F.bubble1, F.bubble2, F.bubble3] as const;

/** Seconds into the bubble loop for the remaining `chillTimer`: 0 at the pickup. */
export function bubbleTime(chillTimer: number): number {
  return CHILL_DURATION - chillTimer;
}

/** Bubble frame (index into BUBBLE_ART) at `time` seconds into the loop, or null when nothing shows. */
export function bubbleFrame(time: number): number | null {
  const t = ((time % BUBBLE_PERIOD) + BUBBLE_PERIOD) % BUBBLE_PERIOD;
  if (t < GROW_TIME) return GROW_FRAMES[Math.floor((t / GROW_TIME) * GROW_FRAMES.length)]!;
  const after = t - GROW_TIME;
  if (after < BUBBLE_POP_TIME) return F.pop;
  return Math.floor((after - BUBBLE_POP_TIME) / CHEW_STEP) % 2 === 0 ? F.gum : null;
}

export interface BubbleDraw extends Point {
  /** Index into BUBBLE_ART. */
  frame: number;
}

const heights = BUBBLE_ART.map((art) => rowsFromString(art).length);

/**
 * Bubble frame and its top-left (body-frame pixels) for `timeline`'s frame
 * `body`: in front of the mouth, centred on it. `time` drives the loop (see bubbleTime);
 * `animTime` is the time in the current animation, so a crash pops the bubble
 * right away and then shows none (the bin crash shows none). Null without a visible face.
 */
export function chillBubble(timeline: TimelineName, body: number, time: number, animTime: number): BubbleDraw | null {
  // In the bin crash the head is inside the bin: no bubble at all.
  if (timeline === 'binCrash') return null;
  const frame = isCrashTimeline(timeline) ? (animTime < BUBBLE_POP_TIME ? F.pop : null) : bubbleFrame(time);
  const head = HEAD_AT[body];
  if (frame === null || !head) return null;
  const mouth = { x: head.x + HEAD_MOUTH.x, y: head.y + HEAD_MOUTH.y };
  return { frame, x: mouth.x + 1, y: mouth.y - Math.floor((heights[frame]! - 1) / 2) };
}
