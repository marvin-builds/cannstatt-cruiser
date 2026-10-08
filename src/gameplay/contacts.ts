/**
 * Per-tick contacts between the player's hitbox and the entities: rail and
 * bench landings (grindStart; coming down anywhere on the bench top, from its
 * front corner to its rear end, grinds, and landing behind it never crashes),
 * stomps on people's heads, crashes (a bin that swallows the skater leaves the
 * street at once), clean clears, star and joint pickups.
 * Uses the same rules as the clearability solver (rules.ts). Runs every
 * tick, so it reuses scratch objects instead of allocating.
 */
import type { Entity, GameContext, ObstacleKind, PlayerState, Rect } from '../types';
import { collectJoints } from './chill';
import { GRIND_LANDING_POINTS, hitBoxInto, isGrindable, isObstacle, isPerson, isRail, OBSTACLES } from './catalogue';
import { crashInto } from './health';
import { feetOf, LEDGE_FRONT_REACH, landsOnLedge, landsOnRail, overlaps, pastLedge } from './rules';
import { addPoints, addTrick } from './scoring';
import { stompPeople } from './stomp';

export function isLive(e: Entity): boolean {
  return !e.data?.debugRail;
}

export function resolveContacts(ctx: GameContext): void {
  landOnRails(ctx);
  stompPeople(ctx);
  checkObstacles(ctx);
  collectStars(ctx);
  collectJoints(ctx);
}

const box: Rect = { x: 0, y: 0, w: 0, h: 0 };
const swallowed: Entity[] = [];

function landOnRails(ctx: GameContext): void {
  const f = feetOf(ctx.state.player);
  const entities = ctx.state.entities;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;
    if (!isLive(e) || !isGrindable(e.kind) || e.done) continue;
    if (!(isRail(e.kind) ? landsOnRail(f, e) : landsOnLedge(f, e))) continue;
    ctx.bus.emit('grindStart', { entityId: e.id });
    if (ctx.state.player.grinding) addTrick(ctx.state, ctx.bus, GRIND_LANDING_POINTS);
    return;
  }
}

function checkObstacles(ctx: GameContext): void {
  const { state } = ctx;
  const body = state.player.hitbox;
  swallowed.length = 0;
  for (const e of state.entities) {
    if (e.done || !isLive(e) || !isObstacle(e.kind) || ridesOn(state.player, e)) continue;
    hitBoxInto(e as Entity & { kind: ObstacleKind }, box);
    if (overlaps(body, box) && !(isGrindable(e.kind) && pastLedge(state.player.x, e))) {
      // Hit (or brushed while invulnerable): never counts as a clear.
      e.done = true;
      if (!crashInto(ctx, e)) continue;
      if (isPerson(e.kind)) e.data = { ...e.data, hit: true };
      if (OBSTACLES[e.kind as ObstacleKind].swallows) swallowed.push(e);
    } else if (box.x + box.w <= body.x) {
      e.done = true;
      // Ducked under on the ground: points, but no trick in an airborne chain.
      const base = OBSTACLES[e.kind as ObstacleKind].points;
      const points = state.player.grounded ? addPoints(state, ctx.bus, base) : addTrick(state, ctx.bus, base);
      ctx.bus.emit('obstacleCleared', { entityId: e.id, kind: e.kind, points });
    }
  }
  // The skater now sticks in it (drawn by the player): it leaves the street.
  for (const e of swallowed) state.entities.splice(state.entities.indexOf(e), 1);
  swallowed.length = 0;
}

/** The player grinds on top of this bench (it never crashes into the one it rides). */
function ridesOn(p: PlayerState, e: Entity): boolean {
  return p.grinding && isGrindable(e.kind) && p.y === e.y && p.x >= e.x - LEDGE_FRONT_REACH && p.x <= e.x + e.w;
}

function collectStars(ctx: GameContext): void {
  const { state } = ctx;
  const body = state.player.hitbox;
  const entities = state.entities;
  for (let i = 0; i < entities.length; i++) {
    const star = entities[i]!;
    if (star.kind !== 'star' || !overlaps(body, star)) continue;
    state.stars += 1;
    // Emitted while the star is still there (the sparkle starts at it).
    ctx.bus.emit('starCollected', { entityId: star.id, stars: state.stars });
    entities.splice(i, 1);
    i--;
  }
}
