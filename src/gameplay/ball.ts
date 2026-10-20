/**
 * The thrown football (entity kind 'ball'): it leaves the skater's hands
 * flying forward in a flat arc. If it reaches a person (VfB fan, Wasen
 * visitor), the person tumbles like after a stomp, scores BALL_HIT_POINTS
 * and emits obstacleCleared and ballHit (ball-knock.ts knockDown), and the
 * ball drops away. At a fan crowd (crowd.ts) it knocks over the front fans,
 * more from close by, as many as leave the rest fair (ball-knock.ts
 * knockCrowd); when none may fall, it drops in front of the first fan. If it
 * lands without a hit, the
 * seeded gameplay rng decides (RICOCHET_CHANCE) whether it ricochets back:
 * a low, bouncing ball rolling at the skater that knocks him off the board
 * (a normal crash of kind 'ball') unless he jumps over it or is
 * invulnerable. It only ricochets onto free street (no
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
import { knockCrowd, knockDown, toppleDue } from './ball-knock';
import { hitBoxInto, isPerson } from './catalogue';
import { crowdOf } from './crowd-tag';
import { crashInto } from './health';
import { overlaps } from './rules';
import type { Point } from './toss';

export { BALL_HIT_POINTS } from './ball-knock';

/** Width and height of the ball (the football sprite). */
export const BALL_SIZE = 5;
/** Throw speed forward, relative to the skater (px/s). */
const THROW_VX = 200;
/** Upward start speed of the throw (px/s, negative = up): a flat arc that stays at body height. */
const THROW_VY = -75;
const BALL_GRAVITY = 380;
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
    data: { phase: 'fly', vx: speed + THROW_VX, vy: THROW_VY, flown: 0 },
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

/** Moves every ball one tick (after the scroll) and resolves its hits, also the crowd fans still to fall. */
export function updateBalls(ctx: GameContext, dt: number, streetFree: StreetCheck): void {
  toppleDue(ctx);
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
      d.flown = (d.flown as number) + vx * dt;
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

/**
 * A flying ball reaching a person knocks them over (at a crowd: its front,
 * see knockCrowd); the ball drops where it is. A crowd catches it at any
 * height (raised arms, the flag): a ball over the heads never knocks a hole
 * into the row behind its front.
 */
function hitPerson(ctx: GameContext, ball: Entity): boolean {
  const entities = ctx.state.entities;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;
    if (e.done || !isPerson(e.kind)) continue;
    hitBoxInto(e as Entity & { kind: ObstacleKind }, personBox);
    if (crowdOf(e)) {
      personBox.h += personBox.y;
      personBox.y = 0;
    }
    if (!overlaps(ball, personBox)) continue;
    if (!crowdOf(e)) knockDown(ctx, e);
    // Blocked by a crowd where nobody may fall: it drops in front of the first fan, not into the crowd.
    else if (knockCrowd(ctx, e, ball.data!.flown as number) === 0) ball.x = Math.min(ball.x, personBox.x - ball.w);
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
