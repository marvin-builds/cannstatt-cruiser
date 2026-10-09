/**
 * Flights of the skater around stunt pieces, simulated with jumpsim.ts and
 * the stunt rules (rules.ts), in pattern space (x grows along the street; the
 * skater moves right by `step` px per tick). The line planner (stunt-line.ts)
 * places ledges with it, the stunt bot (stunt-bot.ts) aims its gap jumps
 * with it, and kicker-launch.ts aims every kicker launch with it (the same
 * pattern-space flights work in screen space: the street scrolls, the feet
 * stay). DOM-free and allocation-light.
 *
 * Tick order mirrors the live game: the player moves (stepBody at the x
 * before this tick's scroll), the street scrolls (`x += step`), then
 * gameplay's contacts look at the feet.
 */
import { GROUND_Y, TICK_DT } from '../core/config';
import { GRAVITY } from '../player/tuning';
import type { Rect } from '../types';
import { type Body, copyBody, groundBody, launchBody, type MutableBody, railBody, stepBodyInto } from './jumpsim';
import { kickerWindow, landsOnHighLedge, STUNT_MAGNET_FRONT } from './rules';

/** Longest flight simulated (ticks): far more than any launch or jump lasts. */
const MAX_FLIGHT = 240;

const feet = { x: 0, y: 0, vy: 0, supported: false };

function feetAt(b: Body, x: number) {
  feet.x = x;
  feet.y = b.y;
  feet.vy = b.vy;
  feet.supported = b.grounded || b.onRail;
  return feet;
}

/** Where a flight ended: on a ledge (its index in `ledges`) or the street (-1), at pattern x `x` after `ticks`. */
export interface Landing {
  ledge: number;
  x: number;
  ticks: number;
}

/**
 * Flies `body` from pattern x `x` (feet, after the last scroll) until it is
 * supported again: on one of `ledges` (with the magnet) or the street.
 * `press`/`hold`: the action goes down `press` ticks from now (-1 = never)
 * and stays down `hold` ticks. A press that comes when the body is not
 * supported does nothing (no coyote time: conservative).
 */
export function fly(body: Body, x: number, step: number, ledges: readonly Rect[], press = -1, hold = 0): Landing {
  const b: MutableBody = copyBody(body);
  let px = x;
  for (let t = 0; t < MAX_FLIGHT; t++) {
    stepBodyInto(b, b, px, t === press, t >= press && t < press + hold);
    px += step;
    if (b.grounded) return { ledge: -1, x: px, ticks: t + 1 };
    if (b.onRail) continue;
    const f = feetAt(b, px);
    for (let i = 0; i < ledges.length; i++) {
      if (landsOnHighLedge(f, ledges[i]!)) return { ledge: i, x: px, ticks: t + 1 };
    }
  }
  return { ledge: -1, x: px, ticks: MAX_FLIGHT };
}

/** A body that a kicker just launched (it takes off on the next step). */
export function launched(velocity: number): Body {
  const b = copyBody(groundBody());
  b.bounce = velocity;
  return b;
}

/** An aimed launch may top out this much (px) higher than its kicker's own launch. */
const AIM_HEADROOM = 6;
const aimDeck: Rect[] = [{ x: -1e9, y: 0, w: 2e9, h: 0 }];

/**
 * The launch speed (from the street, as the `launch` event carries it) for a
 * skater (`body`, feet at pattern x `x`, the launch taking off on the next
 * step) whose flight comes down onto `ledge` closest to pattern x `target`:
 * from the speed whose apex just reaches the deck up to the kicker's own
 * `velocity` plus AIM_HEADROOM (higher speeds come down further: a bisection
 * on where the arc meets the deck's height). `velocity` when none lands on it.
 */
function aimLaunch(body: Body, x: number, step: number, ledge: Rect, velocity: number, target: number): number {
  aimDeck[0]!.y = ledge.y;
  /** Where the arc comes down to the deck's height (-Infinity: it never gets up there). */
  const downAt = (v: number) => {
    const landing = fly(launchBody(body, v), x, step, aimDeck);
    return landing.ledge === 0 ? landing.x : -Infinity;
  };
  const onLedge = (at: number) => at >= ledge.x - STUNT_MAGNET_FRONT && at <= ledge.x + ledge.w;
  let lo = Math.ceil(Math.sqrt(2 * GRAVITY * (GROUND_Y - ledge.y)));
  let hi = Math.floor(Math.sqrt(velocity * velocity + 2 * GRAVITY * AIM_HEADROOM));
  if (lo > hi) return velocity;
  // The slowest speed that comes down at or past the target...
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (downAt(mid) >= target) hi = mid;
    else lo = mid + 1;
  }
  // ...or the one just below it, whichever comes down closer on the ledge.
  let best = velocity;
  let bestMiss = Infinity;
  for (const v of [lo, lo - 1]) {
    const at = downAt(v);
    if (onLedge(at) && Math.abs(at - target) < bestMiss) {
      bestMiss = Math.abs(at - target);
      best = v;
    }
  }
  return best;
}

/** Where the launch of `kicker` (its own launch speed `velocity`) from the street at its lip comes down onto `ledge` at `step`, or null if it misses. */
function lipLanding(kicker: Rect, velocity: number, ledge: Rect, step: number): number | null {
  const landing = fly(launched(velocity), kickerWindow(kicker, step / TICK_DT).lip, step, [ledge]);
  return landing.ledge === 0 ? landing.x : null;
}

/**
 * The launch speed for a skater (`body`, feet at x) pressing off `kicker`
 * onto `ledge` (all in one space): aimed at where the kicker's own launch
 * from its lip would come down (the line's design), so a press early, late
 * or from an ollie lands where the line expects.
 */
export function kickerLaunchSpeed(body: Body, x: number, step: number, kicker: Rect, velocity: number, ledge: Rect): number {
  const target = lipLanding(kicker, velocity, ledge, step) ?? ledge.x + ledge.w / 4;
  return aimLaunch(body, x, step, ledge, velocity, target);
}

/** The jump presses in a kicker's launch window and how many of their launches came down on the ledge. */
export interface LaunchWindow {
  presses: number;
  landed: number;
}

/**
 * Every jump press in `kicker`'s launch window, the way the live game judges
 * it (kicker-launch.ts): the skater rides the street (feet starting `phase`
 * of a tick past a few ticks before the window), presses on one tick with
 * `hold`; the ollie arms the kicker when the feet are in the window after
 * that tick's scroll, and the launch (kickerLaunchSpeed) goes off once the
 * feet reach the lip. Counts the presses and the launches that land on `ledge`.
 */
export function launchWindow(kicker: Rect, velocity: number, ledge: Rect, step: number, hold: number, phase = 0): LaunchWindow {
  const w = kickerWindow(kicker, step / TICK_DT);
  const x0 = w.start - 3 * step + phase * step;
  const result = { presses: 0, landed: 0 };
  for (let press = 0; ; press++) {
    const armedAt = x0 + (press + 1) * step;
    if (armedAt > w.end) break;
    if (armedAt < w.start) continue;
    result.presses++;
    if (pressLanding(kicker, velocity, ledge, step, x0, press, hold) === 0) result.landed++;
  }
  return result;
}

/** The ledge index (0 = `ledge`, -1 = the street) where a press `press` ticks after riding from `x0` comes down after its launch. */
function pressLanding(kicker: Rect, velocity: number, ledge: Rect, step: number, x0: number, press: number, hold: number): number {
  const lip = kickerWindow(kicker, step / TICK_DT).lip;
  const b: MutableBody = copyBody(groundBody());
  let px = x0;
  for (let t = 0; t < MAX_FLIGHT; t++) {
    stepBodyInto(b, b, px, t === press, t >= press && t < press + hold);
    px += step;
    if (t >= press && px >= lip) {
      const launch = launchBody(b, kickerLaunchSpeed(b, px, step, kicker, velocity, ledge));
      return fly(launch, px, step, [ledge]).ledge;
    }
  }
  return -1;
}

/** A body grinding `ledge` (pattern space). */
export function onLedge(ledge: Rect): Body {
  return railBody(ledge.y, ledge.x + ledge.w);
}

/** Take-off ticks of one hold whose jump from a ledge lands on the target. */
export interface Window {
  hold: number;
  /** First and last take-off tick (counted from the arrival on the ledge) of the widest run. */
  from: number;
  to: number;
}

export const windowTicks = (w: Window | null): number => (w ? w.to - w.from + 1 : 0);

/**
 * The widest run of consecutive take-off ticks, over `holds`, at which a jump
 * from `from` (grinding it at pattern x `x`) lands on `target` at `step` px
 * per tick. Take-offs are tried until the skater rolls off the end. Landing
 * back on `from` or on the street does not count. `work` is called with the
 * ticks simulated (for a work budget). With `enough` the search stops at the
 * first run that long (a yes/no check needs no more).
 */
export function jumpWindow(
  from: Rect,
  x: number,
  step: number,
  target: Rect,
  holds: readonly number[],
  work?: (ticks: number) => void,
  enough = Infinity,
): Window | null {
  const ledges = [target, from];
  const body = onLedge(from);
  const end = from.x + from.w;
  let best: Window | null = null;
  for (const hold of holds) {
    let run = 0;
    for (let t = 0; ; t++) {
      // The press is applied at the x before that tick's scroll: past the end the skater already fell.
      const takeoffX = x + t * step;
      const onIt = takeoffX <= end;
      const landing = onIt ? fly(body, x, step, ledges, t, hold) : null;
      work?.(landing ? landing.ticks : 1);
      if (landing && landing.ledge === 0) {
        if (++run >= enough) return { hold, from: t - run + 1, to: t };
      } else if (run > 0) {
        if (run > windowTicks(best)) best = { hold, from: t - run, to: t - 1 };
        run = 0;
      }
      if (!onIt) break;
    }
  }
  return best;
}

/** The middle take-off of a window and where its jump lands. */
export function windowMiddle(w: Window): number {
  return w.from + Math.floor((w.to - w.from) / 2);
}

/** Feet path (pattern x, screen y) of a flight, for star trails: every tick until supported. */
export function flightPath(body: Body, x: number, step: number, press = -1, hold = 0): { x: number; y: number }[] {
  const b: MutableBody = copyBody(body);
  const path: { x: number; y: number }[] = [];
  let px = x;
  for (let t = 0; t < MAX_FLIGHT; t++) {
    stepBodyInto(b, b, px, t === press, t >= press && t < press + hold);
    px += step;
    if (b.grounded) break;
    if (!b.onRail) path.push({ x: px, y: b.y });
  }
  return path;
}

/** Scroll per tick at `speed`. */
export const stepOf = (speed: number): number => speed * TICK_DT;
