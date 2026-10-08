/**
 * Flights of the skater around stunt pieces, simulated with jumpsim.ts and
 * the stunt rules (rules.ts), in pattern space (x grows along the street; the
 * skater moves right by `step` px per tick). The line planner (stunt-line.ts)
 * places ledges with it, and the stunt bot (stunt-bot.ts) aims its gap jumps
 * with it. DOM-free and allocation-light.
 *
 * Tick order mirrors the live game: the player moves (stepBody at the x
 * before this tick's scroll), the street scrolls (`x += step`), then
 * gameplay's contacts look at the feet.
 */
import { TICK_DT } from '../core/config';
import type { Rect } from '../types';
import { type Body, copyBody, groundBody, type MutableBody, railBody, stepBodyInto } from './jumpsim';
import { landsOnHighLedge } from './rules';

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
