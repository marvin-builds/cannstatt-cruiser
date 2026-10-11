/**
 * Pigeons on the street (ROADMAP 52 Phase 2, point 7; data in hazards.ts).
 * Harmless and kid-safe: a flock never crashes the skater and never costs a
 * heart. When the skater comes within PIGEONS.flushSeconds of riding they
 * take off (`data.flushedAt` = run time; the art flies them off from it and
 * audio flaps). As the flock's middle passes the skater it is done: passed in
 * the air (jumped, or above them on a rail) it counts as a trick, passed
 * ducking as points without a trick, like an overhead sign ducked on the
 * ground (contacts.ts). Riding through upright only scares them off.
 */
import type { GameContext } from '../types';
import { isPigeons, PIGEONS } from './hazards';
import { addPoints, addTrick } from './scoring';

/** Street before the skater at which a flock takes off, at `speed` px/s. */
export function flushReach(speed: number): number {
  return PIGEONS.flushSeconds * speed;
}

/** Takes off the flocks the skater comes near and pays for the ones he passed in the air or ducking. */
export function updatePigeons(ctx: GameContext): void {
  const { state } = ctx;
  const p = state.player;
  const entities = state.entities;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;
    if (e.done || !isPigeons(e)) continue;
    if (e.data!.flushedAt === undefined && e.x - p.x <= flushReach(state.speed)) e.data = { ...e.data, flushedAt: state.time };
    if (e.x + e.w / 2 > p.x) continue;
    e.done = true;
    if (p.state === 'crash') continue;
    const over = !p.grounded;
    if (!over && p.state !== 'duck') continue;
    const points = over ? addTrick(state, ctx.bus, PIGEONS.points) : addPoints(state, ctx.bus, PIGEONS.points);
    ctx.bus.emit('obstacleCleared', { entityId: e.id, kind: e.kind, points });
  }
}
