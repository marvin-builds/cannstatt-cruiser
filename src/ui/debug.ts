/**
 * Test-only tooling (enabled together with window.__game): puts the HUD into
 * states the gameplay slice would produce and reports the settings menu and
 * button layout (incl. the menu screens' buttons), for the playtest scenarios.
 */
import { GROUND_Y, PLAYER_X } from '../core/config';
import type { CarriedItem, GameContext, Rect } from '../types';
import { UI } from './art';
import { type HudButtons, hudButtons, popupScale, riding, type SettingsLayout, settingsLayout, type UiMetrics, uiMetrics } from './layout';
import { logoRect } from './logo';
import type { MenuButtons } from './menu-layout';
import { currentMenu } from './menu-state';
import type { PopupFeed } from './popup-feed';
import type { UiView } from './screens';
import type { SettingsScreen } from './settings';

export interface UiDebugHook {
  /** Overwrites combo, multiplier and stars like gameplay would. */
  hud(values: { combo?: number; multiplier?: number; stars?: number }): void;
  /** Spawns the sample popups ("+50", "Grind!", "Stern!") above the skater. */
  samplePopups(): void;
  /**
   * Feeds sample item events to the popups (shown on the next tick), as
   * gameplay would emit them: 'drink', 'eat' (+1 health), 'throw', 'hit'
   * (ball hit with points), 'back' (ricochet), 'stomp' (with points), 'trick'.
   */
  itemPopups(...kinds: ('drink' | 'eat' | 'throw' | 'hit' | 'back' | 'stomp' | 'trick')[]): void;
  /** Puts an item in the skater's hands (state.carriedItem) like a catch (incl. the first-time touch hint), without the toss or popup; null empties them. */
  carry(item: CarriedItem | null): void;
  /** Whether the grind trick hint ("↓ = Trick!") shows now. */
  trickHintVisible(): boolean;
  /** Emits stunt line events like gameplay: a step with this multiplier, or the end of the line. */
  stuntStep(multiplier: number): void;
  stuntEnd(completed: boolean, points: number): void;
  /**
   * Feeds the kicker hint one kicker just ahead of the skater, as if gameplay had spawned it
   * (shows on the next redraw until the next tick); returns whether the hint shows.
   */
  previewKickerHint(): boolean;
  /** Replaces the loaded records in memory (storage follows at the next game over). */
  setRecords(highscore?: number, starsTotal?: number): void;
  /** The hidden settings menu: screen and the logo hold progress (0..1). */
  settings(): { screen: SettingsScreen; holdProgress: number };
  /**
   * Current tap areas (view px) for this display: HUD buttons, settings buttons, the logo (title, or
   * the pause screen's) and the menu screen's buttons (reload, install, ×, Zum Startbildschirm, Weiter), null off menus.
   */
  layout(): { metrics: UiMetrics; hud: HudButtons; menu: SettingsLayout; logo: Rect; screen: MenuButtons | null };
}

declare global {
  interface Window {
    __ui?: UiDebugHook;
  }
}

export function installUiDebug(ctx: GameContext, view: UiView, feed: PopupFeed): void {
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
    itemPopups(...kinds) {
      for (const kind of kinds) {
        if (kind === 'drink' || kind === 'throw') feed.itemUsed(kind);
        if (kind === 'eat') {
          feed.itemUsed('eat');
          feed.healthGained();
        }
        if (kind === 'hit') {
          feed.cleared(-1, 200);
          feed.ballHit(-1);
        }
        if (kind === 'back') feed.ballBack();
        if (kind === 'stomp') {
          feed.cleared(-2, 150);
          feed.stomp(-2);
        }
        if (kind === 'trick') feed.grindTrick(300);
      }
    },
    carry(item) {
      ctx.state.carriedItem = item;
      if (item) view.itemHint.caught(ctx.display.touch);
    },
    trickHintVisible() {
      return view.trickHint.visible;
    },
    stuntStep(multiplier) {
      ctx.bus.emit('stuntStep', { step: 1, steps: 3, multiplier, points: 0 });
    },
    stuntEnd(completed, points) {
      ctx.bus.emit('stuntEnd', { steps: 3, made: completed ? 3 : 1, completed, points });
    },
    previewKickerHint() {
      view.kickerHint.update([{ id: -1, kind: 'kicker', x: PLAYER_X + 60, y: GROUND_Y - 8, w: 24, h: 8, done: false }]);
      return view.kickerHint.visible;
    },
    setRecords(highscore = 0, starsTotal = 0) {
      view.records = { highscore, starsTotal };
    },
    settings() {
      return { screen: view.settings.screen, holdProgress: view.logoHold.progress };
    },
    layout() {
      const { display } = ctx;
      const metrics = uiMetrics(display);
      return {
        metrics,
        hud: hudButtons(display.viewWidth, view.fullscreenAvailable, metrics, riding(ctx.state.mode)),
        menu: settingsLayout(display.viewWidth, metrics),
        logo: (ctx.state.mode === 'paused' ? currentMenu(ctx, view)?.buttons.logo : null) ?? logoRect(display.viewWidth),
        screen: currentMenu(ctx, view)?.buttons ?? null,
      };
    },
  };
}
