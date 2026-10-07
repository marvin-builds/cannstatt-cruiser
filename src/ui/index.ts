/**
 * UI slice: title, HUD, pause, game over, portrait hint and the pointer
 * buttons (pause, mute, fullscreen). Records live in records.ts, popups in
 * popups.ts, the zone ribbon in banner.ts, layout math in layout.ts and all
 * drawing in screens.ts.
 */
import { PLAYER_X } from '../core/config';
import { fullscreenSupported } from '../core/fullscreen';
import { store as defaultStore, type Store } from '../core/storage';
import { testHookEnabled } from '../core/testhook';
import type { GameContext, Rect, System } from '../types';
import { UI } from './art';
import { Banner, zoneName } from './banner';
import { installUiDebug } from './debug';
import { hudButtons } from './layout';
import { PopupPool } from './popups';
import { loadRecords, recordRun, saveRecords } from './records';
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
  };

  function bindEvents(ctx: GameContext): void {
    const { bus, state } = ctx;
    const popup = (text: string, color: string) =>
      view.popups.spawn(text, PLAYER_X, state.player.y - POPUP_RISE, color);
    bus.on('runStarted', () => {
      view.popups.clear();
      view.banner.show(zoneName(state.zoneIndex));
    });
    bus.on('obstacleCleared', (e) => popup(`+${e.points}`, UI.white));
    bus.on('grindStart', () => popup('Grind!', UI.teal));
    bus.on('starCollected', () => popup('Stern!', UI.yellow));
    bus.on('crash', () => popup('Autsch!', UI.red));
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
    const buttons = () => hudButtons(display.viewWidth, view.fullscreenAvailable);
    const whenButtons = (pick: () => Rect | null) => () => (portraitHintShown(ctx, view) ? null : pick());
    const full = (): Rect => ({ x: 0, y: 0, w: display.viewWidth, h: display.viewHeight });
    // Later hotspots win, so the full-screen ones come first and the buttons on top.
    ctx.addHotspot({ rect: () => (state.mode === 'paused' ? full() : null), onPress: () => commands.resume() });
    ctx.addHotspot({
      rect: whenButtons(() => (state.mode === 'playing' || state.mode === 'paused' ? buttons().pause : null)),
      onPress: () => (state.mode === 'playing' ? commands.pause() : commands.resume()),
    });
    ctx.addHotspot({ rect: whenButtons(() => buttons().mute), onPress: () => commands.setMuted(!state.muted) });
    ctx.addHotspot({ rect: whenButtons(() => buttons().fullscreen), onPress: () => commands.toggleFullscreen() });
    ctx.addHotspot({
      rect: () => (portraitHintShown(ctx, view) ? full() : null),
      onPress: () => (view.portraitDismissed = true),
    });
  }

  return {
    name: 'ui',

    init(ctx) {
      view.fullscreenAvailable = (options.fullscreenAvailable ?? browserFullscreen)();
      bindEvents(ctx);
      addHotspots(ctx);
      if (typeof window !== 'undefined' && testHookEnabled()) installUiDebug(ctx, view);
    },

    update(ctx, dt) {
      const { state, display } = ctx;
      if (!display.portrait) view.portraitDismissed = false;
      if (state.mode === 'playing' && portraitHintShown(ctx, view)) ctx.commands.pause();
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
