/**
 * Kicker launches on a jump press (ROADMAP 40): riding onto a kicker no
 * longer launches by itself. An ollie from the street started while the
 * feet are in the kicker's launch window (rules.ts kickerWindow: shortly
 * before the ramp, on it, or right after its lip) arms that kicker; the
 * press itself, a buffered press landing in the window and a press on the
 * ramp all start that ollie. The armed kicker launches when the feet reach
 * its lip (at once for a press past it), whatever the ollie did meanwhile:
 * the `launch` replaces it. Without a press nothing happens: the skater
 * rolls over the kicker (never a crash).
 *
 * The launch speed is aimed with stunt-sim.ts from the real take-off (feet
 * x, height and rise) at the line's next ledge, where the kicker's own
 * launch from its lip would come down, so every press in the window lands
 * where the line was planned for. A kicker without a ledge after it (debug
 * pieces) launches with its own speed.
 */
import { GROUND_Y, TICK_DT } from '../core/config';
import type { Entity, GameContext, GameState } from '../types';
import { isKicker, isLedge } from './catalogue';
import { groundBody, type MutableBody, copyBody } from './jumpsim';
import { kickerWindow, launchVelocityFor } from './rules';
import { kickerLaunchSpeed } from './stunt-sim';

/** Ledge height a kicker without line data launches for (debug-placed pieces). */
export const DEFAULT_LEDGE_HEIGHT = 48;

const num = (e: Entity, key: string): number => {
  const v = e.data?.[key];
  return typeof v === 'number' ? v : 0;
};

/** A kicker's own launch speed (its `data.velocity`, else the default ledge height's). */
export function kickerVelocity(e: Entity): number {
  const v = e.data?.velocity;
  return typeof v === 'number' ? v : launchVelocityFor(DEFAULT_LEDGE_HEIGHT);
}

/** The first kicker not launched yet whose launch window holds the feet at `x`, or null. */
function kickerAround(state: GameState, x: number): Entity | null {
  const entities = state.entities;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;
    if (!isKicker(e.kind) || e.done) continue;
    const w = kickerWindow(e, state.speed);
    if (x >= w.start && x <= w.end) return e;
  }
  return null;
}

/** The ledge after `kicker` in its line, or null. */
function ledgeAfter(state: GameState, kicker: Entity): Entity | null {
  const line = num(kicker, 'line');
  const step = num(kicker, 'step');
  if (line === 0) return null;
  return state.entities.find((e) => isLedge(e.kind) && num(e, 'line') === line && num(e, 'step') === step + 1) ?? null;
}

const body: MutableBody = copyBody(groundBody());

/** The launch speed off `kicker` for the skater as it is now. */
function launchSpeed(state: GameState, kicker: Entity): number {
  const velocity = kickerVelocity(kicker);
  const ledge = ledgeAfter(state, kicker);
  const step = state.speed * TICK_DT;
  if (!ledge || step <= 0) return velocity;
  const p = state.player;
  body.y = p.y;
  body.vy = p.vy;
  body.grounded = p.grounded;
  return kickerLaunchSpeed(body, p.x, step, kicker, velocity, ledge);
}

export class KickerLaunch {
  /** The player ollied from the street this tick (its jump event). */
  private ollied = false;
  /** Id of the kicker an ollie in its window armed, or -1. */
  private armed = -1;

  reset(): void {
    this.ollied = false;
    this.armed = -1;
  }

  /** The player's `jump` event: an ollie from the street arms the kicker whose window the feet are in (not a jump off a rail or ledge). */
  jumped(state: GameState): void {
    if (GROUND_Y - state.player.y < 1) this.ollied = true;
  }

  /** Every playing tick after the scroll: the kicker that launches the skater now, with the launch speed, or null. */
  update(ctx: GameContext): { kicker: Entity; velocity: number } | null {
    const { state } = ctx;
    const ollied = this.ollied;
    this.ollied = false;
    const p = state.player;
    const kicker = p.state === 'crash' ? null : kickerAround(state, p.x);
    if (!kicker) {
      this.armed = -1;
      return null;
    }
    if (ollied) this.armed = kicker.id;
    if (this.armed !== kicker.id || p.x < kickerWindow(kicker, state.speed).lip) return null;
    this.armed = -1;
    return { kicker, velocity: launchSpeed(state, kicker) };
  }
}
