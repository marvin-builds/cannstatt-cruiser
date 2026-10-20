/**
 * Who the thrown football (ball.ts) knocks over (GitHub issue #11, ROADMAP
 * 90): a single person, or the front of a fan crowd (crowd.ts).
 *
 * Every person knocked over tumbles like after a stomp (knockOver), scores
 * BALL_HIT_POINTS and emits obstacleCleared and ballHit for that person in
 * the same tick (the ui merges both into one "Treffer! +…" popup; gameplay
 * drops the person's item onto free street, drop.ts).
 *
 * At a crowd the ball's force decides how many fans fall: throwForce from
 * the street the ball flew (a close throw is stronger: KNOCK_MOST fans from
 * up to CLOSE_THROW px, 2 up to FAR_THROW, 1 from further). They fall front
 * to back, KNOCK_STAGGER_SECONDS apart, like dominoes: all of them are
 * harmless (done) from the hit on, each tumbles, scores and emits at its own
 * tick (toppleDue, `data.fallsAt`). The rest stands.
 *
 * Fairness (knockCount): a crowd shortened from the front is crossed like a
 * shorter crowd, but with less run-up to its first standing head. A player
 * needs REACT_SECONDS to see what fell (it covers the stagger), and from
 * then on (or from the landing, worst case holding on, when in the air) at
 * least KNOCK_LEAD_SECONDS of run-up to the first standing head:
 * ball-knock.test.ts proves with the solver that 1-5 heads with that run-up
 * are human-fair at every speed, and the human bot crosses after throws
 * from far, close and in the air. More fans fallen only lengthens that
 * run-up, so when the wanted count leaves too little, more fall (up to
 * KNOCK_MOST); when no count does, nobody falls and the ball drops in front
 * of the crowd as planned (which was fair before the throw). Nobody falls
 * either on a rail, or while the skater is still over a standing fan in
 * front of the one the ball reached (a stomp there would bounce him on into
 * the gap). A crowd catches the ball at any height (ball.ts), so only the
 * front of the row ever falls, never a hole in it.
 */
import { TICK_DT } from '../core/config';
import type { Entity, GameContext, PlayerState } from '../types';
import { crowdOf } from './crowd-tag';
import { groundBody, type MutableBody, stepBodyInto } from './jumpsim';
import { addPoints } from './scoring';
import { knockOver } from './stomp';

/** Points for hitting a person (times the multiplier). */
export const BALL_HIT_POINTS = 150;
/** The most fans one throw knocks over. */
export const KNOCK_MOST = 3;
/** Street px the ball flew up to which it knocks over KNOCK_MOST fans. */
export const CLOSE_THROW = 70;
/** Street px the ball flew up to which it knocks over 2 fans (1 from further). */
export const FAR_THROW = 120;
/** Seconds between two fans falling. */
export const KNOCK_STAGGER_SECONDS = 0.08;
/** Seconds a player needs to see which fans fell. */
export const REACT_SECONDS = 0.2;
/** Run-up (seconds of riding) to the first standing head a player needs after rethinking. */
export const KNOCK_LEAD_SECONDS = 0.5;
/** The entity data field of a fan due to fall (run time). */
const FALLS_AT = 'fallsAt';
/** Ticks a landing prediction looks ahead at most. */
const MAX_AIR_TICKS = 240;

/** What knockCount needs to know of the player. */
export type Rider = Pick<PlayerState, 'x' | 'y' | 'vy' | 'grounded' | 'grinding'>;

/** How many fans a throw that flew `flown` street px wants to knock over. */
export function throwForce(flown: number): number {
  if (flown <= CLOSE_THROW) return KNOCK_MOST;
  return flown <= FAR_THROW ? 2 : 1;
}

const air: MutableBody = { ...groundBody() };

/** Seconds until the rider is back on the ground, holding on as long as a jump allows (the latest landing). */
export function landingIn(rider: Rider): number {
  if (rider.grounded) return 0;
  Object.assign(air, groundBody(), { y: rider.y, vy: rider.vy, grounded: false, boosting: rider.vy < 0 });
  let ticks = 0;
  while (!air.grounded && ticks < MAX_AIR_TICKS) {
    stepBodyInto(air, air, 0, false, true);
    ticks++;
  }
  return ticks * TICK_DT;
}

/**
 * How many of the standing fans at screen x `fronts` (front to back) fall:
 * `want`, or more up to KNOCK_MOST when that is what leaves the rider a fair
 * run-up (see the module comment), all of them when no more stand, or 0.
 */
export function knockCount(want: number, fronts: readonly number[], rider: Rider, speed: number): number {
  if (rider.grinding) return 0;
  const from = Math.max(REACT_SECONDS, landingIn(rider)) + KNOCK_LEAD_SECONDS;
  for (let k = Math.min(want, KNOCK_MOST); k <= KNOCK_MOST; k++) {
    if (k >= fronts.length) return fronts.length;
    if (fronts[k]! - rider.x >= from * speed) return k;
  }
  return 0;
}

/** The ball knocks `e` over: it tumbles, scores and emits obstacleCleared and ballHit (same tick, one popup). */
export function knockDown(ctx: GameContext, e: Entity): void {
  const { state } = ctx;
  knockOver(e, state.time);
  const points = addPoints(state, ctx.bus, BALL_HIT_POINTS);
  ctx.bus.emit('obstacleCleared', { entityId: e.id, kind: e.kind, points });
  ctx.bus.emit('ballHit', { entityId: e.id, kind: e.kind });
}

const standing: Entity[] = [];
const fronts: number[] = [];

/**
 * The ball reached `first`, the front standing fan of a crowd, after flying
 * `flown` street px: knocks over the front of the crowd (knockCount) and
 * returns how many fall (0: the crowd blocks the ball).
 */
export function knockCrowd(ctx: GameContext, first: Entity, flown: number): number {
  const { state } = ctx;
  const theme = crowdOf(first);
  const behind = state.player.hitbox.x;
  standing.length = 0;
  for (const e of state.entities) {
    if (e.done || crowdOf(e) !== theme || e.x + e.w <= behind) continue;
    // A fan the skater is still over (the ball started past it): a stomp there would bounce him on into the gap.
    if (e.x < first.x) return 0;
    standing.push(e);
  }
  standing.sort((a, b) => a.x - b.x);
  fronts.length = 0;
  for (const e of standing) fronts.push(e.x);
  const k = knockCount(throwForce(flown), fronts, state.player, state.speed);
  for (let i = 0; i < k; i++) {
    const fan = standing[i]!;
    fan.done = true;
    fan.data = { ...fan.data, [FALLS_AT]: state.time + i * KNOCK_STAGGER_SECONDS };
  }
  standing.length = 0;
  toppleDue(ctx);
  return k;
}

/** Knocks down every fan whose turn in a domino has come (call every tick). */
export function toppleDue(ctx: GameContext): void {
  const { state } = ctx;
  const entities = state.entities;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;
    const at = e.data?.[FALLS_AT];
    if (typeof at !== 'number' || at > state.time + 1e-9 || typeof e.data!.stompedAt === 'number') continue;
    knockDown(ctx, e);
  }
}
