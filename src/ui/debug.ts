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
import { currentMenu, trophyShown } from './menu-state';
import { kidNoticeLayout } from './kid-notice';
import type { PopupFeed } from './popup-feed';
import type { HintKind } from './hint-plate';
import type { UiView } from './screens';
import type { SettingsScreen } from './settings';
import type { ScoreScreen } from './highscore-flow';
import { closeButton, scoreEntryLayout, scoreListLayout, titleTrophy } from './score-layout';
import type { FeedbackStatus } from './feedback-flow';
import { type FeedbackLayout, feedbackLayout } from './feedback-layout';

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
  /** Whether the grind trick hint ("↓ = Boardslide!") shows now. */
  trickHintVisible(): boolean;
  /** Emits stunt line events like gameplay: a step with this multiplier, or the end of the line. */
  stuntStep(multiplier: number): void;
  stuntEnd(completed: boolean, points: number): void;
  /**
   * Emits an air trick like gameplay: full, the "Kickflip! +points" callout and sparkle; reduced
   * (`full` false, ROADMAP 41), the plain "Kickflip +points" popup. Either way the air trick hint is never shown again.
   */
  airTrick(points: number, full?: boolean): void;
  /** Emits a kickflip bail like gameplay (crash kind 'bail', health unchanged): the popup blames state.drunkTimer ("Zu wacklig!"), state.chillTimer ("Zu entspannt!") or else the late flip ("Zu spät geflippt!"). */
  bail(): void;
  /** Emits the NorDIY events like gameplay: a high five ("High Five! +points") and the park's session end ("Session! +points"). */
  highFive(points: number): void;
  sessionEnd(points: number): void;
  /** Whether the high five hint shows now. */
  highFiveHintVisible(): boolean;
  /** Whether the air trick hint wants to show now (the hint slot picks one plate if several do). */
  airHintVisible(): boolean;
  /** The riding hint on the hint spot now (hint-slot.ts), or null. */
  shownHint(): HintKind | null;
  /**
   * Feeds the kicker hint one kicker just ahead of the skater, as if gameplay had spawned it
   * (shows on the next redraw until the next tick); returns whether the hint shows.
   */
  previewKickerHint(): boolean;
  /** Replaces the loaded records in memory (storage follows at the next game over); `kidHighscore` is kid mode's record. */
  setRecords(highscore?: number, starsTotal?: number, kidHighscore?: number): void;
  /** The hidden settings menu (or the kid mode notice, screen 'kidNotice'): screen, the logo hold progress (0..1), the statistics switch and the "Testgerät" line (ROADMAP 55). */
  settings(): { screen: SettingsScreen; holdProgress: number; statsOn: boolean; testDevice: boolean };
  /**
   * Current tap areas (view px) for this display: HUD buttons, settings buttons, the kid notice's OK, the logo
   * (title, or the pause screen's) and the menu screen's buttons (reload, install, ×, Zum Startbildschirm, Weiter,
   * Kindermodus), null off menus.
   */
  layout(): { metrics: UiMetrics; hud: HudButtons; menu: SettingsLayout; kidNoticeOk: Rect; logo: Rect; screen: MenuButtons | null };
  /**
   * The online list's state and tap areas (view px), or null without an online list: the title's
   * trophy, the open screen's close button, the entry's field and submit button.
   */
  highscores(): HighscoresDebug | null;
  /**
   * The feedback screen's state and its form's tap areas (view px), or null without a feedback
   * sender; the title icon and the pause button are in layout().screen.feedback.
   */
  feedback(): FeedbackDebug | null;
}

export interface FeedbackDebug {
  open: boolean;
  kind: 'bug' | 'idea';
  text: string;
  withLog: boolean;
  status: FeedbackStatus;
  message: string | null;
  form: FeedbackLayout;
}

export interface HighscoresDebug {
  screen: ScoreScreen;
  offered: boolean;
  name: string;
  message: string | null;
  topState: string;
  entries: number;
  /** Rank of the own row (from the server), or null. */
  highlight: number | null;
  /** The device's known own online best (0 = no entry). */
  ownBest: number;
  scroll: number;
  maxScroll: number;
  /** Where the title's trophy would be; `trophyShown` tells whether it shows and takes taps and B (never in kid mode). */
  trophy: Rect;
  trophyShown: boolean;
  close: Rect;
  /** The list's "Anonyme Statistik" switch. */
  stats: Rect;
  /** The list's "Datenschutz" link beside the switch. */
  privacyLink: Rect;
  field: Rect;
  submit: Rect;
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
    airTrick(points, full = true) {
      ctx.bus.emit('airTrick', { ticks: 20, points, full });
    },
    bail() {
      ctx.bus.emit('crash', { entityId: -1, kind: 'bail', health: ctx.state.health });
    },
    highFive(points) {
      ctx.bus.emit('highFive', { entityId: -1, points });
    },
    sessionEnd(points) {
      ctx.bus.emit('sessionEnd', { level: points > 0 ? 1 : 0, points });
    },
    highFiveHintVisible() {
      return view.highFiveHint.visible;
    },
    airHintVisible() {
      return view.airHint.visible;
    },
    shownHint() {
      return view.hints.kind;
    },
    previewKickerHint() {
      view.kickerHint.update([{ id: -1, kind: 'kicker', x: PLAYER_X + 60, y: GROUND_Y - 8, w: 24, h: 8, done: false }], ctx.state.speed);
      view.hints.update(0, { highFive: false, trick: false, air: false, kicker: view.kickerHint.visible });
      return view.kickerHint.visible;
    },
    setRecords(highscore = 0, starsTotal = 0, kidHighscore = 0) {
      view.records = { highscore, kidHighscore, starsTotal };
    },
    settings() {
      return { screen: view.settings.screen, holdProgress: view.logoHold.progress, statsOn: view.settings.statsOn, testDevice: view.settings.testDevice };
    },
    layout() {
      const { display } = ctx;
      const metrics = uiMetrics(display);
      return {
        metrics,
        hud: hudButtons(display.viewWidth, view.fullscreenAvailable, metrics, riding(ctx.state.mode)),
        menu: settingsLayout(display.viewWidth, metrics),
        kidNoticeOk: kidNoticeLayout(display).ok,
        logo: (ctx.state.mode === 'paused' ? currentMenu(ctx, view)?.buttons.logo : null) ?? logoRect(display.viewWidth),
        screen: currentMenu(ctx, view)?.buttons ?? null,
      };
    },
    highscores() {
      const flow = view.scores;
      if (!flow) return null;
      const { display } = ctx;
      const metrics = uiMetrics(display);
      const entry = scoreEntryLayout(display);
      const list = scoreListLayout(display, flow.entries.length, flow.message !== null);
      return {
        screen: flow.screen,
        offered: flow.offered,
        name: flow.name,
        message: flow.message,
        topState: flow.topState,
        entries: flow.entries.length,
        highlight: flow.highlight,
        ownBest: flow.ownBest,
        scroll: flow.scroll,
        maxScroll: list.maxScroll,
        trophy: titleTrophy(display.viewWidth, view.fullscreenAvailable, metrics),
        trophyShown: trophyShown(ctx.state, view),
        close: closeButton(display.viewWidth, metrics),
        stats: list.stats,
        privacyLink: list.privacyLink,
        field: entry.field,
        submit: entry.submit,
      };
    },
    feedback() {
      const flow = view.feedback;
      if (!flow) return null;
      const { open, kind, text, withLog, status, message } = flow;
      return { open, kind, text, withLog, status, message, form: feedbackLayout(ctx.display) };
    },
  };
}
