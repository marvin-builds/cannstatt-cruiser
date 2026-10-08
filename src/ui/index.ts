/**
 * UI slice: title, HUD, pause, game over, portrait hint, the pointer buttons
 * (pause, mute, fullscreen, the item button) and the hidden settings menu
 * (kid mode, opened by a 3 s long press on the title logo or holding K).
 * Records live in records.ts, popups in popups.ts (which events show which
 * popup in popup-feed.ts, catch popups in item-look.ts), the HUD texts and
 * plate in hud-model.ts, item use in item-button.ts, the drunk look in
 * drunk-look.ts, the zone ribbon in banner.ts, the settings logic in
 * settings.ts, layout math in layout.ts and all drawing in screens.ts.
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
import { HudModel } from './hud-model';
import { itemButtonRect, itemControl, ItemHint } from './item-button';
import { catchPopup } from './item-look';
import { hudButtons, popupScale, riding, settingsLayout, uiMetrics } from './layout';
import { logoRect } from './logo';
import { PopupFeed } from './popup-feed';
import { type Popup, PopupPool } from './popups';
import { loadRecords, recordRun, saveRecords } from './records';
import { loadKidMode, LongPress, SettingsMenu } from './settings';
import { drawUi, portraitHintShown, type UiView } from './screens';
import { statsLayout } from './stats';

export interface UiSystemOptions {
  /** Where highscore and star total persist (default: localStorage). */
  store?: Store;
  /** Whether to offer the fullscreen button (default: the browser has a Fullscreen API). */
  fullscreenAvailable?: () => boolean;
}

/** Popups appear this far above the skater's feet. */
const POPUP_RISE = 44;
/** Catch popups appear above the item the skater raises, and bigger. */
const CATCH_RISE = 60;
/** Most popups on screen at once (a repeat merges into its popup instead). */
const MAX_POPUPS = 3;
/** Popups never rise into the HUD plate (its tallest form, with the chill and drunk rows). */
const POPUP_CEILING = ((p) => p.y + p.h + 2)(statsLayout(0, true, true).plate);
/** Drunk timer bar length until drunkStart says otherwise (the test hook's setDrunk sends no event). */
const DEFAULT_DRUNK_DURATION = 6;

const browserFullscreen = () => typeof document !== 'undefined' && fullscreenSupported();

export function createUiSystem(options: UiSystemOptions = {}): System {
  const store = options.store ?? defaultStore;
  const view: UiView = {
    records: loadRecords(store),
    lastRun: null,
    popups: Object.assign(new PopupPool(MAX_POPUPS), { ceiling: POPUP_CEILING }),
    banner: new Banner(),
    fullscreenAvailable: false,
    portraitDismissed: false,
    chillDuration: CHILL_DURATION,
    drunkDuration: DEFAULT_DRUNK_DURATION,
    hud: new HudModel(),
    itemHint: new ItemHint(store),
    settings: new SettingsMenu(store),
    logoHold: new LongPress(),
  };
  /** Gameplay events of the current tick, turned into popups once per tick (see popup-feed.ts). */
  const feed = new PopupFeed();

  function spawnPopup(ctx: GameContext, text: string, color: string, icon: Popup['icon']): void {
    view.popups.spawn(text, PLAYER_X, ctx.state.player.y - POPUP_RISE, color, popupScale(ctx.display, false), icon);
  }

  function bindEvents(ctx: GameContext): void {
    const { bus, state, display } = ctx;
    const popup = (text: string, color: string, big = false, rise = POPUP_RISE) =>
      view.popups.spawn(text, PLAYER_X, state.player.y - rise, color, popupScale(display, big));
    bus.on('runStarted', () => {
      view.popups.clear();
      feed.clear();
      view.itemHint.hide();
      view.banner.show(zoneName(state.zoneIndex));
    });
    bus.on('obstacleCleared', (e) => feed.cleared(e.entityId, e.points));
    bus.on('stomp', (e) => feed.stomp(e.entityId));
    bus.on('crash', () => feed.crash());
    bus.on('scoreChanged', (e) => feed.scoreChanged(e.delta));
    bus.on('itemUsed', (e) => {
      feed.itemUsed(e.action);
      view.itemHint.hide();
    });
    bus.on('healthGained', () => feed.healthGained());
    bus.on('ballHit', (e) => feed.ballHit(e.entityId));
    bus.on('ballBack', () => feed.ballBack());
    bus.on('grindTrick', (e) => feed.grindTrick(e.points));
    bus.on('drunkStart', (e) => (view.drunkDuration = e.duration));
    bus.on('grindStart', () => popup('Grind!', UI.teal));
    bus.on('starCollected', () => popup('Stern!', UI.yellow));
    bus.on('itemCaught', (e) => {
      const look = catchPopup(e.item, state.kidMode);
      popup(look.text, look.color, true, CATCH_RISE);
      view.itemHint.caught(display.touch);
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
    const buttons = () => hudButtons(display.viewWidth, view.fullscreenAvailable, uiMetrics(display), riding(state.mode));
    const whenButtons = (pick: () => Rect | null) => () =>
      portraitHintShown(ctx, view) || view.settings.open ? null : pick();
    const full = (): Rect => ({ x: 0, y: 0, w: display.viewWidth, h: display.viewHeight });
    // Later hotspots win, so the full-screen ones come first and the buttons on top.
    ctx.addHotspot({ rect: () => (state.mode === 'paused' ? full() : null), onPress: () => commands.resume() });
    ctx.addHotspot({
      rect: whenButtons(() => (riding(state.mode) ? buttons().pause : null)),
      onPress: () => (state.mode === 'playing' ? commands.pause() : commands.resume()),
    });
    ctx.addHotspot({ rect: whenButtons(() => buttons().mute), onPress: () => commands.setMuted(!state.muted) });
    ctx.addHotspot({ rect: whenButtons(() => buttons().fullscreen), onPress: () => commands.toggleFullscreen() });
    // The item button (touch) or the E key cap chip (desktop): uses the carried item, never jumps.
    ctx.addHotspot({
      rect: whenButtons(() => {
        if (state.mode !== 'playing') return null;
        const control = itemControl(display, state.mode, state.carriedItem);
        return control === 'button' ? itemButtonRect(display.viewWidth, display) : control ? view.hud.chip : null;
      }),
      onPress: () => commands.useItem(),
    });
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
    const menu = () => settingsLayout(display.viewWidth, uiMetrics(display));
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
      if (typeof window !== 'undefined' && testHookEnabled()) installUiDebug(ctx, view, feed);
    },

    update(ctx, dt) {
      const { state, display } = ctx;
      if (!display.portrait) view.portraitDismissed = false;
      if (state.mode === 'playing' && portraitHintShown(ctx, view)) ctx.commands.pause();
      if (state.mode === 'title' && view.logoHold.update(dt)) view.settings.show();
      const popups = feed.flush(state.kidMode);
      for (let i = 0; i < popups.length; i++) spawnPopup(ctx, popups[i]!.text, popups[i]!.color, popups[i]!.icon);
      if (state.drunkTimer > view.drunkDuration) view.drunkDuration = state.drunkTimer;
      if (riding(state.mode)) view.hud.update(state, itemControl(display, state.mode, state.carriedItem) === 'keycap');
      if (state.mode !== 'playing') return;
      view.popups.update(dt);
      view.banner.update(dt);
      view.itemHint.update(dt);
    },

    render: {
      ui(r) {
        drawUi(r, view);
      },
    },
  };
}
