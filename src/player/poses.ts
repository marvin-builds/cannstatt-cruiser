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
}

interface Step extends Pose {
  /** Seconds this pose is shown. */
  t: number;
}

interface Timeline {
  steps: Step[];
  loop: boolean;
}

export type TimelineName = Exclude<PlayerAnim, 'air'> | 'airRise' | 'airFall' | 'standUp';

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
  land: {
    loop: false,
    steps: [
      { t: 0.07, body: B.landSquash, board: BD.flat },
      { t: 1, body: B.crouch, board: BD.flat },
    ],
  },
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
};

export function timelineFor(view: AnimView, vy: number): TimelineName {
  if (view.anim === 'air') return vy < 0 ? 'airRise' : 'airFall';
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
