/**
 * Test-only tooling (enabled together with window.__game): puts the HUD into
 * states the gameplay slice would produce and reports the settings menu and
 * button layout, for scripts/scenarios/ui.ts and settings.ts.
 */
import { PLAYER_X } from '../core/config';
import type { GameContext, Rect } from '../types';
import { UI } from './art';
import { type HudButtons, hudButtons, popupScale, riding, type SettingsLayout, settingsLayout, type UiMetrics, uiMetrics } from './layout';
import { logoRect } from './logo';
import type { UiView } from './screens';
import type { ParentQuestion, SettingsScreen } from './settings';

export interface UiDebugHook {
  /** Overwrites combo, multiplier and stars like gameplay would. */
  hud(values: { combo?: number; multiplier?: number; stars?: number }): void;
  /** Spawns the sample popups ("+50", "Grind!", "Stern!") above the skater. */
  samplePopups(): void;
  /** Replaces the loaded records in memory (storage follows at the next game over). */
  setRecords(highscore?: number, starsTotal?: number): void;
  /** The hidden settings menu: screen, parent check question and the logo hold progress (0..1). */
  settings(): { screen: SettingsScreen; question: ParentQuestion | null; holdProgress: number };
  /** Current tap areas (view px) for this display: HUD buttons, settings buttons and the logo. */
  layout(): { metrics: UiMetrics; hud: HudButtons; menu: SettingsLayout; logo: Rect };
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
      const scale = popupScale(ctx.display, false);
      view.popups.spawn('+50', PLAYER_X, y, UI.white, scale);
      view.popups.spawn('Grind!', PLAYER_X, y, UI.teal, scale);
      view.popups.spawn('Stern!', PLAYER_X, y, UI.yellow, scale);
    },
    setRecords(highscore = 0, starsTotal = 0) {
      view.records = { highscore, starsTotal };
    },
    settings() {
      return { screen: view.settings.screen, question: view.settings.question, holdProgress: view.logoHold.progress };
    },
    layout() {
      const { display } = ctx;
      const metrics = uiMetrics(display);
      return {
        metrics,
        hud: hudButtons(display.viewWidth, view.fullscreenAvailable, metrics, riding(ctx.state.mode)),
        menu: settingsLayout(display.viewWidth, metrics),
        logo: logoRect(display.viewWidth),
      };
    },
  };
}
