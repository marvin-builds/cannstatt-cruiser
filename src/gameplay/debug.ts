/**
 * Test-only tooling (enabled together with window.__game): lets playtest
 * scenarios put a specific obstacle, person or the joint on the street. See
 * scripts/scenarios/ducking.ts and scripts/scenarios/chill.ts.
 */
import type { Entity, GameContext, ObstacleKind } from '../types';
import { jointRect, OBSTACLES, obstacleRect } from './catalogue';
import { withMotion } from './motion';

export type PlaceableKind = ObstacleKind | 'joint';

export interface GameplayDebugHook {
  /**
   * Places `kind` with its left edge at screen x (people: their street
   * anchor, moving with the middle of their catalogue motion) and returns its
   * entity id. `variant` picks the bin colour / Wasen outfit.
   */
  place(kind: PlaceableKind, x: number, variant?: number): number;
  /** Removes every entity (spawning goes on as planned). */
  clear(): void;
}

declare global {
  interface Window {
    __gameplay?: GameplayDebugHook;
  }
}

let nextId = 800_000;

const mid = ([a, b]: [number, number]) => (a + b) / 2;

export function installGameplayDebug(ctx: GameContext): void {
  window.__gameplay = {
    place(kind, x, variant = 0) {
      const id = nextId++;
      const rect = kind === 'joint' ? jointRect(x) : obstacleRect(kind, x);
      const e: Entity = { id, kind, ...rect, done: false, data: { variant } };
      const motion = kind === 'joint' ? undefined : OBSTACLES[kind].motion;
      if (motion) withMotion(e, { walk: mid(motion.walk), sway: mid(motion.sway), phase: 0 }, x);
      ctx.state.entities.push(e);
      return id;
    },
    clear() {
      ctx.state.entities.splice(0);
    },
  };
}
