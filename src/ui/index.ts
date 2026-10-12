/**
 * UI slice: title, HUD, pause, game over, the rotate screen (rotate-screen.ts, rotate-sheet.ts), the pointer buttons
 * (pause, mute, fullscreen, the item button), the settings menu (kid mode,
 * opened by the title's gear in adult mode or by a 3 s long press on the title
 * or pause logo or holding K), the kid notice after turning kid mode on there
 * (kid-notice.ts) and the menu notices: "Neu in dieser Version", the reload button, the
 * install card and "Zum Startbildschirm" (rules in notices.ts and install-offer.ts, layout in
 * menu-layout.ts and menu-state.ts, drawing in menu-screens.ts). "App installieren" (game-over
 * card, settings) shows the browser prompt in the release of the tap, else the manual steps
 * (install-guide.ts).
 * Records live in records.ts, popups in popups.ts (which events show which
 * popup in popup-feed.ts, catch popups in item-look.ts), the HUD texts and
 * plate in hud-model.ts (the mission line under it in mission-line.ts), item use in item-button.ts, the grind trick hint in
 * trick-hint.ts, the stunt line and kickflip callout ("Linie xN!", "Kickflip!
 * +N") in stunt-callout.ts with the kickflip sparkle in sparkle.ts, the
 * kicker and air trick hints in kicker-hint.ts and air-trick-hint.ts (one
 * hint plate at a time, long enough to read: hint-slot.ts), the NorDIY high
 * five (hand button and its hint) in high-five.ts, the drunk look in drunk-look.ts, the zone ribbon in
 * banner.ts, the settings logic in settings.ts, layout math in layout.ts and
 * all drawing in screens.ts. The online list ("Bestenliste", "Eintragen"
 * after game over) is highscore-flow.ts over src/net, laid out in
 * score-layout.ts and drawn in score-screens.ts; the native name input is
 * name-field.ts, drag and wheel scrolling list-scroll.ts (also of the "Neu in dieser
 * Version" list, whats-new.ts; in portrait that list is the full-screen sheet
 * of whats-new-sheet.ts). The anonymous
 * statistics (src/net/telemetry.ts) get the session on the first title, each
 * game over and the active play time; their switch ("Anonyme Statistik") is in
 * the settings menu and on the "Bestenliste", with the "Datenschutz" link
 * (privacy-link.ts) right beside it. Player feedback (ROADMAP 50, adult mode:
 * the title's speech-bubble icon and the pause menu's "Feedback") is
 * feedback-flow.ts over src/net/feedback.ts, laid out in feedback-layout.ts,
 * drawn in feedback-screen.ts, typed into the textarea of feedback-field.ts;
 * in portrait both text forms show as full-screen DOM sheets instead
 * (portrait-sheets.ts, feedback-sheet.ts, entry-sheet.ts, form-surface.ts);
 * F opens it on the title and pause screens and, while riding, pauses first.
 * What happened to a report sent from this device shows once as a note over
 * the title (feedback-note.ts over src/net/feedback-status.ts, adult mode only).
 * Menu notes fall back to shorter wordings at portrait's scale 2 (note-text.ts).
 */
import { CHILL_DURATION } from '../core/chill';
import { GROUND_Y, PLAYER_X } from '../core/config';
import { fullscreenSupported } from '../core/fullscreen';
import type { InputHotspot } from '../core/game';
import { store as defaultStore, type Store } from '../core/storage';
import { testHookEnabled } from '../core/testhook';
import { createBrowserFeedback, createBrowserScoreService, createBrowserTelemetry } from '../net/browser';
import type { FeedbackSenderLike } from '../net/feedback';
import type { FeedbackInboxLike } from '../net/feedback-status';
import type { TelemetryLike } from '../net/telemetry';
import type { GameContext, Rect, System } from '../types';
import { AirTrickHint } from './air-trick-hint';
import { UI } from './art';
import { Banner, zoneName } from './banner';
import { chillLook, chillPopup } from './chill-look';
import { createDomEntrySheet, type EntrySheet, type EntrySheetHandlers } from './entry-sheet';
import { FeedbackDialog } from './feedback-dialog';
import { createDomFeedbackField, type FeedbackField } from './feedback-field';
import type { FeedbackFlow } from './feedback-flow';
import { createDomFeedbackSheet, type FeedbackSheet, type FeedbackSheetHandlers } from './feedback-sheet';
import { installGuideLayout } from './install-guide';
import { installable, InstallOffer } from './install-offer';
import { FormSurface } from './form-surface';
import { installUiDebug } from './debug';
import { handShown, highFiveHand, highFiveHintPlate, HighFiveHint } from './high-five';
import { HintSlot, type HintWants } from './hint-slot';
import { HudModel } from './hud-model';
import { KickerHint } from './kicker-hint';
import { kidNoticeLayout, kidNoticeRestart } from './kid-notice';
import { itemButtonRect, itemControl, ItemHint, itemHintRect, popupAvoid, popupCeiling } from './item-button';
import { catchPopup } from './item-look';
import { HighscoreFlow, type ScoreServiceLike } from './highscore-flow';
import { EVERYWHERE, hudButtons, popupScale, riding, settingsLayout, uiMetrics } from './layout';
import { bindListScroll } from './list-scroll';
import { logoRect } from './logo';
import type { MenuButtons } from './menu-layout';
import { currentMenu, gameOverReady, menuScreen, trophyShown } from './menu-state';
import { bailCause, PopupFeed, type PopupSpec } from './popup-feed';
import { popupHeight, PopupPool } from './popups';
import { loadRecords, recordRun, saveRecords } from './records';
import { createDomNameField, type NameField } from './name-field';
import { entrySheetModel, sheetShown } from './portrait-sheets';
import type { SheetFactory } from './sheet-dom';
import { closeButton, scoreEntryLayout, scoreListLayout, titleTrophy } from './score-layout';
import { loadKidMode, LongPress, SettingsMenu } from './settings';
import { drawUi, type UiView } from './screens';
import { Sparkle } from './sparkle';
import { TrickHint } from './trick-hint';
import { placeCallout, StuntCallout } from './stunt-callout';
import { browserOpenPage, type OpenPage, PrivacyLink } from './privacy-link';
import { browserOrientationEnv, type OrientationEnv } from '../core/orientation';
import { TypingOrientation } from './typing-orientation';
import { ListScroll, pageScroll, scrollDirection } from './whats-new';
import { RotateHint, type ScreenSource, uiScreen } from './rotate-screen';
import { createDomRotateSheet, type RotateSheet, type RotateSheetHandlers } from './rotate-sheet';
import { createDomWhatsNewSheet, type WhatsNewSheet, type WhatsNewSheetHandlers } from './whats-new-sheet';
import { BackNav, backStep, browserHistoryEnv, type HistoryEnv } from './back-nav';
import { createDomSettleCover, type SettleCover } from './settle-cover';
import { type Lang, loadLanguage, saveLanguage, setLanguage, texts } from './i18n';

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
  /**
   * The reports sent from this device and their status ("Mein Feedback", the red dot; default: the
   * browser's, gated like the sender, in a browser; none elsewhere). null = an empty list and no checks;
   * tests pass a fake.
   */
  feedbackInbox?: FeedbackInboxLike | null;
  /** The feedback screen's native textarea (default: an HTML textarea in a browser, none elsewhere). */
  feedbackField?: FeedbackField | null;
  /** The feedback form's portrait sheet (default: a DOM sheet in a browser, none elsewhere); tests pass a fake. */
  feedbackSheet?: SheetFactory<FeedbackSheetHandlers, FeedbackSheet> | null;
  /** The name entry's portrait sheet (default: a DOM sheet in a browser, none elsewhere); tests pass a fake. */
  entrySheet?: SheetFactory<EntrySheetHandlers, EntrySheet> | null;
  /** The "Neu in dieser Version" portrait sheet (default: a DOM sheet in a browser, none elsewhere); tests pass a fake. */
  whatsNewSheet?: SheetFactory<WhatsNewSheetHandlers, WhatsNewSheet> | null;
  /** The full-screen rotate screen (ROADMAP 73; default: a DOM overlay in a browser, none elsewhere); tests pass a fake. */
  rotateSheet?: SheetFactory<RotateSheetHandlers, RotateSheet> | null;
  /**
   * The screen orientation lock, freed to portrait while the player types (default: the browser's
   * in a browser, none elsewhere); tests pass a fake.
   */
  orientation?: OrientationEnv | null;
  /**
   * The session history Android back walks (ROADMAP 75, back-nav.ts; default: the browser's in a
   * browser, none elsewhere); tests pass a fake.
   */
  history?: HistoryEnv | null;
  /** The cover shown while the view settles after a portrait form closed (default: a DOM layer in a browser, none elsewhere); tests pass a fake. */
  settleCover?: SettleCover | null;
  /** The clock of the install card's snooze, ms (default: Date.now); tests pass a fake. */
  now?: () => number;
  /**
   * The browser language that picks the first visit's language (ROADMAP 71; default: navigator.language in
   * a browser, none elsewhere). Read only for that, never stored or sent; tests pass one.
   */
  browserLanguage?: string | null;
}

/** The ui system; `highscores` is the online list's flow (null without an online list), `feedback` the feedback dialog's (null without a sender). */
export type UiSystem = System & {
  highscores: HighscoreFlow | null;
  feedback: FeedbackFlow | null;
  whatsNew: ListScroll;
  settings: SettingsMenu;
  /** The install card's timing and snooze and the manual install steps. */
  install: InstallOffer;
};

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
  const browserLanguage = options.browserLanguage !== undefined ? options.browserLanguage : browser ? navigator.language : null;
  const scores = options.scores !== undefined ? options.scores : browser ? createBrowserScoreService(store) : null;
  const flow = scores ? new HighscoreFlow({ service: scores, store }) : null;
  const telemetry = options.telemetry !== undefined ? options.telemetry : browser ? createBrowserTelemetry(store) : null;
  const browserFeedback = browser && (options.feedback === undefined || options.feedbackInbox === undefined) ? createBrowserFeedback(store) : null;
  const feedbackSender = options.feedback !== undefined ? options.feedback : (browserFeedback?.sender ?? null);
  const feedbackInbox = options.feedbackInbox !== undefined ? options.feedbackInbox : (browserFeedback?.inbox ?? null);
  /** Set in init: the context the portrait sheets' actions run in. */
  let uiCtx: GameContext | null = null;
  const feedbackSheetFactory = options.feedbackSheet !== undefined ? options.feedbackSheet : browser ? createDomFeedbackSheet : null;
  const dialog = feedbackSender
    ? new FeedbackDialog({
        sender: feedbackSender,
        inbox: feedbackInbox,
        field: (handlers) =>
          options.feedbackField !== undefined ? options.feedbackField : browser ? createDomFeedbackField(handlers, () => document.getElementById('game')) : null,
        sheet: feedbackSheetFactory,
        bindScroll: browser,
        covered: () => !!uiCtx && rotateShown(uiCtx),
      })
    : null;
  const feedback = dialog?.flow ?? null;
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
  const entrySheetFactory = options.entrySheet !== undefined ? options.entrySheet : browser ? createDomEntrySheet : null;
  const entrySheet =
    flow && entrySheetFactory
      ? entrySheetFactory({ onInput: (v) => flow.setName(v), onSubmit: () => void flow.submit(), onCancel: () => flow.close() })
      : null;
  const entrySurface = new FormSurface({ field: nameField, sheet: entrySheet });
  const whatsNewSheetFactory = options.whatsNewSheet !== undefined ? options.whatsNewSheet : browser ? createDomWhatsNewSheet : null;
  const whatsNewSheet = whatsNewSheetFactory?.({ onDone: () => uiCtx?.commands.markVersionSeen() }) ?? null;
  /** The rotate screen (ROADMAP 73): where it shows (rotate-screen.ts) and its full-screen overlay. */
  const rotate = new RotateHint();
  const rotateSheetFactory = options.rotateSheet !== undefined ? options.rotateSheet : browser ? createDomRotateSheet : null;
  const rotateSheet = rotateSheetFactory?.({ onDismiss: () => rotate.dismiss() }) ?? null;
  /** What is open now (the rotate screen's and the back button's view of it). */
  function screenSource(ctx: GameContext): ScreenSource {
    const { state } = ctx;
    return {
      mode: state.mode,
      whatsNew: state.whatsNew.length > 0,
      installGuide: view.install.guideOpen,
      settings: view.settings.open,
      feedback: !!feedback?.open,
      scores: flow?.open ? (flow.screen === 'entry' ? 'entry' : 'list') : null,
    };
  }
  /** The rotate screen covers the game now: on a phone in portrait, on a screen that needs landscape, not dismissed. */
  function rotateShown(ctx: GameContext): boolean {
    return rotate.shown(ctx.display, uiScreen(screenSource(ctx)));
  }
  const typingOrientation = new TypingOrientation(
    options.orientation !== undefined ? options.orientation : browser ? browserOrientationEnv() : null,
  );
  /** A text form took text on the last tick (closing it in portrait covers the screen until the view settled). */
  let wasTyping = false;
  const settleCover = options.settleCover !== undefined ? options.settleCover : browser ? createDomSettleCover() : null;
  const historyEnv = options.history !== undefined ? options.history : browser ? browserHistoryEnv() : null;
  /** Android back (ROADMAP 75): set in init. */
  let backNav: BackNav | null = null;
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
  /** The same for the "Neu in dieser Version" list. */
  let whatsNewKeys: -1 | 0 | 1 = 0;
  let lastMode: string | null = null;
  const view: UiView = {
    records: loadRecords(store),
    lastRun: null,
    popups: Object.assign(new PopupPool(MAX_POPUPS), { floor: POPUP_FLOOR }),
    banner: new Banner(),
    fullscreenAvailable: false,
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
    whatsNew: new ListScroll(),
    install: new InstallOffer(store, options.now ?? Date.now),
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

  function spawnPopup(ctx: GameContext, spec: PopupSpec): void {
    const scale = popupScale(ctx.display, false);
    view.popups.spawn(spec.text, PLAYER_X, aboveHead(ctx, scale), spec.color, scale, spec.icon, spec.points ?? null);
  }

  function bindEvents(ctx: GameContext): void {
    const { bus, state, display } = ctx;
    const popup = (text: string, color: string, big = false, rise?: number) => {
      const scale = popupScale(display, big);
      view.popups.spawn(text, PLAYER_X, rise === undefined ? aboveHead(ctx, scale) : state.player.y - rise, color, scale);
    };
    bus.on('runStarted', () => {
      dialog?.dismiss();
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
      view.install.runStarted();
      view.banner.show(zoneName(state.zoneIndex));
    });
    feed.listen(bus);
    bus.on('crash', (e) => feed.crash(e.kind === 'bail' ? bailCause(state) : null));
    bus.on('itemUsed', (e) => {
      feed.itemUsed(e.action);
      view.itemHint.hide();
    });
    bus.on('grindTrick', (e) => {
      feed.grindTrick(e.points);
      view.trickHint.trickDone();
    });
    bus.on('drunkStart', (e) => (view.drunkDuration = e.duration));
    // During a stunt line the callout already cheers each piece: no "Grind!" on its ledges.
    bus.on('grindStart', () => {
      if (!view.stunt.lineActive) popup(texts().popups.grind, UI.teal);
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
    bus.on('itemCaught', (e) => {
      const look = catchPopup(e.item, state.kidMode);
      popup(look.text, look.color, true, CATCH_RISE);
      view.itemHint.caught(display.touch);
    });
    bus.on('chillStart', (e) => {
      view.chillDuration = e.duration;
      popup(chillPopup(state.kidMode), chillLook(state.kidMode).popupColor);
    });
    bus.on('zoneChanged', (e) => {
      if (state.mode === 'playing') view.banner.show(zoneName(e.index));
    });
    bus.on('gameOver', (e) => {
      dialog?.dismiss();
      const run = { score: e.score, distance: e.distance, seconds: runSeconds };
      if (!runKidMode) flow?.runEnded(run);
      telemetry?.run(run, runKidMode);
      view.lastRun = recordRun(view.records, e, runKidMode);
      view.records = view.lastRun.records;
      saveRecords(store, view.records);
      view.install.runEnded({ ...view.lastRun, seconds: runSeconds });
    });
  }

  function addHotspots(ctx: GameContext): void {
    const { state, display, commands } = ctx;
    const buttons = () => hudButtons(display.viewWidth, view.fullscreenAvailable, uiMetrics(display), riding(state.mode));
    const whenButtons = (pick: () => Rect | null) => () =>
      rotateShown(ctx) || view.settings.open || view.install.guideOpen ? null : pick();
    // Later hotspots win, so the full-screen ones come first and the buttons on top.
    ctx.addHotspot({ rect: () => (state.mode === 'paused' ? EVERYWHERE : null), onPress: () => commands.resume() });
    addWhatsNewHotspot(ctx);
    const pauseButton: InputHotspot = {
      rect: whenButtons(() => (riding(state.mode) ? buttons().pause : null)),
      onPress: () => (state.mode === 'playing' ? commands.pause() : commands.resume()),
      // F while riding (adult mode): pause and open the feedback form, as the title hint says.
      onKeyDown: (code) => {
        if (code !== 'KeyF' || state.mode !== 'playing' || state.kidMode || !dialog) return false;
        commands.pause();
        dialog.open(ctx);
        return true;
      },
    };
    ctx.addHotspot(pauseButton);
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
    addLanguageHotspots(ctx);
    addSettingsHotspots(ctx);
    addScoreHotspots(ctx);
    dialog?.init(ctx);
    addInstallGuideHotspots(ctx);
    ctx.addHotspot({
      rect: () => (rotateShown(ctx) ? EVERYWHERE : null),
      onPress: () => rotate.dismiss(),
    });
  }

  /** "Neu in dieser Version" shows (not under the rotate screen). */
  const whatsNewShown = (ctx: GameContext) => menuScreen(ctx.state, view) === 'whatsNew' && !rotateShown(ctx);
  /** It shows as its portrait sheet (portrait-sheets.ts) rather than on the canvas. */
  const whatsNewOnSheet = (ctx: GameContext) => !!whatsNewSheet && whatsNewShown(ctx) && sheetShown(ctx.display, true);

  /** The canvas "Neu in dieser Version" list while that screen shows on the canvas, else null. */
  function whatsNewList(ctx: GameContext) {
    if (!whatsNewShown(ctx) || whatsNewOnSheet(ctx)) return null;
    return currentMenu(ctx, view)?.list ?? null;
  }

  /**
   * "Neu in dieser Version" is modal: a tap or any key but M and the scroll keys closes it (marks the
   * version seen) and shows the title. A list that scrolls keeps a tap on itself (drag, wheel:
   * list-scroll.ts); arrow keys / W / S, Page Up / Down, Home and End move it. On the portrait
   * sheet its own "Weiter" takes the taps and the scroll keys move the sheet's list.
   */
  function addWhatsNewHotspot(ctx: GameContext): void {
    const close = () => ctx.commands.markVersionSeen();
    const screen: InputHotspot = {
      rect: () => (whatsNewShown(ctx) ? EVERYWHERE : null),
      onPress: close,
      onKeyDown: (code) => {
        if (code === 'KeyM') return false;
        if (whatsNewOnSheet(ctx)) {
          if (!whatsNewSheet!.scrollKey(code)) close();
          return true;
        }
        const list = whatsNewList(ctx)!;
        const page = pageScroll(code, list);
        whatsNewKeys = scrollDirection(code);
        if (whatsNewKeys !== 0) view.whatsNew.by(whatsNewKeys * list.rowH);
        else if (page !== null) view.whatsNew.by(page);
        else close();
        view.whatsNew.clamp(list.maxScroll);
        return true;
      },
      onKeyUp: () => void (whatsNewKeys = 0),
    };
    ctx.addHotspot(screen);
    ctx.addHotspot({
      rect: () => {
        const list = whatsNewList(ctx);
        return list && list.maxScroll > 0 ? list.rect : null;
      },
      onPress: () => {},
    });
  }

  /**
   * Per tick: the portrait sheet shows or hides; held arrow keys scroll the canvas "Neu in dieser
   * Version" list, kept in range; it starts at the top again once closed.
   */
  function updateWhatsNew(ctx: GameContext, dt: number): void {
    whatsNewSheet?.show(whatsNewOnSheet(ctx) ? ctx.state.whatsNew : null);
    const list = whatsNewList(ctx);
    if (!list) {
      whatsNewKeys = 0;
      if (ctx.state.whatsNew.length === 0) view.whatsNew.reset();
      return;
    }
    if (whatsNewKeys !== 0) view.whatsNew.by(whatsNewKeys * LIST_KEY_ROWS_PER_SECOND * list.rowH * dt);
    view.whatsNew.clamp(list.maxScroll);
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
   * "Eintragen" (E / Enter), the settings gear (G, title in adult mode).
   */
  function addMenuHotspots(ctx: GameContext): void {
    const { state, commands } = ctx;
    const live = () => (state.mode !== 'gameover' || gameOverReady(state)) && !rotateShown(ctx);
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
    ctx.addHotspot(onRelease(button((b) => b.install, () => {}), () => pressInstall(ctx)));
    ctx.addHotspot(button((b) => b.dismiss, () => view.install.snooze(state.install)));
    ctx.addHotspot(button((b) => b.next, () => commands.markVersionSeen()));
    ctx.addHotspot(button((b) => b.settings, () => view.settings.openMenu(state.kidMode), ['KeyG']));
    ctx.addHotspot(button((b) => b.feedback, () => dialog?.open(ctx), ['KeyF']));
  }

  /** The player picked a language (ROADMAP 71): every text switches at once, and the choice is kept on the device. */
  function chooseLanguage(lang: Lang): void {
    setLanguage(lang);
    saveLanguage(store, lang);
  }

  /** The title's language switch "DE | EN" (adult and kid mode; language-switch.ts). */
  function addLanguageHotspots(ctx: GameContext): void {
    const shown = () => (!rotateShown(ctx) && menuScreen(ctx.state, view) === 'title' ? (currentMenu(ctx, view)?.language ?? null) : null);
    ctx.addHotspot({ rect: () => shown()?.de ?? null, onPress: () => chooseLanguage('de') });
    ctx.addHotspot({ rect: () => shown()?.en ?? null, onPress: () => chooseLanguage('en') });
  }

  /**
   * "App installieren": the kept browser prompt, else the manual steps. Pressed in a hotspot's
   * release (onRelease): a touch grants the user gesture the prompt needs only when it ends.
   */
  function pressInstall(ctx: GameContext): void {
    view.install.press(ctx.state.install, ctx.commands);
  }

  /** The hotspot acts when its press is let go (still over a live button), not when it goes down. */
  function onRelease(hotspot: InputHotspot, action: () => void): InputHotspot {
    return {
      ...hotspot,
      onPress: () => {},
      onRelease: () => {
        if (hotspot.rect()) action();
      },
    };
  }

  /** The manual install steps: modal over every screen (taps and keys but M stay there); OK, Enter, Space or Esc close them. */
  function addInstallGuideHotspots(ctx: GameContext): void {
    const { state, display } = ctx;
    const shown = () => view.install.guideOpen && !rotateShown(ctx);
    const modal: InputHotspot = {
      rect: () => (shown() ? EVERYWHERE : null),
      onPress: () => {},
      onKeyDown: (code) => {
        if (code === 'KeyM') return false;
        if (['Enter', 'NumpadEnter', 'Space', 'Escape'].includes(code)) view.install.closeGuide();
        return true;
      },
    };
    ctx.addHotspot(modal);
    ctx.addHotspot({ rect: () => (shown() ? installGuideLayout(display, state.install.platform).ok : null), onPress: () => view.install.closeGuide() });
  }

  /** The logo's long press (pointer or K) on the title and pause screens, the menu's (or kid notice's) modal layer and its buttons. */
  function addSettingsHotspots(ctx: GameContext): void {
    const { state, display, commands } = ctx;
    const { settings, logoHold } = view;
    const menu = () => settingsLayout(display.viewWidth, uiMetrics(display), installable(state.install));
    const logoRectNow = (): Rect | null => {
      if (settings.open || rotateShown(ctx)) return null;
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
      rect: () => (settings.open ? EVERYWHERE : null),
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
    ctx.addHotspot({ rect: () => (onMenu() ? menu().language.de : null), onPress: () => chooseLanguage('de') });
    ctx.addHotspot({ rect: () => (onMenu() ? menu().language.en : null), onPress: () => chooseLanguage('en') });
    ctx.addHotspot(onRelease({ rect: () => (onMenu() ? menu().install : null), onPress: () => {} }, () => pressInstall(ctx)));
    ctx.addHotspot({ rect: () => (settings.screen === 'kidNotice' ? kidNoticeLayout(display, kidNoticeRestart(settings, state)).ok : null), onPress: () => settings.close() });
  }

  /** The name entry shows as its portrait sheet (portrait-sheets.ts) rather than on the canvas. */
  const entryOnSheet = (ctx: GameContext) => !!entrySheet && sheetShown(ctx.display, true);

  /** While the entry shows: the native name input over the canvas entry's field, or the portrait sheet; else both hidden. */
  function placeNameField(ctx: GameContext): void {
    if (!flow) return;
    const shown = flow.screen === 'entry' && !rotateShown(ctx);
    entrySurface.update(!shown ? null : entryOnSheet(ctx) ? 'sheet' : 'field', (surface) => {
      nameField?.place(surface === 'field' ? scoreEntryLayout(ctx.display).field : null, flow.name);
      entrySheet?.show(surface === 'sheet' ? entrySheetModel(flow) : null);
    });
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
    if (!ctx.display.touch || !flow.name) entrySurface.focus();
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
    else entrySurface.focus();
    return true;
  }

  /**
   * The trophy on the title (B, adult mode only), the modal layer of the list and the entry (every tap
   * anywhere, also outside the canvas; one beside the entry's field blurs it), and their buttons.
   */
  function addScoreHotspots(ctx: GameContext): void {
    if (!flow) return;
    const { state, display } = ctx;
    const covered = () => rotateShown(ctx) || view.settings.open;
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
      rect: () => (flow.open && !covered() ? EVERYWHERE : null),
      onPress: () => entrySurface.blur(),
      onKeyDown: (code) => scoreKey(ctx, code),
      onKeyUp: () => void (listScroll = 0),
    };
    // The canvas entry's buttons; on the portrait sheet its own buttons take the taps.
    const onSheet = () => flow.screen === 'entry' && entryOnSheet(ctx);
    const entry = (pick: (l: ReturnType<typeof scoreEntryLayout>) => Rect | null) => () =>
      flow.screen === 'entry' && !covered() && !onSheet() ? pick(scoreEntryLayout(display)) : null;
    ctx.addHotspot(trophy);
    ctx.addHotspot(modal);
    ctx.addHotspot({ rect: () => (flow.open && !covered() && !onSheet() ? closeButton(display.viewWidth, uiMetrics(display)) : null), onPress: () => flow.close() });
    ctx.addHotspot({ rect: () => (flow.screen === 'list' && !covered() ? listLayout(ctx).stats : null), onPress: () => view.settings.toggleStats() });
    ctx.addHotspot({ rect: () => (flow.screen === 'list' && !covered() ? listLayout(ctx).privacyLink : null), onPress: () => privacyLink.request() });
    ctx.addHotspot({ rect: entry((l) => l.submit), onPress: () => void flow.submit() });
    ctx.addHotspot({ rect: entry((l) => l.field), onPress: () => nameField?.focus() });
  }

  /**
   * Frees portrait while the feedback dialog is open (on any of its pages, ticket #6) or the name entry
   * takes text, after any path that opened or closed them this tick. Closing one in
   * portrait (ROADMAP 75) first drops the keyboard, then (with the keyboard up or a turn to landscape
   * ahead) covers the screen until the view settled, and only then locks landscape again, so no
   * half-sized frame shows while the app turns.
   */
  function updateOrientation(ctx: GameContext): void {
    const typing = !!dialog?.typing() || flow?.screen === 'entry';
    if (wasTyping && !typing && ctx.display.portrait) {
      const keyboard = !!dialog?.isFocused() || entrySurface.isFocused();
      dialog?.blur();
      entrySurface.blur();
      const landscape = typingOrientation.turnsToLandscape();
      // Nothing resizes without the keyboard up or a turn ahead: no cover then.
      if (keyboard || landscape) settleCover?.begin(landscape);
    }
    wasTyping = typing;
    typingOrientation.update(typing);
  }

  /** Android back (back-nav.ts): one level back from the screen on top. */
  function goBack(ctx: GameContext): void {
    switch (backStep(screenSource(ctx))) {
      case 'installGuide':
        return view.install.closeGuide();
      case 'settings':
        return view.settings.close();
      case 'feedback':
        return dialog?.back();
      case 'scores':
        return flow?.close();
      case 'whatsNew':
        return ctx.commands.markVersionSeen();
      case 'pause':
        return ctx.commands.pause();
      case 'title':
        return leaveRun(ctx);
    }
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
    telemetry.session({ touch: display.touch, platform: state.install.platform, kid: state.kidMode });
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
    whatsNew: view.whatsNew,
    settings: view.settings,
    install: view.install,

    init(ctx) {
      uiCtx = ctx;
      setLanguage(loadLanguage(store, browserLanguage ?? undefined));
      view.install.load(ctx.state.install);
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
      backNav = historyEnv ? new BackNav(historyEnv, () => goBack(ctx)) : null;
      ctx.onUserGesture(() => privacyLink.gesture());
      if (browser) {
        bindListScroll(
          { active: () => (whatsNewList(ctx)?.maxScroll ?? 0) > 0, scrollBy: (dy) => view.whatsNew.by(dy), lineHeight: () => whatsNewList(ctx)?.rowH ?? 1 },
          () => document.getElementById('game'),
        );
      }
      if (browser && flow) {
        bindListScroll(
          { active: () => flow.screen === 'list', scrollBy: (dy) => flow.scrollBy(dy), lineHeight: () => listLayout(ctx).rowH },
          () => document.getElementById('game'),
        );
      }
      if (typeof window !== 'undefined' && testHookEnabled()) installUiDebug(ctx, view, feed, () => whatsNewSheet?.scroll() ?? null);
    },

    update(ctx, dt) {
      const { state, display } = ctx;
      rotate.update(display);
      privacyLink.update(dt);
      if (state.mode === 'playing' && rotateShown(ctx)) ctx.commands.pause();
      if ((state.mode === 'title' || state.mode === 'paused') && view.logoHold.update(dt)) view.settings.openMenu(state.kidMode);
      const control = itemControl(display, state.mode, state.carriedItem, handShown(highFiveHand(state.entities), display.touch));
      const hintRect = buttonHintRect(ctx, control === 'button');
      if (riding(state.mode)) {
        const portraitButton = control === 'button' && display.portrait ? itemButtonRect(display.viewWidth, display) : null;
        view.hud.update(state, control === 'keycap', display.safeInsets.left, portraitButton, view.banner.visible);
      }
      // Laid out only while it shows (the scene allocates).
      view.stuntRect = view.stunt.visible
        ? placeCallout(view.stunt, {
            viewWidth: display.viewWidth,
            plate: view.hud.layout.plate,
            chip: view.hud.chip,
            mission: view.hud.mission.plate,
            buttons: hudButtons(display.viewWidth, view.fullscreenAvailable, uiMetrics(display), riding(state.mode)),
            itemButton: control === 'button' ? itemButtonRect(display.viewWidth, display) : null,
            itemHint: hintRect,
            banner: view.banner.visible,
          })
        : null;
      // Popups never rise into the HUD plate or the mission line under it as drawn now (so they stay clear of
      // a skater high on a ledge), nor into the item hint or the stunt callout.
      const plate = view.hud.mission.plate ?? view.hud.layout.plate;
      view.popups.ceiling = popupCeiling(popupCeiling(plate.y + plate.h + BELOW_PLATE, hintRect), view.stuntRect);
      skater.y = Math.round(state.player.y) - SKATER_H;
      view.popups.avoid = popupAvoid(display.viewWidth, display, control, skater, avoid);
      const popups = feed.flush(state.kidMode);
      for (let i = 0; i < popups.length; i++) spawnPopup(ctx, popups[i]!);
      if (state.drunkTimer > view.drunkDuration) view.drunkDuration = state.drunkTimer;
      dialog?.keepOnItsScreen(ctx);
      updateOrientation(ctx);
      updateScores(ctx, dt);
      updateWhatsNew(ctx, dt);
      dialog?.update(ctx, dt);
      rotateSheet?.show(rotateShown(ctx));
      backNav?.update(backStep(screenSource(ctx)) !== null);
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
