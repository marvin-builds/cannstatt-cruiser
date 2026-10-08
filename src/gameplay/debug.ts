/**
 * Test-only tooling (enabled together with window.__game): lets playtest
 * scenarios put a specific obstacle, person or the joint on the street and
 * see the dropped items (they are no entities, so window.__game misses them).
 * See scripts/scenarios/ducking.ts, chill.ts, people.ts and drop.ts.
 */
import type { CarriedItem, Entity, GameContext, ObstacleKind, Rect } from '../types';
import { jointRect, OBSTACLES, obstacleRect } from './catalogue';
import type { DroppedItems } from './drop';
import { withMotion } from './motion';

export type PlaceableKind = ObstacleKind | 'joint';

/** A dropped item as the hook shows it: its pickup box (screen space) and whether it already lies on the street. */
export interface DroppedItemView extends Rect {
  item: CarriedItem;
  lying: boolean;
}

export interface GameplayDebugHook {
  /**
   * Places `kind` with its left edge at screen x (people: their street
   * anchor, moving with the middle of their catalogue motion) and returns its
   * entity id. `variant` picks the bin colour / Wasen outfit, `prop` what a
   * Wasen visitor holds (0 Maßkrug, in kid mode Lebkuchenherz; 1 Brezel).
   */
  place(kind: PlaceableKind, x: number, variant?: number, prop?: number): number;
  /** Removes every entity (spawning goes on as planned). */
  clear(): void;
  /** Snapshot of the items knocked out of people's hands (drop.ts), falling or lying; read-only. */
  drops(): DroppedItemView[];
}

declare global {
  interface Window {
    __gameplay?: GameplayDebugHook;
  }
}

let nextId = 800_000;

const mid = ([a, b]: [number, number]) => (a + b) / 2;

export function installGameplayDebug(ctx: GameContext, dropped: DroppedItems): void {
  window.__gameplay = {
    place(kind, x, variant = 0, prop = 0) {
      const id = nextId++;
      const rect = kind === 'joint' ? jointRect(x) : obstacleRect(kind, x);
      const e: Entity = { id, kind, ...rect, done: false, data: { variant, prop } };
      const motion = kind === 'joint' ? undefined : OBSTACLES[kind].motion;
      if (motion) withMotion(e, { walk: mid(motion.walk), sway: mid(motion.sway), phase: 0 }, x);
      ctx.state.entities.push(e);
      return id;
    },
    clear() {
      ctx.state.entities.splice(0);
    },
    drops() {
      return dropped.items.map(({ item, x, y, w, h, lying }) => ({ item, x, y, w, h, lying }));
    },
  };
}
