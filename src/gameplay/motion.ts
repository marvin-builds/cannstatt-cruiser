/**
 * Deterministic motion of people obstacles. A moving entity has an anchor
 * (its street position, scrolled like any entity) and is drawn and collides
 * at anchor + motionOffset(gap), where gap = anchor - player x. The motion is
 * a pure function of the distance to the player, so it is the same on every
 * screen width and the clearability solver models it exactly.
 */
import { PLAYER_X } from '../core/config';
import type { Entity } from '../types';

export interface Motion {
  /** Walking towards the player: the street position shifts by walk * gap (0.1 = a tenth of the scroll speed). */
  walk: number;
  /** Sway amplitude in view pixels (tipsy rocking back and forth). */
  sway: number;
  /** Sway phase in radians. */
  phase: number;
}

/** Street distance of one full sway cycle. */
export const SWAY_WAVELENGTH = 56;

export function motionOffset(m: Motion, gap: number): number {
  return m.walk * gap + m.sway * Math.sin((2 * Math.PI * gap) / SWAY_WAVELENGTH + m.phase);
}

export function motionOf(e: Pick<Entity, 'data'>): Motion | null {
  const d = e.data;
  if (typeof d?.walk !== 'number' || typeof d.sway !== 'number' || typeof d.phase !== 'number') return null;
  return { walk: d.walk, sway: d.sway, phase: d.phase };
}

/** Street (rest) x of an entity: its anchor when it moves, else its x. */
export function anchorOf(e: Pick<Entity, 'x' | 'data'>): number {
  return typeof e.data?.ax === 'number' ? e.data.ax : e.x;
}

/** Puts the entity's anchor at screen x `anchor` and its x where its motion has carried it. */
export function moveTo(e: Entity, anchor: number): void {
  const m = motionOf(e);
  if (!m) {
    e.x = anchor;
    return;
  }
  e.data!.ax = anchor;
  e.x = anchor + motionOffset(m, anchor - PLAYER_X);
}

/** Gives the entity a motion, anchored at screen x `anchor`. */
export function withMotion(e: Entity, m: Motion, anchor: number): void {
  e.data = { ...e.data, ...m };
  moveTo(e, anchor);
}
