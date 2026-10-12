/**
 * Which menu screen shows now and its layout, from the game state and the ui
 * view: shared by the hotspots (index.ts) and the drawing (menu-screens.ts).
 */
import { GAMEOVER_INPUT_DELAY } from '../core/config';
import type { DisplayInfo, GameState, InstallState, Rect } from '../types';
import { gameOverLayout, type MenuInput, type MenuLayout, pauseLayout, titleLayout } from './menu-layout';
import { uiMetrics } from './layout';
import { reloadOffered } from './notices';
import { titleTrophy } from './score-layout';
import { whatsNewLayout } from './whats-new';
import { language } from './i18n';
import type { RunResult } from './records';

/** The parts of the ui view the menu screens depend on. */
export interface MenuView {
  fullscreenAvailable: boolean;
  lastRun: RunResult | null;
  settings: { open: boolean };
  /** The HUD stats plate as drawn now (the pause logo keeps clear of it). */
  hud: { layout: { plate: Rect } };
  /** The online list (highscore-flow.ts): its screens cover the menus; `offered` adds "Eintragen" to game over. Null without one. */
  scores: { open: boolean; offered: boolean } | null;
  /** The feedback screen (feedback-flow.ts): it covers the title and pause screens, which offer it in adult mode. Null without one. */
  feedback: { open: boolean } | null;
  /** The install offer (install-offer.ts): the game-over card, and the manual steps covering every screen. */
  install: { guideOpen: boolean; cardShown(install: InstallState, touch: boolean): boolean };
}

export type MenuScreen = 'whatsNew' | 'title' | 'pause' | 'gameOver';

interface Source {
  state: GameState;
  display: DisplayInfo;
}

/**
 * The menu screen of this mode, or null while riding or while the settings menu, a highscore, the
 * feedback screen or the install steps cover it.
 */
export function menuScreen(state: GameState, view: MenuView): MenuScreen | null {
  if (view.settings.open || view.scores?.open || view.feedback?.open || view.install.guideOpen) return null;
  switch (state.mode) {
    case 'title':
      return state.whatsNew.length > 0 ? 'whatsNew' : 'title';
    case 'paused':
      return 'pause';
    case 'gameover':
      return 'gameOver';
    default:
      return null;
  }
}

/** The title's trophy ("Bestenliste") shows: on the title with an online list, never in kid mode (ROADMAP 45). */
export function trophyShown(state: GameState, view: MenuView): boolean {
  return !!view.scores && !state.kidMode && menuScreen(state, view) === 'title';
}

/** Feedback is offered on the title and the pause screen, never in kid mode and never on game over. */
export function feedbackOffered(state: GameState, view: MenuView, screen: MenuScreen | null): boolean {
  return !!view.feedback && !state.kidMode && (screen === 'title' || screen === 'pause');
}

/** Game-over buttons and prompt appear only after the input delay, so a tap at the crash hits nothing. */
export function gameOverReady(state: GameState): boolean {
  return state.modeTime >= GAMEOVER_INPUT_DELAY;
}

let cache: { key: string; layout: MenuLayout } | null = null;

/** The current menu screen's layout (cached while nothing it depends on changes), or null. */
export function currentMenu(r: Source, view: MenuView): MenuLayout | null {
  const screen = menuScreen(r.state, view);
  if (!screen) return null;
  const { state, display } = r;
  const install = screen === 'gameOver' && view.install.cardShown(state.install, display.touch);
  const input: MenuInput = {
    viewWidth: display.viewWidth,
    touch: display.touch,
    portrait: display.portrait,
    safeInsets: display.safeInsets,
    fullscreenAvailable: view.fullscreenAvailable,
    reload: screen !== 'whatsNew' && reloadOffered(state),
    install,
    plate: screen === 'pause' ? view.hud.layout.plate : null,
    settingsButton: screen === 'title' && !state.kidMode,
    trophy: trophyShown(state, view) ? titleTrophy(display.viewWidth, view.fullscreenAvailable, uiMetrics(display)) : null,
    feedback: feedbackOffered(state, view, screen),
  };
  const plate = input.plate ? `${input.plate.x},${input.plate.w}x${input.plate.h}` : '';
  const cutouts = `${display.safeInsets.left},${display.safeInsets.right}`;
  const newRecord = screen === 'gameOver' && !!view.lastRun?.newRecord;
  const submit = screen === 'gameOver' && !!view.scores?.offered;
  const key = `${language()}|${screen}|${input.settingsButton}|${!!input.trophy}|${input.feedback}|${input.viewWidth}|${cutouts}|${input.touch}|${input.portrait}|${input.fullscreenAvailable}|${input.reload}|${install}|${newRecord}|${submit}|${plate}|${
    screen === 'whatsNew' ? state.whatsNew.map((e) => e.version).join() : ''
  }`;
  if (cache?.key === key) return cache.layout;
  const layout =
    screen === 'whatsNew'
      ? whatsNewLayout(input, state.whatsNew)
      : screen === 'title'
        ? titleLayout(input)
        : screen === 'pause'
          ? pauseLayout(input)
          : gameOverLayout({ ...input, newRecord, submit });
  cache = { key, layout };
  return layout;
}
