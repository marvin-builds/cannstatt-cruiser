/**
 * Per-tick contacts between the player's hitbox and the entities: rail and
 * bench landings (grindStart; coming down anywhere on the bench top, from its
 * front corner to its rear end, grinds, and landing behind it never crashes),
 * stomps on people's heads, crashes (a bin that swallows the skater leaves the
 * street at once), clean clears, star and joint pickups.
 * Uses the same rules as the clearability solver (rules.ts).
 */
import type { Entity, GameContext, ObstacleKind, PlayerState } from '../types';
import { collectJoints } from './chill';
import { GRIND_LANDING_POINTS, hitBox, isGrindable, isObstacle, isPerson, isRail, OBSTACLES } from './catalogue';
import { crashInto } from './health';
import { LEDGE_FRONT_REACH, landsOnLedge, landsOnRail, overlaps, pastLedge } from './rules';
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

function landOnRails(ctx: GameContext): void {
  const p = ctx.state.player;
  const feet = { x: p.x, y: p.y, vy: p.vy, supported: p.grounded || p.grinding };
  const lands = (e: Entity) => (isRail(e.kind) ? landsOnRail(feet, e) : landsOnLedge(feet, e));
  const rail = ctx.state.entities.find((e) => isLive(e) && isGrindable(e.kind) && !e.done && lands(e));
  if (!rail) return;
  ctx.bus.emit('grindStart', { entityId: rail.id });
  if (ctx.state.player.grinding) addTrick(ctx.state, ctx.bus, GRIND_LANDING_POINTS);
}

function checkObstacles(ctx: GameContext): void {
  const { state } = ctx;
  const body = state.player.hitbox;
  const swallowed: Entity[] = [];
  for (const e of state.entities) {
    if (e.done || !isLive(e) || !isObstacle(e.kind) || ridesOn(state.player, e)) continue;
    const box = hitBox({ ...e, kind: e.kind });
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
}

/** The player grinds on top of this bench (it never crashes into the one it rides). */
function ridesOn(p: PlayerState, e: Entity): boolean {
  return p.grinding && isGrindable(e.kind) && p.y === e.y && p.x >= e.x - LEDGE_FRONT_REACH && p.x <= e.x + e.w;
}

function collectStars(ctx: GameContext): void {
  const { state } = ctx;
  const body = state.player.hitbox;
  const picked = state.entities.filter((e) => e.kind === 'star' && overlaps(body, e));
  for (const star of picked) {
    state.stars += 1;
    ctx.bus.emit('starCollected', { entityId: star.id, stars: state.stars });
    state.entities.splice(state.entities.indexOf(star), 1);
  }
}
