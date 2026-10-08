/**
 * UI slice: title, HUD, pause, game over, portrait hint, the pointer buttons
 * (pause, mute, fullscreen, the item button), the hidden settings menu
 * (kid mode, opened by a 3 s long press on the title or pause logo or holding
 * K) and the menu notices: "Neu in dieser Version", the reload button, the
 * install hint and "Zum Startbildschirm" (rules in notices.ts, layout in
 * menu-layout.ts and menu-state.ts, drawing in menu-screens.ts).
 * Records live in records.ts, popups in popups.ts (which events show which
 * popup in popup-feed.ts, catch popups in item-look.ts), the HUD texts and
 * plate in hud-model.ts, item use in item-button.ts, the grind trick hint in
 * trick-hint.ts, the stunt line callout ("Combo xN!") in stunt-callout.ts, the
 * first-time kicker and air trick hints in kicker-hint.ts and air-trick-hint.ts
 * (one hint plate at a time, hint-plate.ts), the NorDIY high five (window,
 * hand button and its one-time hint) in high-five.ts, the drunk look in drunk-look.ts, the zone ribbon in
 * banner.ts, the settings logic in settings.ts, layout math in layout.ts and
 * all drawing in screens.ts.
 */
import { CHILL_DURATION } from '../core/chill';
import { GROUND_Y, PLAYER_X } from '../core/config';
import { fullscreenSupported } from '../core/fullscreen';
import type { InputHotspot } from '../core/game';
import { store as defaultStore, type Store } from '../core/storage';
import { testHookEnabled } from '../core/testhook';
import type { GameContext, Rect, System } from '../types';
import { AirTrickHint } from './air-trick-hint';
import { UI } from './art';
import { Banner, zoneName } from './banner';
import { chillLook } from './chill-look';
import { installUiDebug } from './debug';
import { highFiveHintPlate, HighFiveHint, highFiveOpen } from './high-five';
import { HudModel } from './hud-model';
import { KickerHint } from './kicker-hint';
import { itemButtonRect, itemControl, ItemHint, itemHintRect, popupAvoid, popupCeiling } from './item-button';
import { catchPopup } from './item-look';
import { hudButtons, popupScale, riding, settingsLayout, uiMetrics } from './layout';
import { logoRect } from './logo';
import type { MenuButtons } from './menu-layout';
import { currentMenu, gameOverReady, menuScreen, portraitHintShown } from './menu-state';
import { PopupFeed } from './popup-feed';
import { type Popup, popupHeight, PopupPool } from './popups';
import { loadRecords, recordRun, saveRecords } from './records';
import { loadKidMode, LongPress, SettingsMenu } from './settings';
import { drawUi, type UiView } from './screens';
import { TrickHint } from './trick-hint';
import { placeCallout, StuntCallout } from './stunt-callout';

export interface UiSystemOptions {
  /** Where highscore and star total persist (default: localStorage). */
  store?: Store;
  /** Whether to offer the fullscreen button (default: the browser has a Fullscreen API). */
  fullscreenAvailable?: () => boolean;
}

/** Popups appear with their bottom this far above the skater's feet, clear of his head. */
const HEAD_CLEARANCE = 33;
/** The skater's box (feet at PLAYER_X, player.y): popups never cover it (PopupPool.avoid). */
const SKATER_LEFT = PLAYER_X - 14;
const SKATER_W = 30;
const SKATER_H = 34;
/** Catch popups appear above the item the skater raises, and bigger. */
const CATCH_RISE = 60;
/** Most popups on screen at once (a repeat merges into its popup instead). */
const MAX_POPUPS = 3;
/** Gap between the HUD plate and the popups below it. */
const BELOW_PLATE = 2;
/** Popups never sink below the riding line (the hints live under it); the oldest go instead. */
const POPUP_FLOOR = GROUND_Y;
/** Drunk timer bar length until drunkStart says otherwise (the test hook's setDrunk sends no event). */
const DEFAULT_DRUNK_DURATION = 6;

const browserFullscreen = () => typeof document !== 'undefined' && fullscreenSupported();

export function createUiSystem(options: UiSystemOptions = {}): System {
  const store = options.store ?? defaultStore;
  const view: UiView = {
    records: loadRecords(store),
    lastRun: null,
    popups: Object.assign(new PopupPool(MAX_POPUPS), { floor: POPUP_FLOOR }),
    banner: new Banner(),
    fullscreenAvailable: false,
    portraitDismissed: false,
    chillDuration: CHILL_DURATION,
    drunkDuration: DEFAULT_DRUNK_DURATION,
    hud: new HudModel(),
    itemHint: new ItemHint(store),
    trickHint: new TrickHint(store),
    kickerHint: new KickerHint(store),
    airHint: new AirTrickHint(store),
    highFiveHint: new HighFiveHint(store),
    stunt: new StuntCallout(),
    stuntRect: null,
    settings: new SettingsMenu(store, (switched) => onSettingsClosed(switched)),
    logoHold: new LongPress(),
  };
  /** Set in init: restarts a paused run when kid mode was switched in the menu. */
  let onSettingsClosed: (switched: boolean) => void = () => {};
  /** Gameplay events of the current tick, turned into popups once per tick (see popup-feed.ts). */
  const feed = new PopupFeed();

  /** Top of a popup at font `scale` whose bottom is clear above the skater's head. */
  const aboveHead = (ctx: GameContext, scale: number) => ctx.state.player.y - HEAD_CLEARANCE - popupHeight(scale);
  /** The skater's box this tick, reused (popups keep clear of it). */
  const skater: Rect = { x: SKATER_LEFT, y: 0, w: SKATER_W, h: SKATER_H };
  /** What popups keep clear of (popupAvoid fills it every tick). */
  const avoid: Rect[] = [];

  function spawnPopup(ctx: GameContext, text: string, color: string, icon: Popup['icon']): void {
    const scale = popupScale(ctx.display, false);
    view.popups.spawn(text, PLAYER_X, aboveHead(ctx, scale), color, scale, icon);
  }

  function bindEvents(ctx: GameContext): void {
    const { bus, state, display } = ctx;
    const popup = (text: string, color: string, big = false, rise?: number) => {
      const scale = popupScale(display, big);
      view.popups.spawn(text, PLAYER_X, rise === undefined ? aboveHead(ctx, scale) : state.player.y - rise, color, scale);
    };
    bus.on('runStarted', () => {
      view.popups.clear();
      feed.clear();
      view.itemHint.hide();
      view.trickHint.runStarted();
      view.kickerHint.runStarted();
      view.airHint.runStarted();
      view.highFiveHint.runStarted();
      view.stunt.runStarted();
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
    bus.on('grindTrick', (e) => {
      feed.grindTrick(e.points);
      view.trickHint.trickDone();
    });
    bus.on('drunkStart', (e) => (view.drunkDuration = e.duration));
    // During a stunt line the callout already cheers each piece: no "Grind!" on its ledges.
    bus.on('grindStart', () => {
      if (!view.stunt.lineActive) popup('Grind!', UI.teal);
    });
    bus.on('airTrick', (e) => {
      feed.airTrick(e.points);
      view.airHint.trickDone();
    });
    bus.on('launch', () => {
      view.kickerHint.launched();
      view.airHint.launched();
    });
    bus.on('stuntStep', (e) => view.stunt.step(e.multiplier));
    bus.on('stuntEnd', (e) => {
      view.stunt.end(e.completed, e.points);
      if (e.completed) view.kickerHint.lineCompleted();
    });
    bus.on('highFive', (e) => {
      feed.highFive(e.points);
      view.highFiveHint.highFived();
    });
    bus.on('sessionEnd', (e) => view.stunt.session(e.points));
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
    addWhatsNewHotspot(ctx, full);
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
        const control = itemControl(display, state.mode, state.carriedItem, highFiveOpen(state.entities));
        return control === 'button' ? itemButtonRect(display.viewWidth, display) : control ? view.hud.chip : null;
      }),
      onPress: () => commands.useItem(),
    });
    addMenuHotspots(ctx);
    addSettingsHotspots(ctx, full);
    ctx.addHotspot({
      rect: () => (portraitHintShown(ctx, view) ? full() : null),
      onPress: () => (view.portraitDismissed = true),
    });
  }

  /** "Neu in dieser Version" is modal: a tap or any key but M closes it (marks the version seen) and shows the title. */
  function addWhatsNewHotspot(ctx: GameContext, full: () => Rect): void {
    const shown = () => menuScreen(ctx.state, view) === 'whatsNew' && !portraitHintShown(ctx, view);
    const close = () => ctx.commands.markVersionSeen();
    const screen: InputHotspot = {
      rect: () => (shown() ? full() : null),
      onPress: close,
      onKeyDown: (code) => {
        if (code === 'KeyM') return false;
        close();
        return true;
      },
    };
    ctx.addHotspot(screen);
  }

  /** Ends the run in progress (its score and stars still count) and shows the title. */
  function leaveRun(ctx: GameContext): void {
    const { state } = ctx;
    if (state.mode === 'paused') {
      view.records = recordRun(view.records, state).records;
      saveRecords(store, view.records);
    }
    ctx.commands.toTitle();
  }

  /** The buttons of the menu screens: reload (U), "Zum Startbildschirm" (T), install, "×", "Weiter". */
  function addMenuHotspots(ctx: GameContext): void {
    const { state, commands } = ctx;
    const live = () => (state.mode !== 'gameover' || gameOverReady(state)) && !portraitHintShown(ctx, view);
    const button = (pick: (b: MenuButtons) => Rect | null, onPress: () => void, key?: string): InputHotspot => ({
      rect: () => {
        const menu = live() ? currentMenu(ctx, view) : null;
        return menu ? pick(menu.buttons) : null;
      },
      onPress,
      onKeyDown: (code) => {
        if (code !== key) return false;
        onPress();
        return true;
      },
    });
    ctx.addHotspot(button((b) => b.reload, () => commands.reloadForUpdate(), 'KeyU'));
    ctx.addHotspot(button((b) => b.toTitle, () => leaveRun(ctx), 'KeyT'));
    // Called inside the tap, so the browser's install dialog still counts as a user gesture.
    ctx.addHotspot(button((b) => b.install, () => commands.promptInstall()));
    ctx.addHotspot(button((b) => b.dismiss, () => commands.dismissInstallHint()));
    ctx.addHotspot(button((b) => b.next, () => commands.markVersionSeen()));
  }

  /** The logo's long press (pointer or K) on the title and pause screens, the menu's modal layer and its buttons. */
  function addSettingsHotspots(ctx: GameContext, full: () => Rect): void {
    const { state, display, commands } = ctx;
    const { settings, logoHold } = view;
    const menu = () => settingsLayout(display.viewWidth, uiMetrics(display));
    const logoRectNow = (): Rect | null => {
      if (settings.open || portraitHintShown(ctx, view)) return null;
      const screen = menuScreen(state, view);
      if (screen === 'title') return logoRect(display.viewWidth);
      return screen === 'pause' ? (currentMenu(ctx, view)?.buttons.logo ?? null) : null;
    };
    const logo: InputHotspot = {
      rect: logoRectNow,
      onPress: () => logoHold.start('pointer'),
      // Letting go before the menu opened is a normal tap: start the run (title) or ride on (pause).
      onRelease: () => {
        if (!logoHold.end('pointer') || !logoRectNow()) return;
        if (state.mode === 'title') commands.startRun();
        else commands.resume();
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
        else if (code === 'Enter' || code === 'Space') settings.toggle(state);
        return code !== 'KeyM';
      },
    };
    ctx.addHotspot(logo);
    ctx.addHotspot(modal);
    ctx.addHotspot({ rect: () => (settings.open ? menu().toggle : null), onPress: () => settings.toggle(state) });
    ctx.addHotspot({ rect: () => (settings.open ? menu().back : null), onPress: () => settings.close() });
  }

  /** The hint beside the touch item button while it shows (the high five hint wins over the first-catch hint), else null. */
  function buttonHintRect(ctx: GameContext, button: boolean): Rect | null {
    const { display } = ctx;
    if (!button) return null;
    if (view.highFiveHint.visible) return highFiveHintPlate(display).rect;
    return view.itemHint.visible ? itemHintRect(display.viewWidth, display, popupScale(display, false)) : null;
  }

  return {
    name: 'ui',

    init(ctx) {
      view.fullscreenAvailable = (options.fullscreenAvailable ?? browserFullscreen)();
      ctx.state.kidMode = loadKidMode(store);
      onSettingsClosed = (switched) => {
        if (!switched || ctx.state.mode !== 'paused') return;
        // Kid mode changes the art of things already on the street: start the run again.
        leaveRun(ctx);
        ctx.commands.startRun();
      };
      bindEvents(ctx);
      addHotspots(ctx);
      if (typeof window !== 'undefined' && testHookEnabled()) installUiDebug(ctx, view, feed);
    },

    update(ctx, dt) {
      const { state, display } = ctx;
      if (!display.portrait) view.portraitDismissed = false;
      if (state.mode === 'playing' && portraitHintShown(ctx, view)) ctx.commands.pause();
      if ((state.mode === 'title' || state.mode === 'paused') && view.logoHold.update(dt)) view.settings.openMenu(state.kidMode);
      const control = itemControl(display, state.mode, state.carriedItem, highFiveOpen(state.entities));
      const hintRect = buttonHintRect(ctx, control === 'button');
      if (riding(state.mode)) view.hud.update(state, control === 'keycap');
      // Laid out only while it shows (the scene allocates).
      view.stuntRect = view.stunt.visible
        ? placeCallout(view.stunt, {
            viewWidth: display.viewWidth,
            plate: view.hud.layout.plate,
            chip: view.hud.chip,
            buttons: hudButtons(display.viewWidth, view.fullscreenAvailable, uiMetrics(display), riding(state.mode)),
            itemButton: control === 'button' ? itemButtonRect(display.viewWidth, display) : null,
            itemHint: hintRect,
            banner: view.banner.visible,
          })
        : null;
      // Popups never rise into the HUD plate as it is drawn now (so they stay clear of a skater high on a
      // ledge), nor into the item hint or the stunt callout.
      const { plate } = view.hud.layout;
      view.popups.ceiling = popupCeiling(popupCeiling(plate.y + plate.h + BELOW_PLATE, hintRect), view.stuntRect);
      skater.y = Math.round(state.player.y) - SKATER_H;
      view.popups.avoid = popupAvoid(display.viewWidth, display, control, skater, avoid);
      const popups = feed.flush(state.kidMode);
      for (let i = 0; i < popups.length; i++) spawnPopup(ctx, popups[i]!.text, popups[i]!.color, popups[i]!.icon);
      if (state.drunkTimer > view.drunkDuration) view.drunkDuration = state.drunkTimer;
      if (state.mode !== 'playing') return;
      const { player } = state;
      view.popups.update(dt);
      view.banner.update(dt);
      view.stunt.update(dt, view.stuntRect !== null);
      view.kickerHint.update(state.entities);
      view.highFiveHint.update(state.entities);
      view.airHint.update(!player.grounded && !player.grinding, player.airTrick);
      view.itemHint.update(dt, view.banner.visible);
      view.trickHint.update(player.grinding, player.grindTrick);
    },

    render: {
      ui(r) {
        drawUi(r, view);
      },
    },
  };
}
