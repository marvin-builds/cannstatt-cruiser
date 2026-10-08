/**
 * UI slice: title, HUD, pause, game over, portrait hint, the pointer buttons
 * (pause, mute, fullscreen) and the hidden settings menu (kid mode, opened by
 * a 3 s long press on the title logo or holding K). Records live in
 * records.ts, popups in popups.ts (catch popups in item-look.ts), the zone
 * ribbon in banner.ts, the settings logic in settings.ts, layout math in
 * layout.ts and all drawing in screens.ts.
 */
import { CHILL_DURATION } from '../core/chill';
import { PLAYER_X } from '../core/config';
import { fullscreenSupported } from '../core/fullscreen';
import type { InputHotspot } from '../core/game';
import { store as defaultStore, type Store } from '../core/storage';
import { testHookEnabled } from '../core/testhook';
import type { GameContext, Rect, System } from '../types';
import { UI } from './art';
import { Banner, zoneName } from './banner';
import { chillLook } from './chill-look';
import { installUiDebug } from './debug';
import { catchPopup } from './item-look';
import { hudButtons, plusPoints, settingsLayout, uiMetrics } from './layout';
import { logoRect } from './logo';
import { PopupPool } from './popups';
import { loadRecords, recordRun, saveRecords } from './records';
import { loadKidMode, LongPress, SettingsMenu } from './settings';
import { drawUi, portraitHintShown, type UiView } from './screens';

export interface UiSystemOptions {
  /** Where highscore and star total persist (default: localStorage). */
  store?: Store;
  /** Whether to offer the fullscreen button (default: the browser has a Fullscreen API). */
  fullscreenAvailable?: () => boolean;
}

/** Popups appear this far above the skater's feet. */
const POPUP_RISE = 44;

const browserFullscreen = () => typeof document !== 'undefined' && fullscreenSupported();

export function createUiSystem(options: UiSystemOptions = {}): System {
  const store = options.store ?? defaultStore;
  const view: UiView = {
    records: loadRecords(store),
    lastRun: null,
    popups: new PopupPool(8),
    banner: new Banner(),
    fullscreenAvailable: false,
    portraitDismissed: false,
    chillDuration: CHILL_DURATION,
    settings: new SettingsMenu(store),
    logoHold: new LongPress(),
  };

  function bindEvents(ctx: GameContext): void {
    const { bus, state } = ctx;
    const popup = (text: string, color: string) =>
      view.popups.spawn(text, PLAYER_X, state.player.y - POPUP_RISE, color);
    bus.on('runStarted', () => {
      view.popups.clear();
      view.banner.show(zoneName(state.zoneIndex));
    });
    bus.on('obstacleCleared', (e) => popup(plusPoints(e.points), UI.white));
    bus.on('grindStart', () => popup('Grind!', UI.teal));
    bus.on('starCollected', () => popup('Stern!', UI.yellow));
    bus.on('crash', () => popup('Autsch!', UI.red));
    bus.on('itemCaught', (e) => {
      const look = catchPopup(e.item, state.kidMode);
      popup(look.text, look.color);
    });
    bus.on('chillStart', (e) => {
      view.chillDuration = e.duration;
      const look = chillLook(state.kidMode);
      popup(look.popup, look.popupColor);
    });
    bus.on('zoneChanged', (e) => {
      if (state.mode === 'playing') view.banner.show(zoneName(e.index));
    });
    bus.on('gameOver', (e) => {
      view.lastRun = recordRun(view.records, e);
      view.records = view.lastRun.records;
      saveRecords(store, view.records);
    });
  }

  function addHotspots(ctx: GameContext): void {
    const { state, display, commands } = ctx;
    const buttons = () => hudButtons(display.viewWidth, view.fullscreenAvailable, uiMetrics(display));
    const whenButtons = (pick: () => Rect | null) => () =>
      portraitHintShown(ctx, view) || view.settings.open ? null : pick();
    const full = (): Rect => ({ x: 0, y: 0, w: display.viewWidth, h: display.viewHeight });
    // Later hotspots win, so the full-screen ones come first and the buttons on top.
    ctx.addHotspot({ rect: () => (state.mode === 'paused' ? full() : null), onPress: () => commands.resume() });
    ctx.addHotspot({
      rect: whenButtons(() => (state.mode === 'playing' || state.mode === 'paused' ? buttons().pause : null)),
      onPress: () => (state.mode === 'playing' ? commands.pause() : commands.resume()),
    });
    ctx.addHotspot({ rect: whenButtons(() => buttons().mute), onPress: () => commands.setMuted(!state.muted) });
    ctx.addHotspot({ rect: whenButtons(() => buttons().fullscreen), onPress: () => commands.toggleFullscreen() });
    addSettingsHotspots(ctx, full);
    ctx.addHotspot({
      rect: () => (portraitHintShown(ctx, view) ? full() : null),
      onPress: () => (view.portraitDismissed = true),
    });
  }

  /** The logo's long press (pointer or K), the menu's modal layer and its buttons. */
  function addSettingsHotspots(ctx: GameContext, full: () => Rect): void {
    const { state, display, commands } = ctx;
    const { settings, logoHold } = view;
    const menu = () => settingsLayout(display.viewWidth, uiMetrics(display), display.viewHeight);
    const onTitle = () => state.mode === 'title' && !portraitHintShown(ctx, view);
    const logo: InputHotspot = {
      rect: () => (onTitle() && !settings.open ? logoRect(display.viewWidth) : null),
      onPress: () => logoHold.start('pointer'),
      // Letting go before the menu opened is a normal tap: start the run.
      onRelease: () => {
        if (logoHold.end('pointer') && onTitle() && !settings.open) commands.startRun();
      },
      onKeyDown: (code) => {
        if (code !== 'KeyK') return false;
        logoHold.start('key');
        return true;
      },
      onKeyUp: () => void logoHold.end('key'),
    };
    // While open, the menu swallows every tap and key (except M = mute), so nothing starts a run behind it.
    const modal: InputHotspot = {
      rect: () => (settings.open ? full() : null),
      onPress: () => {},
      onKeyDown: (code) => {
        if (code === 'Escape') settings.close();
        else if (code === 'Enter' || code === 'Space') settings.toggle(state, state.frame);
        else if (/^(Digit|Numpad)[123]$/.test(code)) settings.answer(state, Number(code.slice(-1)) - 1);
        return code !== 'KeyM';
      },
    };
    ctx.addHotspot(logo);
    ctx.addHotspot(modal);
    const when = (screen: 'menu' | 'check', pick: () => Rect) => () => (settings.screen === screen ? pick() : null);
    ctx.addHotspot({ rect: when('menu', () => menu().toggle), onPress: () => settings.toggle(state, state.frame) });
    ctx.addHotspot({ rect: () => (settings.open ? menu().back : null), onPress: () => settings.back() });
    for (const i of [0, 1, 2]) {
      ctx.addHotspot({ rect: when('check', () => menu().answers[i]!), onPress: () => settings.answer(state, i) });
    }
  }

  return {
    name: 'ui',

    init(ctx) {
      view.fullscreenAvailable = (options.fullscreenAvailable ?? browserFullscreen)();
      ctx.state.kidMode = loadKidMode(store);
      bindEvents(ctx);
      addHotspots(ctx);
      if (typeof window !== 'undefined' && testHookEnabled()) installUiDebug(ctx, view);
    },

    update(ctx, dt) {
      const { state, display } = ctx;
      if (!display.portrait) view.portraitDismissed = false;
      if (state.mode === 'playing' && portraitHintShown(ctx, view)) ctx.commands.pause();
      if (state.mode === 'title' && view.logoHold.update(dt)) view.settings.show();
      if (state.mode !== 'playing') return;
      view.popups.update(dt);
      view.banner.update(dt);
    },

    render: {
      ui(r) {
        drawUi(r, view);
      },
    },
  };
}
