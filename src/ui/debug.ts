/**
 * Test-only tooling (enabled together with window.__game): puts the HUD into
 * states the gameplay slice would produce, for screenshots in
 * scripts/scenarios/ui.ts.
 */
import { PLAYER_X } from '../core/config';
import type { GameContext } from '../types';
import { UI } from './art';
import type { UiView } from './screens';

export interface UiDebugHook {
  /** Overwrites combo, multiplier and stars like gameplay would. */
  hud(values: { combo?: number; multiplier?: number; stars?: number }): void;
  /** Spawns the sample popups ("+50", "Grind!", "Stern!") above the skater. */
  samplePopups(): void;
  /** Replaces the loaded records in memory (storage follows at the next game over). */
  setRecords(highscore?: number, starsTotal?: number): void;
}

declare global {
  interface Window {
    __ui?: UiDebugHook;
  }
}

export function installUiDebug(ctx: GameContext, view: UiView): void {
  window.__ui = {
    hud(values) {
      Object.assign(ctx.state, values);
    },
    samplePopups() {
      const y = ctx.state.player.y - 44;
      view.popups.spawn('+50', PLAYER_X, y, UI.white);
      view.popups.spawn('Grind!', PLAYER_X, y, UI.teal);
      view.popups.spawn('Stern!', PLAYER_X, y, UI.yellow);
    },
    setRecords(highscore = 0, starsTotal = 0) {
      view.records = { highscore, starsTotal };
    },
  };
}
