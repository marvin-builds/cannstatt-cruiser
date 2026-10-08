/**
 * Stomps: the falling skater's board lands on a person's head. That is no
 * crash: the person tumbles over and sits up dazed (people-art.ts draws it
 * from `data.stompedAt`), stops moving and stays harmless (done), the stomp
 * counts as a trick scored like a clean clear (`obstacleCleared`), and
 * gameplay emits `stomp` with the item the person carried; the player
 * bounces off on the next tick (player contract) and the item flies to the
 * skater's hands (toss.ts).
 */
import type { Entity, GameContext, ObstacleKind } from '../types';
import { hitBox, isPerson, OBSTACLES } from './catalogue';
import { itemOf } from './items';
import { landsOnHead } from './rules';
import { addTrick } from './scoring';

/** Stomps the first person whose head the falling skater lands on this tick (call before the crash check). */
export function stompPeople(ctx: GameContext): void {
  const { state } = ctx;
  const p = state.player;
  if (p.state === 'crash') return;
  const feet = { x: p.x, y: p.y, vy: p.vy, supported: p.grounded || p.grinding };
  const person = state.entities.find(
    (e) => !e.done && isPerson(e.kind) && landsOnHead(feet, p.hitbox, hitBox({ ...e, kind: e.kind as ObstacleKind })),
  );
  if (person) stomp(ctx, person);
}

function stomp(ctx: GameContext, e: Entity): void {
  const { state } = ctx;
  e.done = true;
  // Sits where it fell: no more walking or swaying.
  e.data = { ...e.data, walk: 0, sway: 0, ax: e.x, stompedAt: state.time };
  const points = addTrick(state, ctx.bus, OBSTACLES[e.kind as ObstacleKind].points);
  // Scored like a clean clear, so the usual +points popup and clear sound come at impact.
  ctx.bus.emit('obstacleCleared', { entityId: e.id, kind: e.kind, points });
  ctx.bus.emit('stomp', { entityId: e.id, kind: e.kind, item: itemOf(e, state.kidMode) });
}
