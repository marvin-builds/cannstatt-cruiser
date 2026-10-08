/**
 * Stomps: the falling skater's board lands on a person's head. That is no
 * crash: the person tumbles over and sits up dazed (people-art.ts draws it
 * from `data.stompedAt`), stops moving and stays harmless (done), the stomp
 * counts as a trick scored like a clean clear (`obstacleCleared`), and
 * gameplay emits `stomp` with the item the person carried; the player
 * bounces off on the next tick (player contract) and the item flies to the
 * skater's hands (toss.ts).
 */
import type { Entity, GameContext, ObstacleKind, Rect } from '../types';
import { hitBoxInto, isPerson, OBSTACLES } from './catalogue';
import { itemOf } from './items';
import { feetOf, landsOnHead } from './rules';
import { addTrick } from './scoring';

/** Stomps the first person whose head the falling skater lands on this tick (call before the crash check). */
export function stompPeople(ctx: GameContext): void {
  const { state } = ctx;
  const p = state.player;
  if (p.state === 'crash') return;
  const feet = feetOf(p);
  const entities = state.entities;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;
    if (e.done || !isPerson(e.kind) || !landsOnHead(feet, p.hitbox, hitBoxInto(e as Entity & { kind: ObstacleKind }, head))) continue;
    stomp(ctx, e);
    return;
  }
}

const head: Rect = { x: 0, y: 0, w: 0, h: 0 };

/**
 * The person tumbles onto its back and sits up dazed (people-art.ts draws it
 * from `data.stompedAt`): harmless (done) and, sitting where it fell, no
 * more walking or swaying. Also what a hit by the thrown ball does.
 */
export function knockOver(e: Entity, time: number): void {
  e.done = true;
  e.data = { ...e.data, walk: 0, sway: 0, ax: e.x, stompedAt: time };
}

function stomp(ctx: GameContext, e: Entity): void {
  const { state } = ctx;
  knockOver(e, state.time);
  const points = addTrick(state, ctx.bus, OBSTACLES[e.kind as ObstacleKind].points);
  // Scored like a clean clear, so the usual +points popup and clear sound come at impact.
  ctx.bus.emit('obstacleCleared', { entityId: e.id, kind: e.kind, points });
  ctx.bus.emit('stomp', { entityId: e.id, kind: e.kind, item: itemOf(e, state.kidMode) });
}
