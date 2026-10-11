/**
 * Geometry of the high five arm (high-five.ts): a line from the body frame's
 * front shoulder (SHOULDER_AT) to the hand, halfway up while raising and
 * lowering, fully stretched with the open palm at the slap. In side view the
 * face is right above the shoulder, so the arm reaches ahead in front of the
 * face (past the nose) and goes behind the head (drawn before the body, only
 * the raised part shows) when reaching straight up or back. Pure data;
 * render.ts draws it.
 */
import type { Point } from './chill';
import type { HighFiveArm, HighFiveSide } from './high-five';
import { SHOULDER_AT } from './use-art';

interface Reach {
  /** Hand offset from the shoulder. */
  hand: Point;
  /** Drawn behind the head and body. */
  behind: boolean;
}

/** The arm per side: stretched at the slap, halfway on the way up and down (in front, below the chin, when reaching ahead). */
const REACH: Record<HighFiveSide, { slap: Reach; half: Reach }> = {
  ahead: { slap: { hand: { x: 9, y: -7 }, behind: false }, half: { hand: { x: 8, y: -2 }, behind: false } },
  over: { slap: { hand: { x: 4, y: -12 }, behind: true }, half: { hand: { x: 8, y: -3 }, behind: false } },
  behind: { slap: { hand: { x: -7, y: -10 }, behind: true }, half: { hand: { x: -6, y: -5 }, behind: true } },
};

/** The open palm at the slap: a flat hand, fingers up, PALM_W x PALM_H skin pixels standing on the hand pixel. */
export const PALM_W = 2;
export const PALM_H = 3;

export interface HighFiveDraw {
  shoulder: Point;
  hand: Point;
  /** Arm drawn before the body (reaching back behind the head). */
  behind: boolean;
  /** Top-left of the open palm (body-frame pixels) at the slap, else null. */
  palm: Point | null;
}

/** The high five arm for body frame `body`, or null in a frame without a shoulder (crash). */
export function highFiveDraw(body: number, arm: HighFiveArm, side: HighFiveSide): HighFiveDraw | null {
  const shoulder = SHOULDER_AT[body];
  if (!shoulder) return null;
  const slap = arm === 'slap';
  const reach = slap ? REACH[side].slap : REACH[side].half;
  const hand = { x: shoulder.x + reach.hand.x, y: shoulder.y + reach.hand.y };
  const palm = slap ? { x: hand.x - Math.floor(PALM_W / 2), y: hand.y - PALM_H + 1 } : null;
  return { shoulder, hand, behind: reach.behind, palm };
}
