/**
 * The chill look while `state.chillTimer > 0` (joint pickup): which style
 * (adult: joint + red eyes, kid mode: bubble gum, see bubble.ts), which frames
 * get the joint, and the deterministic smoke puffs and tip glow. Pure data and
 * math; render.ts draws it. The red eyes are a sprite variant (CHILL_BODY_FRAMES).
 */
import type { GameState } from '../types';
import { HEAD_AT, HEAD_MOUTH } from './art';
import { isCrashTimeline, type TimelineName } from './poses';

/** What the chill effect adds to the skater: red eyes or not, and what is at his mouth. */
export interface ChillStyle {
  redEyes: boolean;
  mouth: 'joint' | 'bubble';
}

/** The chill style for the current state, or null while not chilled. Kid mode swaps the joint for bubble gum. */
export function chillStyle({ kidMode, chillTimer }: Pick<GameState, 'kidMode' | 'chillTimer'>): ChillStyle | null {
  if (chillTimer <= 0) return null;
  return kidMode ? { redEyes: false, mouth: 'bubble' } : { redEyes: true, mouth: 'joint' };
}

export interface Point {
  x: number;
  y: number;
}

/** One smoke puff relative to the glowing tip; `faded` puffs are drawn darker. */
export interface Puff {
  dx: number;
  dy: number;
  size: number;
  faded: boolean;
}

/** Seconds a puff takes from the tip to fading out. */
export const SMOKE_PERIOD = 1.2;
const PUFFS = 3;
/** Height (px) a puff rises and distance (px) it drifts left over its life. */
const RISE = 9;
const DRIFT = 7;

/** Joint layout from the mouth pixel: `paper` px of rolling paper, then the 1 px glowing tip. */
export const JOINT = { paper: 2 } as const;
export const JOINT_COLORS = { paper: '#f4efe4', glow: ['#ff7a1a', '#ffd040'], smoke: '#d6d4dc', faded: '#a29fac' } as const;

/**
 * Mouth position (body-frame pixels) where the joint sits for `timeline`'s
 * frame `body`, or null: it drops out on a crash, and frames without a
 * visible face have none.
 */
export function chillJoint(timeline: TimelineName, body: number): Point | null {
  if (isCrashTimeline(timeline)) return null;
  const head = HEAD_AT[body];
  return head ? { x: head.x + HEAD_MOUTH.x, y: head.y + HEAD_MOUTH.y } : null;
}

/** Puffs at `time` seconds: they rise from the tip and drift left faster as they age. */
export function smokePuffs(time: number): Puff[] {
  return Array.from({ length: PUFFS }, (_, i) => {
    const age = (((time / SMOKE_PERIOD + i / PUFFS) % 1) + 1) % 1;
    return {
      dx: -Math.round(age * age * DRIFT),
      dy: -1 - Math.round(age * RISE),
      size: age > 0.3 && age < 0.75 ? 2 : 1,
      faded: age >= 0.6,
    };
  });
}

/** Tip colour: a slow deterministic flicker between two embers. */
export function glowColor(time: number): string {
  return JOINT_COLORS.glow[Math.floor(time / 0.25) % 2]!;
}
