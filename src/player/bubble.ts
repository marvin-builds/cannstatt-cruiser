/**
 * Kid mode chill look: instead of the joint the skater chews bubble gum and
 * blows a pink bubble that slowly grows and pops, on a deterministic loop of
 * BUBBLE_PERIOD seconds; a crash pops it at once. Pure data and math;
 * render.ts draws it.
 */
import { rowsFromString } from '../core/sprite-data';
import { HEAD_AT, HEAD_MOUTH } from './art';
import type { Point } from './chill';
import type { TimelineName } from './poses';

export const BUBBLE_PALETTE = {
  q: '#ff8cc6', // gum pink
  Q: '#d24b8e', // bubble rim
  w: '#fff2f8', // shine
} as const;

/** Bubble frame indices (see BUBBLE_ART). */
export const F = { gum: 0, bubble1: 1, bubble2: 2, bubble3: 3, bubble4: 4, pop: 5 } as const;

/** Frames, drawn with the left edge just in front of the mouth and vertically centred on it. */
export const BUBBLE_ART: string[] = [
  `
  q
  `,
  `
  .Q.
  QqQ
  .Q.
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
  q...q
  ..q..
  qq.Qq
  ..q..
  q...q
  `,
];

/** Seconds of one chew-blow-pop cycle. */
export const BUBBLE_PERIOD = 3;
/** Chewing at the start of the cycle: the gum shows at the lips every other CHEW_STEP. */
const CHEW_TIME = 0.8;
const CHEW_STEP = 0.2;
/** Seconds the bubble grows through its four sizes. */
const GROW_TIME = 1.8;
/** Seconds the burst bubble is shown (also on a crash). */
export const BUBBLE_POP_TIME = 0.2;

/** Bubble frame (index into BUBBLE_ART) at `time` seconds, or null when nothing shows. */
export function bubbleFrame(time: number): number | null {
  const t = ((time % BUBBLE_PERIOD) + BUBBLE_PERIOD) % BUBBLE_PERIOD;
  if (t < CHEW_TIME) return Math.floor(t / CHEW_STEP) % 2 === 0 ? F.gum : null;
  const grow = t - CHEW_TIME;
  if (grow < GROW_TIME) return F.bubble1 + Math.floor((grow / GROW_TIME) * 4);
  return grow - GROW_TIME < BUBBLE_POP_TIME ? F.pop : null;
}

export interface BubbleDraw extends Point {
  /** Index into BUBBLE_ART. */
  frame: number;
}

const heights = BUBBLE_ART.map((art) => rowsFromString(art).length);

/**
 * Bubble frame and its top-left (body-frame pixels) for `timeline`'s frame
 * `body`: in front of the mouth, centred on it. `time` drives the loop;
 * `animTime` is the time in the current animation, so a crash pops the bubble
 * right away and then shows none. Null without a visible face.
 */
export function chillBubble(timeline: TimelineName, body: number, time: number, animTime: number): BubbleDraw | null {
  const frame = timeline === 'crash' ? (animTime < BUBBLE_POP_TIME ? F.pop : null) : bubbleFrame(time);
  const head = HEAD_AT[body];
  if (frame === null || !head) return null;
  const mouth = { x: head.x + HEAD_MOUTH.x, y: head.y + HEAD_MOUTH.y };
  return { frame, x: mouth.x + 1, y: mouth.y - Math.floor((heights[frame]! - 1) / 2) };
}
