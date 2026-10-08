/**
 * The thrown football (entity kind 'ball'): it leaves the skater's hands
 * flying forward in a flat arc. If it reaches a person (VfB fan, Wasen
 * visitor), the person tumbles like after a stomp (knockOver), gameplay
 * scores BALL_HIT_POINTS and emits ballHit, and the ball drops away. If it
 * lands without a hit, the seeded gameplay rng decides (RICOCHET_CHANCE)
 * whether it ricochets back: a low, bouncing ball rolling at the skater
 * that knocks him off the board (a normal crash of kind 'ball') unless he
 * jumps over it or is invulnerable. It only ricochets onto free street (no
 * obstacle within RICOCHET_ROOM_SECONDS of riding around where it meets the
 * skater, see ricochetRoom) and never while he is drunk; otherwise it rolls
 * away harmlessly.
 *
 * Velocities are street-relative (data.vx, px/s, + = forward); the gameplay
 * system scrolls the ball with the street like every entity, so its screen
 * motion is vx minus the scroll speed. Deterministic and allocation-free per
 * tick.
 */
import { GROUND_Y, PLAYER_X } from '../core/config';
import type { Entity, GameContext, ObstacleKind, Rect } from '../types';
import { hitBoxInto, isPerson } from './catalogue';
import { crashInto } from './health';
import { overlaps } from './rules';
import { addPoints } from './scoring';
import { knockOver } from './stomp';
import type { Point } from './toss';

/** Width and height of the ball (the football sprite). */
export const BALL_SIZE = 5;
/** Throw speed forward, relative to the skater (px/s). */
const THROW_VX = 200;
/** Upward start speed of the throw (px/s, negative = up): a flat arc that stays at body height. */
const THROW_VY = -75;
const BALL_GRAVITY = 380;
/** Points for hitting a person (times the multiplier). */
export const BALL_HIT_POINTS = 150;
/** Chance that a missed ball ricochets back (if the street allows it). */
const RICOCHET_CHANCE = 0.5;
/** Street speed of the ricochet towards the skater (px/s). */
const BACK_VX = 50;
/** Upward speed of each hop of the ricochet: a low bounce a single jump clears. */
const BOUNCE_VY = 80;
/** A ball rolling away: forward speed over the skater's right after landing, and how fast it stops. */
const ROLL_VX = 40;
const ROLL_FRICTION = 120;
/** Free street (in seconds of riding) before and after the point where a ricochet meets the skater. */
export const RICOCHET_ROOM_SECONDS = 1;

/** fly: thrown, can hit people; back: ricochet at the skater; away: harmless (rolling or lying). */
type BallPhase = 'fly' | 'back' | 'away';

/** Is the street free of obstacles and rails between screen x `from` and `to`? */
export type StreetCheck = (from: number, to: number) => boolean;

/** A new ball entity leaving `hands` (screen space); `speed` is the current scroll speed. */
export function newBall(id: number, hands: Point, speed: number): Entity {
  const half = Math.floor(BALL_SIZE / 2);
  return {
    id,
    kind: 'ball',
    x: hands.x - half,
    y: hands.y - half,
    w: BALL_SIZE,
    h: BALL_SIZE,
    done: false,
    data: { phase: 'fly', vx: speed + THROW_VX, vy: THROW_VY },
  };
}

/**
 * The screen x range (now) that has to be free of obstacles for a ricochet
 * from `ballX`: RICOCHET_ROOM_SECONDS of riding on both sides of where it
 * meets the skater, shifted by the street that scrolls in until then.
 */
export function ricochetRoom(ballX: number, speed: number): [number, number] {
  const meetIn = Math.max(0, ballX - PLAYER_X) / (BACK_VX + speed);
  const room = RICOCHET_ROOM_SECONDS * speed;
  const shift = speed * meetIn;
  return [PLAYER_X - room + shift, PLAYER_X + room + shift];
}

/** Moves every ball one tick (after the scroll) and resolves its hits. */
export function updateBalls(ctx: GameContext, dt: number, streetFree: StreetCheck): void {
  const entities = ctx.state.entities;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;
    if (e.kind === 'ball') stepBall(ctx, e, dt, streetFree);
  }
}

function stepBall(ctx: GameContext, ball: Entity, dt: number, streetFree: StreetCheck): void {
  const d = ball.data!;
  const vx = d.vx as number;
  d.vy = (d.vy as number) + BALL_GRAVITY * dt;
  ball.x += vx * dt;
  ball.y += d.vy * dt;
  const grounded = ball.y + ball.h >= GROUND_Y;
  if (grounded) ball.y = GROUND_Y - ball.h;
  switch (d.phase as BallPhase) {
    case 'fly':
      if (!hitPerson(ctx, ball) && grounded) land(ctx, ball, streetFree);
      return;
    case 'back':
      if (grounded) d.vy = -BOUNCE_VY;
      if (!ball.done) hitSkater(ctx, ball);
      return;
    case 'away':
      if (grounded) {
        d.vy = 0;
        d.vx = vx > 0 ? Math.max(0, vx - ROLL_FRICTION * dt) : Math.min(0, vx + ROLL_FRICTION * dt);
      }
      return;
  }
}

const personBox: Rect = { x: 0, y: 0, w: 0, h: 0 };

/** A flying ball reaching a person knocks them over; the ball drops where it is. */
function hitPerson(ctx: GameContext, ball: Entity): boolean {
  const { state } = ctx;
  const entities = state.entities;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;
    if (e.done || !isPerson(e.kind) || !overlaps(ball, hitBoxInto(e as Entity & { kind: ObstacleKind }, personBox))) continue;
    knockOver(e, state.time);
    addPoints(state, ctx.bus, BALL_HIT_POINTS);
    ctx.bus.emit('ballHit', { entityId: e.id, kind: e.kind });
    rollAway(ball, 0, Math.max(0, ball.data!.vy as number));
    return true;
  }
  return false;
}

/** A miss lands: ricochet back (rng, only onto free street and never while drunk) or roll away. */
function land(ctx: GameContext, ball: Entity, streetFree: StreetCheck): void {
  const { state } = ctx;
  // Always drawn, so the rng sequence does not depend on the street.
  const lucky = ctx.rng.chance(RICOCHET_CHANCE);
  const [from, to] = ricochetRoom(ball.x, state.speed);
  if (lucky && state.drunkTimer <= 0 && streetFree(from, to)) {
    ball.data!.phase = 'back';
    ball.data!.vx = -BACK_VX;
    ball.data!.vy = -BOUNCE_VY;
    ctx.bus.emit('ballBack', { entityId: ball.id });
  } else {
    rollAway(ball, state.speed + ROLL_VX, 0);
  }
}

function rollAway(ball: Entity, vx: number, vy: number): void {
  ball.done = true;
  ball.data!.phase = 'away';
  ball.data!.vx = vx;
  ball.data!.vy = vy;
}

/** The ricochet touches the skater: a crash (ignored while invulnerable); once past him it is harmless. */
function hitSkater(ctx: GameContext, ball: Entity): void {
  const body = ctx.state.player.hitbox;
  if (overlaps(ball, body)) {
    ball.done = true;
    crashInto(ctx, ball);
  } else if (ball.x + ball.w < body.x) ball.done = true;
}
