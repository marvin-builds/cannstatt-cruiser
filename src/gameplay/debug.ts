/**
 * Test-only tooling (enabled together with window.__game): lets playtest
 * scenarios put a specific obstacle on the street. See
 * scripts/scenarios/ducking.ts.
 */
import type { GameContext, ObstacleKind } from '../types';
import { obstacleRect } from './catalogue';

export interface GameplayDebugHook {
  /** Places obstacle `kind` with its left edge at screen x; returns its entity id. */
  place(kind: ObstacleKind, x: number): number;
  /** Removes every entity (spawning goes on as planned). */
  clear(): void;
}

declare global {
  interface Window {
    __gameplay?: GameplayDebugHook;
  }
}

let nextId = 800_000;

export function installGameplayDebug(ctx: GameContext): void {
  window.__gameplay = {
    place(kind, x) {
      const id = nextId++;
      ctx.state.entities.push({ id, kind, ...obstacleRect(kind, x), done: false });
      return id;
    },
    clear() {
      ctx.state.entities.splice(0);
    },
  };
}
