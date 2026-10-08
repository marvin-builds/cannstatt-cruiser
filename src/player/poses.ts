/**
 * Animation timelines: which body / board frame to draw, and where, for an
 * animation state at a given time. Pure data + lookup, no drawing.
 */
import type { PlayerAnim } from '../types';
import { B, BD } from './art';
import type { AnimView } from './controller';
import { DUCK_TRANSITION } from './tuning';

/** One drawn pose; offsets are view pixels relative to the resting position. */
export interface Pose {
  body: number;
  board: number;
  bodyDx?: number;
  bodyDy?: number;
  boardDx?: number;
  boardDy?: number;
  /** The bin crash: the open bin sits on the deck, drawn over the body (only the legs stick out). */
  bin?: boolean;
}

interface Step extends Pose {
  /** Seconds this pose is shown. */
  t: number;
}

interface Timeline {
  steps: Step[];
  loop: boolean;
}

export type TimelineName =
  | Exclude<PlayerAnim, 'air'>
  | 'airRise'
  | 'airFall'
  | 'standUp'
  | 'binCrash'
  | 'grindTurn'
  | 'grindTrick'
  | 'grab'
  | 'hardLand'
  | 'kicker';

/** Board sits with its trucks on the rail top (wheels hang either side). */
const GRIND_DY = 2;

export const TIMELINES: Record<TimelineName, Timeline> = {
  ride: {
    loop: true,
    steps: [
      { t: 0.45, body: B.ride, board: BD.flat },
      { t: 0.45, body: B.ride, board: BD.flat, bodyDy: 1 },
    ],
  },
  push: {
    loop: true,
    steps: [
      { t: 0.1, body: B.ride, board: BD.flat, bodyDy: 1 },
      { t: 0.12, body: B.pushDown, board: BD.flat },
      { t: 0.16, body: B.pushBack, board: BD.flat },
      { t: 0.12, body: B.pushSwing, board: BD.flat },
    ],
  },
  jump: {
    loop: false,
    steps: [
      { t: 0.05, body: B.crouch, board: BD.flat },
      { t: 1, body: B.airRise, board: BD.pop, bodyDy: -1 },
    ],
  },
  airRise: { loop: false, steps: [{ t: 1, body: B.airRise, board: BD.noseUp }] },
  airFall: { loop: false, steps: [{ t: 1, body: B.airFall, board: BD.flat }] },
  // Big air (kicker launch, very high jump): popping off with the nose up, then knees pulled up,
  // the front hand on the nose and the back arm thrown up, the board pulled up to the feet.
  grab: {
    loop: false,
    steps: [
      { t: 0.08, body: B.airRise, board: BD.noseUp, bodyDy: -1 },
      { t: 1, body: B.grab, board: BD.flat, bodyDy: -2, boardDy: -2 },
    ],
  },
  land: {
    loop: false,
    steps: [
      { t: 0.07, body: B.landSquash, board: BD.flat },
      { t: 1, body: B.crouch, board: BD.flat },
    ],
  },
  // Touch-down after a big drop (upper level, launch): a deeper, longer squash (render.ts adds dust).
  hardLand: {
    loop: false,
    steps: [
      { t: 0.1, body: B.landSquash, board: BD.flat, bodyDy: 1 },
      { t: 1, body: B.crouch, board: BD.flat },
    ],
  },
  // Rolling up a kicker before the launch: crouched for the pop, the board tilted up the ramp.
  kicker: { loop: false, steps: [{ t: 1, body: B.crouch, board: BD.noseUp }] },
  // Down through the ollie crouch into the low tuck (cap down, chest on the knees), and back up.
  duck: {
    loop: false,
    steps: [
      { t: DUCK_TRANSITION, body: B.crouch, board: BD.flat },
      { t: 1, body: B.duck, board: BD.flat },
    ],
  },
  standUp: { loop: false, steps: [{ t: 1, body: B.crouch, board: BD.flat }] },
  grind: {
    loop: true,
    steps: [
      { t: 0.3, body: B.grindA, board: BD.flat, bodyDy: GRIND_DY, boardDy: GRIND_DY },
      { t: 0.3, body: B.grindB, board: BD.flat, bodyDy: GRIND_DY, boardDy: GRIND_DY },
    ],
  },
  // Grind trick (down held on the rail): one in-between frame turning to the camera (also on the way
  // back), then the front view, bobbing on the rail like the normal grind.
  grindTurn: { loop: false, steps: [{ t: 1, body: B.grindTurn, board: BD.flat, bodyDy: GRIND_DY, boardDy: GRIND_DY }] },
  grindTrick: {
    loop: true,
    steps: [
      { t: 0.3, body: B.grindFront, board: BD.flat, bodyDy: GRIND_DY, boardDy: GRIND_DY },
      { t: 0.3, body: B.grindFront, board: BD.flat, bodyDy: GRIND_DY + 1, boardDy: GRIND_DY },
    ],
  },
  // Thrown off, board flies ahead and lands, tumble, lie, kneel, back on the board.
  crash: {
    loop: false,
    steps: [
      { t: 0.08, body: B.crashThrown, bodyDx: 2, board: BD.spinA, boardDx: 6, boardDy: -6 },
      { t: 0.08, body: B.crashThrown, bodyDx: 3, board: BD.upsideDown, boardDx: 11, boardDy: -10 },
      { t: 0.1, body: B.crashBall, bodyDx: 4, board: BD.spinB, boardDx: 16, boardDy: -11 },
      { t: 0.1, body: B.crashBall, bodyDx: 5, board: BD.pop, boardDx: 20, boardDy: -8 },
      { t: 0.1, body: B.crashLying, bodyDx: 4, board: BD.upsideDown, boardDx: 28, boardDy: -4 },
      { t: 0.24, body: B.crashLying, bodyDx: 4, board: BD.flat, boardDx: 31 },
      { t: 0.12, body: B.crashKneel, bodyDx: 2, board: BD.flat, boardDx: 20 },
      { t: 0.08, body: B.crashKneel, bodyDx: 1, board: BD.flat, boardDx: 9 },
      { t: 1, body: B.crouch, board: BD.flat },
    ],
  },
  // Head first into the bin on the rolling board, legs kicking (BIN_POP_AT s), then a hop out
  // with the arms up and back onto the board; the bin tumbles away meanwhile (bin.ts).
  binCrash: {
    loop: false,
    steps: [
      { t: 0.06, body: B.binDive, board: BD.flat, bodyDy: -6, bin: true },
      { t: 0.06, body: B.binDive, board: BD.flat, bodyDy: -2, bin: true },
      ...binKicks(8, 0.08),
      { t: 0.1, body: B.airFall, board: BD.flat, bodyDy: -9 },
      { t: 0.08, body: B.airRise, board: BD.flat, bodyDy: -4 },
      { t: 0.06, body: B.landSquash, board: BD.flat },
    ],
  },
};

/** `n` alternating kick frames of `t` seconds, in the bin. */
function binKicks(n: number, t: number): Step[] {
  return Array.from({ length: n }, (_, i) => ({ t, body: i % 2 ? B.binKickB : B.binKickA, board: BD.flat, bin: true }));
}

/** Both crash timelines: the joint, the carried item and the bubble gum are gone meanwhile. */
export function isCrashTimeline(name: TimelineName): boolean {
  return name === 'crash' || name === 'binCrash';
}

export function timelineFor(
  view: Pick<AnimView, 'anim' | 'standingUp'> & Partial<Pick<AnimView, 'binCrash' | 'trick' | 'grab' | 'hardLanding' | 'onKicker'>>,
  vy: number,
): TimelineName {
  if (view.anim === 'crash' && view.binCrash) return 'binCrash';
  if (view.anim === 'grind' && view.trick) return view.trick === 'turn' ? 'grindTurn' : 'grindTrick';
  if ((view.anim === 'air' || view.anim === 'jump') && view.grab) return 'grab';
  if (view.anim === 'air') return vy < 0 ? 'airRise' : 'airFall';
  if (view.anim === 'land' && view.hardLanding) return 'hardLand';
  if (view.onKicker && (view.anim === 'ride' || view.anim === 'push' || view.anim === 'land')) return 'kicker';
  if (view.standingUp && (view.anim === 'ride' || view.anim === 'push')) return 'standUp';
  return view.anim;
}

/** The pose of `timeline` at `time` seconds (looping timelines wrap, others hold the last step). */
export function poseAt(timeline: TimelineName, time: number): Pose {
  const { steps, loop } = TIMELINES[timeline];
  const total = steps.reduce((sum, s) => sum + s.t, 0);
  let t = loop ? time % total : time;
  for (const step of steps) {
    if (t < step.t) return step;
    t -= step.t;
  }
  return steps[steps.length - 1]!;
}
