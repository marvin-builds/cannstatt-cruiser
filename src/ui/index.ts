/**
 * UI slice: title, HUD, pause, game over, portrait hint, the pointer buttons
 * (pause, mute, fullscreen, the item button), the hidden settings menu
 * (kid mode, opened by a 3 s long press on the title or pause logo or holding
 * K), the title's "Kindermodus" button with its notice (kid-notice.ts) and the menu notices: "Neu in dieser Version", the reload button, the
 * install hint and "Zum Startbildschirm" (rules in notices.ts, layout in
 * menu-layout.ts and menu-state.ts, drawing in menu-screens.ts).
 * Records live in records.ts, popups in popups.ts (which events show which
 * popup in popup-feed.ts, catch popups in item-look.ts), the HUD texts and
 * plate in hud-model.ts, item use in item-button.ts, the grind trick hint in
 * trick-hint.ts, the stunt line and kickflip callout ("Linie xN!", "Kickflip!
 * +N") in stunt-callout.ts with the kickflip sparkle in sparkle.ts, the
 * kicker and air trick hints in kicker-hint.ts and air-trick-hint.ts (one
 * hint plate at a time, long enough to read: hint-slot.ts), the NorDIY high
 * five (hand button and its hint) in high-five.ts, the drunk look in drunk-look.ts, the zone ribbon in
 * banner.ts, the settings logic in settings.ts, layout math in layout.ts and
 * all drawing in screens.ts. The online list ("Bestenliste", "Eintragen"
 * after game over) is highscore-flow.ts over src/net, laid out in
 * score-layout.ts and drawn in score-screens.ts; the native name input is
 * name-field.ts, drag and wheel scrolling list-scroll.ts. The anonymous
 * statistics (src/net/telemetry.ts) get the session on the first title, each
 * game over and the active play time; their switch ("Anonyme Statistik") is in
 * the settings menu and on the "Bestenliste", with the "Datenschutz" link
 * (privacy-link.ts) right beside it. Player feedback (ROADMAP 50, adult mode:
 * the title's speech-bubble icon and the pause menu's "Feedback") is
 * feedback-flow.ts over src/net/feedback.ts, laid out in feedback-layout.ts,
 * drawn in feedback-screen.ts, typed into the textarea of feedback-field.ts.
 */
import { CHILL_DURATION } from '../core/chill';
import { GROUND_Y, PLAYER_X } from '../core/config';
import { fullscreenSupported } from '../core/fullscreen';
import type { InputHotspot } from '../core/game';
import { store as defaultStore, type Store } from '../core/storage';
import { testHookEnabled } from '../core/testhook';
import { createBrowserFeedback, createBrowserScoreService, createBrowserTelemetry } from '../net/browser';
import type { FeedbackContext, FeedbackSenderLike } from '../net/feedback';
import type { TelemetryLike } from '../net/telemetry';
import type { GameContext, Rect, System } from '../types';
import { AirTrickHint } from './air-trick-hint';
import { UI } from './art';
import { Banner, zoneName } from './banner';
import { chillLook } from './chill-look';
import { createDomFeedbackField, type FeedbackField } from './feedback-field';
import { FeedbackFlow } from './feedback-flow';
import { feedbackLayout } from './feedback-layout';
import { feedbackPlaceholder } from './feedback-screen';
import { installUiDebug } from './debug';
import { handShown, highFiveHand, highFiveHintPlate, HighFiveHint } from './high-five';
import { HintSlot, type HintWants } from './hint-slot';
import { HudModel } from './hud-model';
import { KickerHint } from './kicker-hint';
import { kidNoticeLayout } from './kid-notice';
import { itemButtonRect, itemControl, ItemHint, itemHintRect, popupAvoid, popupCeiling } from './item-button';
import { catchPopup } from './item-look';
import { HighscoreFlow, type ScoreServiceLike } from './highscore-flow';
import { hudButtons, popupScale, riding, settingsLayout, uiMetrics } from './layout';
import { bindListScroll } from './list-scroll';
import { logoRect } from './logo';
import type { MenuButtons } from './menu-layout';
import { currentMenu, gameOverReady, menuScreen, portraitHintShown, trophyShown } from './menu-state';
import { bailCause, PopupFeed } from './popup-feed';
import { type Popup, popupHeight, PopupPool } from './popups';
import { loadRecords, recordRun, saveRecords } from './records';
import { createDomNameField, type NameField } from './name-field';
import { closeButton, scoreEntryLayout, scoreListLayout, titleTrophy } from './score-layout';
import { loadKidMode, LongPress, SettingsMenu } from './settings';
import { drawUi, type UiView } from './screens';
import { Sparkle } from './sparkle';
import { TrickHint } from './trick-hint';
import { placeCallout, StuntCallout } from './stunt-callout';
import { browserOpenPage, type OpenPage, PrivacyLink } from './privacy-link';

export interface UiSystemOptions {
  /** Where highscore and star total persist (default: localStorage). */
  store?: Store;
  /** Whether to offer the fullscreen button (default: the browser has a Fullscreen API). */
  fullscreenAvailable?: () => boolean;
  /**
   * The online list (default: the live worker in a browser, none elsewhere). null = no trophy
   * button and no "Eintragen"; tests pass a fake, never the real network.
   */
  scores?: ScoreServiceLike | null;
  /** The native name input (default: an HTML input in a browser, none elsewhere). */
  nameField?: NameField | null;
  /**
   * The anonymous statistics (default: the browser's, gated to the production host, in a browser;
   * none elsewhere). null sends nothing; tests pass a fake.
   */
  telemetry?: TelemetryLike | null;
  /** Opens datenschutz.html in a new tab (default: window.open in a browser, none elsewhere); tests pass a fake. */
  openPage?: OpenPage | null;
  /**
   * Sends player feedback (default: the browser's, gated to the production host or an injected
   * test URL, in a browser; none elsewhere). null = no feedback entries at all; tests pass a fake.
   */
  feedback?: FeedbackSenderLike | null;
  /** The feedback screen's native textarea (default: an HTML textarea in a browser, none elsewhere). */
  feedbackField?: FeedbackField | null;
}

/** The ui system; `highscores` is the online list's flow (null without an online list), `feedback` the feedback screen's (null without a sender). */
export type UiSystem = System & { highscores: HighscoreFlow | null; feedback: FeedbackFlow | null };

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
/** Arrow keys held on the "Bestenliste" scroll this many rows per second (a press moves one row at once). */
const LIST_KEY_ROWS_PER_SECOND = 10;

const browserFullscreen = () => typeof document !== 'undefined' && fullscreenSupported();

export function createUiSystem(options: UiSystemOptions = {}): UiSystem {
  const store = options.store ?? defaultStore;
  const browser = typeof window !== 'undefined';
  const scores = options.scores !== undefined ? options.scores : browser ? createBrowserScoreService(store) : null;
  const flow = scores ? new HighscoreFlow({ service: scores, store }) : null;
  const telemetry = options.telemetry !== undefined ? options.telemetry : browser ? createBrowserTelemetry(store) : null;
  const feedbackSender = options.feedback !== undefined ? options.feedback : browser ? createBrowserFeedback() : null;
  const feedback = feedbackSender ? new FeedbackFlow(feedbackSender) : null;
  const feedbackField =
    options.feedbackField !== undefined
      ? options.feedbackField
      : browser && feedback
        ? createDomFeedbackField({ onInput: (v) => feedback.setText(v), onCancel: () => feedback.close() }, () => document.getElementById('game'))
        : null;
  /** Focus the textarea on the next tick (desktop): focusing inside the opening key press would type its letter. */
  let focusFeedback = false;
  const privacyLink = new PrivacyLink(options.openPage !== undefined ? options.openPage : browser ? browserOpenPage : null);
  /** The session event goes out once per page load, when the title first shows. */
  let sessionReported = false;
  const nameField =
    options.nameField !== undefined
      ? options.nameField
      : browser && flow
        ? createDomNameField(
            { onInput: (v) => flow.setName(v), onSubmit: () => void flow.submit(), onCancel: () => flow.close() },
            () => document.getElementById('game'),
          )
        : null;
  /** Seconds of play in the current run (not paused time), for the online entry. */
  let runSeconds = 0;
  /**
   * Kid mode as the current run started: the run counts for that mode's record, also when a
   * switch in the pause menu cuts it short (state.kidMode has flipped by then). Kid runs never
   * reach the online list (ROADMAP 45).
   */
  let runKidMode = false;
  /** The arrow keys held on the list: -1 up, 1 down, 0 none. */
  let listScroll = 0;
  let lastMode: string | null = null;
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
    hints: new HintSlot(),
    stunt: new StuntCallout(),
    sparkle: new Sparkle(),
    stuntRect: null,
    settings: new SettingsMenu(store, (switched) => onSettingsClosed(switched)),
    logoHold: new LongPress(),
    scores: flow,
    feedback,
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
      runSeconds = 0;
      runKidMode = state.kidMode;
      flow?.runStarted(!runKidMode);
      view.popups.clear();
      feed.clear();
      view.itemHint.hide();
      view.trickHint.runStarted();
      view.kickerHint.runStarted();
      view.airHint.runStarted();
      view.highFiveHint.runStarted();
      view.hints.runStarted();
      view.stunt.runStarted();
      view.banner.show(zoneName(state.zoneIndex));
    });
    bus.on('obstacleCleared', (e) => feed.cleared(e.entityId, e.points));
    bus.on('stomp', (e) => feed.stomp(e.entityId));
    bus.on('crash', (e) => feed.crash(e.kind === 'bail' ? bailCause(state) : null));
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
    // Only a full kickflip gets the big callout and sparkle; a reduced one (ROADMAP 41) a plain popup.
    bus.on('airTrick', (e) => {
      if (e.full) {
        view.stunt.kickflip(e.points);
        view.sparkle.start();
      } else feed.reducedKickflip(e.points);
      view.airHint.trickDone();
      view.hints.dismiss('air');
    });
    bus.on('launch', () => {
      view.kickerHint.launched();
      view.airHint.launched();
      // Off the ramp: the ramp hint has done its job, the air trick hint may show at once.
      view.hints.dismiss('kicker');
    });
    bus.on('stuntStep', (e) => view.stunt.step(e.multiplier));
    bus.on('stuntEnd', (e) => {
      view.stunt.end(e.completed, e.points);
    });
    bus.on('highFive', (e) => {
      feed.highFive(e.points);
      view.highFiveHint.highFived();
      view.hints.dismiss('highFive');
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
      const run = { score: e.score, distance: e.distance, seconds: runSeconds };
      if (!runKidMode) flow?.runEnded(run);
      telemetry?.run(run, runKidMode);
      view.lastRun = recordRun(view.records, e, runKidMode);
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
    // While the hand shows ahead of gameplay's high five window, a tap is swallowed: it must not use the item.
    ctx.addHotspot({
      rect: whenButtons(() => {
        if (state.mode !== 'playing') return null;
        const control = itemControl(display, state.mode, state.carriedItem, handShown(highFiveHand(state.entities), display.touch));
        return control === 'button' ? itemButtonRect(display.viewWidth, display) : control ? view.hud.chip : null;
      }),
      onPress: () => {
        if (highFiveHand(state.entities) !== 'show') commands.useItem();
      },
    });
    addMenuHotspots(ctx);
    addSettingsHotspots(ctx, full);
    addScoreHotspots(ctx, full);
    addFeedbackHotspots(ctx, full);
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

  /** Ends the run in progress (its score and stars still count, for the mode it was played in) and shows the title. */
  function leaveRun(ctx: GameContext): void {
    const { state } = ctx;
    if (state.mode === 'paused') {
      view.records = recordRun(view.records, state, runKidMode).records;
      saveRecords(store, view.records);
    }
    ctx.commands.toTitle();
  }

  /**
   * The buttons of the menu screens: reload (U), "Zum Startbildschirm" (T), install, "×", "Weiter",
   * "Eintragen" (E / Enter), "Kindermodus" (I, title in adult mode).
   */
  function addMenuHotspots(ctx: GameContext): void {
    const { state, commands } = ctx;
    const live = () => (state.mode !== 'gameover' || gameOverReady(state)) && !portraitHintShown(ctx, view);
    const button = (pick: (b: MenuButtons) => Rect | null, onPress: () => void, keys: readonly string[] = []): InputHotspot => ({
      rect: () => {
        const menu = live() ? currentMenu(ctx, view) : null;
        return menu ? pick(menu.buttons) : null;
      },
      onPress,
      onKeyDown: (code) => {
        if (!keys.includes(code)) return false;
        onPress();
        return true;
      },
    });
    ctx.addHotspot(button((b) => b.reload, () => commands.reloadForUpdate(), ['KeyU']));
    ctx.addHotspot(button((b) => b.toTitle, () => leaveRun(ctx), ['KeyT']));
    ctx.addHotspot(button((b) => b.submit, () => openEntry(ctx), ['KeyE', 'Enter', 'NumpadEnter']));
    // Called inside the tap, so the browser's install dialog still counts as a user gesture.
    ctx.addHotspot(button((b) => b.install, () => commands.promptInstall()));
    ctx.addHotspot(button((b) => b.dismiss, () => commands.dismissInstallHint()));
    ctx.addHotspot(button((b) => b.next, () => commands.markVersionSeen()));
    ctx.addHotspot(button((b) => b.kidMode, () => view.settings.turnOnFromTitle(state), ['KeyI']));
    ctx.addHotspot(button((b) => b.feedback, () => openFeedback(ctx), ['KeyF']));
  }

  /** The title's speech-bubble icon or the pause menu's "Feedback": the form; desktop types into it at once. */
  function openFeedback(ctx: GameContext): void {
    if (!feedback) return;
    feedback.openForm();
    focusFeedback = !ctx.display.touch;
    placeFeedbackField(ctx);
  }

  /** What the feedback sender adds to the report. */
  function feedbackContext(ctx: GameContext): FeedbackContext {
    const { state, display } = ctx;
    return { platform: state.install.platform, touch: display.touch, portrait: display.portrait, viewWidth: display.viewWidth, mode: state.mode };
  }

  /** The native textarea over the form's field while the form shows, else hidden; a pending desktop focus. */
  function placeFeedbackField(ctx: GameContext): void {
    if (!feedback || !feedbackField) return;
    const shown = feedback.open && !feedback.done && !portraitHintShown(ctx, view);
    feedbackField.place(shown ? feedbackLayout(ctx.display).field : null, feedback.text, feedbackPlaceholder(feedback));
    if (!feedback.open) focusFeedback = false;
    if (shown && focusFeedback) {
      focusFeedback = false;
      feedbackField.focus();
    }
  }

  /**
   * The feedback screen: modal over the title or pause screen (every tap and key but M stays
   * there, so nothing starts or resumes behind it), its buttons, Esc closes it, other keys type into the field.
   */
  function addFeedbackHotspots(ctx: GameContext, full: () => Rect): void {
    if (!feedback) return;
    const { display } = ctx;
    const shown = () => feedback.open && !portraitHintShown(ctx, view);
    const form = (pick: (l: ReturnType<typeof feedbackLayout>) => Rect | null) => () =>
      shown() && !feedback.done ? pick(feedbackLayout(display)) : null;
    const send = () => void feedback.send(feedbackContext(ctx));
    const modal: InputHotspot = {
      rect: () => (shown() ? full() : null),
      onPress: () => {},
      onKeyDown: (code) => {
        if (code === 'KeyM') return false;
        const confirm = code === 'Enter' || code === 'NumpadEnter' || code === 'Space';
        if (code === 'Escape' || (feedback.done && confirm)) feedback.close();
        else if (!feedback.done) feedbackField?.focus();
        return true;
      },
    };
    ctx.addHotspot(modal);
    ctx.addHotspot({ rect: form((l) => l.field), onPress: () => feedbackField?.focus() });
    ctx.addHotspot({ rect: form((l) => l.bug), onPress: () => feedback.setKind('bug') });
    ctx.addHotspot({ rect: form((l) => l.idea), onPress: () => feedback.setKind('idea') });
    ctx.addHotspot({ rect: form((l) => (feedback.logShown ? l.log : null)), onPress: () => feedback.toggleLog() });
    ctx.addHotspot({ rect: form((l) => l.cancel), onPress: () => feedback.close() });
    ctx.addHotspot({ rect: form((l) => l.send), onPress: send });
    ctx.addHotspot({ rect: () => (shown() && feedback.done ? feedbackLayout(display).ok : null), onPress: () => feedback.close() });
  }

  /** The logo's long press (pointer or K) on the title and pause screens, the menu's (or kid notice's) modal layer and its buttons. */
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
    const onMenu = () => settings.screen === 'menu';
    // While open, the menu swallows every tap and key (except M = mute), so nothing starts a run behind it.
    // The kid notice closes with Enter, Space or Escape (its OK).
    const modal: InputHotspot = {
      rect: () => (settings.open ? full() : null),
      onPress: () => {},
      onKeyDown: (code) => {
        const confirm = code === 'Enter' || code === 'NumpadEnter' || code === 'Space';
        if (code === 'Escape' || (confirm && settings.screen === 'kidNotice')) settings.close();
        else if (confirm) settings.toggle(state);
        else if (code === 'KeyA' && onMenu()) settings.toggleStats();
        return code !== 'KeyM';
      },
    };
    ctx.addHotspot(logo);
    ctx.addHotspot(modal);
    ctx.addHotspot({ rect: () => (onMenu() ? menu().toggle : null), onPress: () => settings.toggle(state) });
    ctx.addHotspot({ rect: () => (onMenu() ? menu().stats : null), onPress: () => settings.toggleStats() });
    ctx.addHotspot({ rect: () => (onMenu() ? menu().privacyLink : null), onPress: () => privacyLink.request() });
    ctx.addHotspot({ rect: () => (onMenu() ? menu().back : null), onPress: () => settings.close() });
    ctx.addHotspot({ rect: () => (settings.screen === 'kidNotice' ? kidNoticeLayout(display).ok : null), onPress: () => settings.close() });
  }

  /** The native name input over the entry's field while the entry shows, else hidden. */
  function placeNameField(ctx: GameContext): void {
    if (!flow || !nameField) return;
    const shown = flow.screen === 'entry' && !portraitHintShown(ctx, view);
    nameField.place(shown ? scoreEntryLayout(ctx.display).field : null, flow.name);
  }

  /**
   * "Eintragen": the name entry. Called inside the tap or key press, so the
   * input can take the focus there: on desktop always (type at once), on a
   * phone only without a remembered name (with one, "Als <Name> eintragen" is one tap).
   */
  function openEntry(ctx: GameContext): void {
    if (!flow) return;
    flow.openEntry();
    placeNameField(ctx);
    if (!ctx.display.touch || !flow.name) nameField?.focus();
  }

  /** The "Bestenliste" layout as drawn now. */
  function listLayout(ctx: GameContext) {
    return scoreListLayout(ctx.display, flow!.entries.length, flow!.message !== null);
  }

  /** Keys while a highscore screen shows: it takes every key but M, so nothing starts a run behind it. */
  function scoreKey(ctx: GameContext, code: string): boolean {
    if (!flow || code === 'KeyM') return false;
    if (flow.screen === 'list') {
      const step = listLayout(ctx).rowH;
      const down = code === 'ArrowDown' || code === 'KeyS';
      if (code === 'Escape' || code === 'KeyB') flow.close();
      else if (code === 'KeyA') view.settings.toggleStats();
      else if (down || code === 'ArrowUp' || code === 'KeyW') {
        listScroll = down ? 1 : -1;
        flow.scrollBy(listScroll * step);
      } else if (code === 'PageDown' || code === 'PageUp') flow.scrollBy((code === 'PageDown' ? 1 : -1) * listLayout(ctx).list.h);
      return true;
    }
    if (code === 'Escape') flow.close();
    else if (code === 'Enter' || code === 'NumpadEnter') void flow.submit();
    else nameField?.focus();
    return true;
  }

  /** The trophy on the title (B, adult mode only), the modal layer of the list and the entry, and their buttons. */
  function addScoreHotspots(ctx: GameContext, full: () => Rect): void {
    if (!flow) return;
    const { state, display } = ctx;
    const covered = () => portraitHintShown(ctx, view) || view.settings.open;
    const trophy: InputHotspot = {
      rect: () =>
        !covered() && trophyShown(state, view) ? titleTrophy(display.viewWidth, view.fullscreenAvailable, uiMetrics(display)) : null,
      onPress: () => flow.openList(),
      onKeyDown: (code) => {
        if (code !== 'KeyB') return false;
        flow.openList();
        return true;
      },
    };
    const modal: InputHotspot = {
      rect: () => (flow.open && !covered() ? full() : null),
      onPress: () => {},
      onKeyDown: (code) => scoreKey(ctx, code),
      onKeyUp: () => void (listScroll = 0),
    };
    const entry = (pick: (l: ReturnType<typeof scoreEntryLayout>) => Rect | null) => () =>
      flow.screen === 'entry' && !covered() ? pick(scoreEntryLayout(display)) : null;
    ctx.addHotspot(trophy);
    ctx.addHotspot(modal);
    ctx.addHotspot({ rect: () => (flow.open && !covered() ? closeButton(display.viewWidth, uiMetrics(display)) : null), onPress: () => flow.close() });
    ctx.addHotspot({ rect: () => (flow.screen === 'list' && !covered() ? listLayout(ctx).stats : null), onPress: () => view.settings.toggleStats() });
    ctx.addHotspot({ rect: () => (flow.screen === 'list' && !covered() ? listLayout(ctx).privacyLink : null), onPress: () => privacyLink.request() });
    ctx.addHotspot({ rect: entry((l) => l.submit), onPress: () => void flow.submit() });
    ctx.addHotspot({ rect: entry((l) => l.field), onPress: () => nameField?.focus() });
  }

  /** Per tick while a highscore screen shows: held arrow keys, keeping the scroll in range (and the own entry in view), the name input. */
  function updateScores(ctx: GameContext, dt: number): void {
    if (!flow) return;
    if (ctx.state.mode === 'title' && lastMode !== 'title') void scores!.retryPending();
    lastMode = ctx.state.mode;
    placeNameField(ctx);
    if (flow.screen !== 'list') {
      listScroll = 0;
      return;
    }
    const l = listLayout(ctx);
    if (listScroll !== 0) flow.scrollBy(listScroll * LIST_KEY_ROWS_PER_SECOND * l.rowH * dt);
    const own = flow.highlight;
    if (flow.revealOwn && flow.topState !== 'loading') {
      flow.revealOwn = false;
      if (own !== null) flow.scroll = (own - 1) * l.rowH - Math.floor((l.list.h - l.rowH) / 2);
    }
    flow.clampScroll(l.maxScroll);
  }

  /** The hint beside the touch item button while it shows (the high five hint wins over the first-catch hint), else null. */
  function buttonHintRect(ctx: GameContext, button: boolean): Rect | null {
    const { display } = ctx;
    if (!button) return null;
    if (view.highFiveHint.visible) return highFiveHintPlate(display).rect;
    return view.itemHint.visible ? itemHintRect(display.viewWidth, display, popupScale(display, false)) : null;
  }

  /** The session event, once per page load, on the first tick the title shows. */
  function reportSession(ctx: GameContext): void {
    const { state, display } = ctx;
    if (sessionReported || !telemetry || state.mode !== 'title') return;
    sessionReported = true;
    telemetry.session({ touch: display.touch, portrait: display.portrait, platform: state.install.platform, kid: state.kidMode });
  }

  /** What each riding hint wants this tick (reused). */
  const wants: HintWants = { highFive: false, trick: false, air: false, kicker: false };

  /** The hint spot's slot from what each riding hint wants; a trick that started hides its hint at once. */
  function updateHints(ctx: GameContext, dt: number): void {
    const { player } = ctx.state;
    if (player.grindTrick) view.hints.dismiss('trick');
    if (player.airTrick) view.hints.dismiss('air');
    wants.highFive = view.highFiveHint.visible && !ctx.display.touch;
    wants.trick = view.trickHint.visible;
    wants.air = view.airHint.visible;
    wants.kicker = view.kickerHint.visible;
    view.hints.update(dt, wants);
  }

  return {
    name: 'ui',
    highscores: flow,
    feedback,

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
      ctx.onUserGesture(() => privacyLink.gesture());
      if (browser && flow) {
        bindListScroll(
          { active: () => flow.screen === 'list', scrollBy: (dy) => flow.scrollBy(dy), lineHeight: () => listLayout(ctx).rowH },
          () => document.getElementById('game'),
        );
      }
      if (typeof window !== 'undefined' && testHookEnabled()) installUiDebug(ctx, view, feed);
    },

    update(ctx, dt) {
      const { state, display } = ctx;
      if (!display.portrait) view.portraitDismissed = false;
      privacyLink.update(dt);
      if (state.mode === 'playing' && portraitHintShown(ctx, view)) ctx.commands.pause();
      if ((state.mode === 'title' || state.mode === 'paused') && view.logoHold.update(dt)) view.settings.openMenu(state.kidMode);
      const control = itemControl(display, state.mode, state.carriedItem, handShown(highFiveHand(state.entities), display.touch));
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
      updateScores(ctx, dt);
      placeFeedbackField(ctx);
      reportSession(ctx);
      if (state.mode !== 'playing') return;
      runSeconds += dt;
      telemetry?.played(dt);
      const { player } = state;
      view.popups.update(dt);
      view.banner.update(dt);
      view.stunt.update(dt, view.stuntRect !== null);
      view.sparkle.update(dt);
      view.kickerHint.update(state.entities, state.speed);
      view.highFiveHint.update(state.entities);
      view.airHint.update(!player.grounded && !player.grinding, player.airTrick, GROUND_Y - player.y);
      view.itemHint.update(dt, view.banner.visible);
      view.trickHint.update(player.grinding, player.grindTrick);
      updateHints(ctx, dt);
    },

    render: {
      ui(r) {
        drawUi(r, view);
      },
    },
  };
}
