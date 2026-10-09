/**
 * Damage: a crash costs one health unless the player is invulnerable or
 * already crashing (the player owns the timer and the animation) and loses
 * the carried item. Empty health ends the run.
 */
import type { Entity, GameContext, GameEvents } from '../types';
import { breakCombo } from './scoring';

function canCrash(ctx: GameContext): boolean {
  const p = ctx.state.player;
  return p.invulnerableTimer <= 0 && p.state !== 'crash';
}

/** Applies a crash into `entityId` of `kind` (a bail: -1, 'bail'); returns false if it was ignored. */
export function hurt(ctx: GameContext, entityId: number, kind: GameEvents['crash']['kind']): boolean {
  if (!canCrash(ctx)) return false;
  const { state } = ctx;
  state.health = Math.max(0, state.health - 1);
  state.carriedItem = null;
  breakCombo(state);
  ctx.bus.emit('crash', { entityId, kind, health: state.health });
  if (state.health <= 0) ctx.commands.gameOver();
  return true;
}

/** Applies the hit from `entity`; returns false if it was ignored. */
export function crashInto(ctx: GameContext, entity: Entity): boolean {
  return hurt(ctx, entity.id, entity.kind);
}
