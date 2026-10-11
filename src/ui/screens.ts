/**
 * Drawing of the HUD, the riding overlays, the settings menu (and the kid mode
 * notice) and the portrait hint, and the dispatch to the menu screens
 * (menu-screens.ts). Pure
 * rendering: all state comes in through `UiView` (records, popups, banner)
 * and the RenderContext.
 */
import type { FeedbackStatusLike } from '../net/feedback-status';
import type { FeedbackStatusEntry } from '../net/feedback-types';
import { chillStrength } from '../core/chill';
import { PLAYER_X } from '../core/config';
import { drawText, measureText, type TextOptions } from '../core/font';
import type { Rect, RenderContext } from '../types';
import {
  ARROW_DOWN,
  buttonPlateSprite,
  GUM_ICON,
  HEART,
  HAND_ICON,
  HEART_ICON,
  ICON_FULLSCREEN,
  ICON_PAUSE,
  ICON_PLAY,
  ICON_SOUND,
  ICON_TROPHY,
  ITEM_ICONS,
  JOINT_ICON,
  type PixelIcon,
  ROTATE,
  STAR,
  SWIPE_ARROW,
  UI,
} from './art';
import { type Banner, BANNER_H, BANNER_Y } from './banner';
import { chillLook } from './chill-look';
import { centred, fill, iconButton, menuButton, ribbon, text } from './draw-kit';
import { drunkShown, drunkStrength, GHOST_ALPHA, SECOND_GHOST_ALPHA, swayOffset } from './drunk-look';
import { HEART_STEP, type HudModel, STAR_GAP, STAR_TEXT_GAP } from './hud-model';
import { AlphaColors } from './hud-text';
import { type AirTrickHint, airTrickHintPlate } from './air-trick-hint';
import {
  HINT_PAD_X,
  HINT_PAD_Y,
  type HintRow,
  hintRowHeight,
  KEY_DOWN,
  KEYCAP_H,
  KEYCAP_W,
  PIECE_GAP,
  ROW_GAP,
  SWIPE_DOWN_W,
} from './hint-plate';
import type { HintSlot } from './hint-slot';
import { handShown, type HighFiveHint, highFiveHand, highFiveHintPlate } from './high-five';
import { type KickerHint, kickerHintPlate } from './kicker-hint';
import { CHIP_H, ITEM_HINT_LABEL, type ItemHint, itemButtonRect, itemControl, itemHintRect } from './item-button';
import {
  centreX,
  type HudButtons,
  hudButtons,
  popupLeft,
  popupScale,
  riding,
  settingsLayout,
  TEST_DEVICE_LABEL,
  type UiMetrics,
  uiMetrics,
} from './layout';
import { MENU_TEXT } from './menu-layout';
import { drawGameOver, drawPause, drawPrivacyLink, drawStatsSwitch, drawTitle, drawWhatsNew } from './menu-screens';
import { currentMenu, menuScreen, portraitHintShown, trophyShown } from './menu-state';
import type { HighscoreFlow } from './highscore-flow';
import type { FeedbackFlow } from './feedback-flow';
import { feedbackLayout } from './feedback-layout';
import { drawFeedback } from './feedback-screen';
import { scoreEntryLayout, scoreListLayout, titleTrophy } from './score-layout';
import { FEEDBACK_NOTE_TEXT, feedbackNoteLayout } from './feedback-note';
import { KID_NOTICE_OK, KID_NOTICE_TITLE, kidNoticeLayout, kidNoticeLines, kidNoticeRestart } from './kid-notice';
import { drawScoreEntry, drawScoreList } from './score-screens';
import type { PopupPool } from './popups';
import type { Records, RunResult } from './records';
import { fittingNote, KID_NOTE } from './note-text';
import { type LongPress, type SettingsMenu, STATS_TEXT } from './settings';
import { type Sparkle, sparkleDot, SPARKLE_RAYS } from './sparkle';
import { TIMER_BAR_H, TIMER_BAR_W, timerBarFill } from './stats';
import { type CalloutRect, calloutLineY, type StuntCallout } from './stunt-callout';
import { type TrickHint, trickHintPlate } from './trick-hint';
import type { ListScroll } from './whats-new';

export interface UiView {
  records: Records;
  /** Result of the last finished run (game-over screen). */
  lastRun: RunResult | null;
  popups: PopupPool;
  banner: Banner;
  fullscreenAvailable: boolean;
  /** The portrait hint was dismissed for the current orientation. */
  portraitDismissed: boolean;
  /** The player types with portrait freed (typing-orientation.ts): no rotate hint. */
  portraitFree: boolean;
  /** Length of the current chill effect (from chillStart), for the timer bar. */
  chillDuration: number;
  /** Length of the current drunk effect (from drunkStart), for the timer bar and the woozy ease. */
  drunkDuration: number;
  /** Texts and layout of the HUD stats plate, updated every tick. */
  hud: HudModel;
  /** First-time touch hint "Tippe auf den Gegenstand". */
  itemHint: ItemHint;
  /** "↓ = Boardslide!" under the skater on the first grinds, until a grind trick was done once. */
  trickHint: TrickHint;
  /** "Auf der Rampe springen!" / "tippen!" around each kicker, until a few ramp launches were done. */
  kickerHint: KickerHint;
  /** "In der Luft ↓ = Kickflip!" in the air after a launch, until an air trick was done once. */
  airHint: AirTrickHint;
  /** "[E] = High Five!" / "Knopf: High Five!" while a NorDIY high-fiver approaches, until the first high five. */
  highFiveHint: HighFiveHint;
  /** Which riding hint has the hint spot under the skater (shown long enough to read). */
  hints: HintSlot;
  /** "Linie xN!", "Kickflip! +…", "Stunt-Linie! +…" in the top strip between the HUD plate and the buttons. */
  stunt: StuntCallout;
  /** The sparkle burst around the skater on a landed kickflip. */
  sparkle: Sparkle;
  /** Where the stunt callout is drawn this tick (set in update), null while hidden. */
  stuntRect: CalloutRect | null;
  /** The hidden settings menu and the long press on the title logo that opens it. */
  settings: SettingsMenu;
  logoHold: LongPress;
  /** The online list's screens and the "Eintragen" offer; null without an online list (tests, headless). */
  scores: HighscoreFlow | null;
  /** Scroll offset of the "Neu in dieser Version" list. */
  whatsNew: ListScroll;
  /** The feedback screen (title icon, pause button); null without a feedback sender (tests, headless). */
  feedback: FeedbackFlow | null;
  /** What happened to the player's own feedback: its note covers the title once; null without a status check. */
  feedbackStatus: FeedbackStatusLike | null;
}

const MUTED: TextOptions = { color: UI.muted };
const SCORE: TextOptions = { scale: 2 };
const MULTIPLIER: TextOptions = { scale: 2, color: UI.yellow };
const COMBO_LABEL: TextOptions = { color: UI.orange };
const KEYCAP: TextOptions = { color: UI.ink, shadow: '' };

/** Draws centred `s` with a 1 px ink outline all round, so coloured text reads on any background. */
function outlined(r: RenderContext, s: string, x: number, y: number, color: string, scale: number): void {
  const o = outlineText;
  o.scale = scale;
  o.color = UI.ink;
  for (let i = 0; i < OUTLINE.length; i += 2) drawText(r.g, s, x + OUTLINE[i]!, y + OUTLINE[i + 1]!, o);
  o.color = color;
  drawText(r.g, s, x, y, o);
}

const outlineText: TextOptions = { align: 'center' };
/** dx, dy pairs of the outline passes. */
const OUTLINE = [-1, 0, 1, 0, 0, -1, 0, 1, -1, -1, 1, -1, -1, 1, 1, 1];

/** A light key cap (9 x 10: face and darker bottom edge) at `x`, `y`; the label goes on top. */
function keyCap(r: RenderContext, x: number, y: number): void {
  const { g } = r;
  g.fillStyle = UI.muted;
  g.fillRect(x, y, KEYCAP_W, KEYCAP_H);
  g.fillStyle = UI.white;
  g.fillRect(x, y, KEYCAP_W, KEYCAP_H - 2);
}

/** The button row is laid out again only when the width, device or mode changes (drawn every frame). */
const buttonRow = { width: 0, metrics: null as UiMetrics | null, fullscreen: false, pause: false, rects: null as HudButtons | null };

function cachedHudButtons(viewWidth: number, fullscreen: boolean, m: UiMetrics, pause: boolean): HudButtons {
  const c = buttonRow;
  if (!c.rects || c.width !== viewWidth || c.metrics !== m || c.fullscreen !== fullscreen || c.pause !== pause) {
    Object.assign(c, { width: viewWidth, metrics: m, fullscreen, pause, rects: hudButtons(viewWidth, fullscreen, m, pause) });
  }
  return c.rects!;
}

function drawButtons(r: RenderContext, view: UiView): void {
  const m = uiMetrics(r.display);
  const { mode, muted } = r.state;
  const b = cachedHudButtons(r.display.viewWidth, view.fullscreenAvailable, m, riding(mode));
  if (riding(mode)) iconButton(r, m, b.pause, mode === 'playing' ? ICON_PAUSE : ICON_PLAY, 0);
  iconButton(r, m, b.mute, ICON_SOUND, muted ? 1 : 0);
  if (b.fullscreen) iconButton(r, m, b.fullscreen, ICON_FULLSCREEN, r.display.fullscreen ? 1 : 0);
  if (trophyShown(r.state, view)) {
    iconButton(r, m, titleTrophy(r.display.viewWidth, view.fullscreenAvailable, m), ICON_TROPHY, 0);
  }
}

/** The "Bestenliste" or the name entry over the title or game over. */
function drawScores(r: RenderContext, flow: HighscoreFlow, statsOn: boolean): void {
  if (flow.screen === 'list') drawScoreList(r, flow, scoreListLayout(r.display, flow.entries.length, flow.message !== null), statsOn);
  else drawScoreEntry(r, flow, scoreEntryLayout(r.display));
}

/** Score, combo, hearts, stars and the timer rows in the top-left corner, from the HUD model (no allocation). */
function drawStats(r: RenderContext, view: UiView): void {
  const { state, g } = r;
  const hud = view.hud;
  const l = hud.layout;

  g.fillStyle = UI.panel;
  g.fillRect(l.plate.x, l.plate.y, l.plate.w, l.plate.h);
  text(r, 'Punkte', l.x, l.label, MUTED);
  text(r, hud.score.text, l.x, l.score, SCORE);
  if (hud.combo) {
    const x = l.x + hud.comboX;
    text(r, hud.multiplier.text, x, l.score, MULTIPLIER);
    if (hud.showComboLabel) text(r, hud.comboLabel.text, x, l.label, COMBO_LABEL);
  }

  for (let i = 0; i < state.maxHealth; i++) HEART.draw(g, i < state.health ? 0 : 1, l.x + i * HEART_STEP, l.hearts + 1);
  const starX = l.x + state.maxHealth * HEART_STEP - 1 + STAR_GAP;
  STAR.draw(g, 0, starX, l.hearts);
  text(r, hud.stars.text, starX + STAR.width + STAR_TEXT_GAP, l.hearts);

  if (l.chill !== null) {
    const look = chillLook(state.kidMode);
    (look.icon === 'gum' ? GUM_ICON : JOINT_ICON).draw(g, 0, l.x, l.chill + 1);
    timerBar(r, l.barX, l.chill + 2, timerBarFill(state.chillTimer, view.chillDuration), look.bar);
  }
  if (l.drunk !== null) {
    ITEM_ICONS.beer.draw(g, 0, l.x + 1, l.drunk, 1);
    timerBar(r, l.barX, l.drunk + 2, timerBarFill(state.drunkTimer, view.drunkDuration), UI.drunkBar);
  }
}

/** A draining timer bar in the stats plate: ink frame, `fill` px of colour. */
function timerBar(r: RenderContext, x: number, y: number, fill: number, color: string): void {
  const { g } = r;
  g.fillStyle = UI.ink;
  g.fillRect(x, y, TIMER_BAR_W, TIMER_BAR_H);
  g.fillStyle = color;
  g.fillRect(x + 1, y + 1, Math.max(0, fill - 2), TIMER_BAR_H - 2);
}

/** Cached translucent colours per "r, g, b" (the screen tints are drawn every frame). */
const alphaColors = new Map<string, AlphaColors>();

function tint(rgb: string, alpha: number): string {
  let colors = alphaColors.get(rgb);
  if (!colors) {
    colors = new AlphaColors(rgb);
    alphaColors.set(rgb, colors);
  }
  return colors.get(alpha);
}

/** Steady tint while chilled (warm haze, or sweet pink in kid mode) that fades with the effect (no flicker). */
function drawChillTint(r: RenderContext): void {
  const strength = chillStrength(r.state.chillTimer);
  if (strength <= 0) return;
  const { g } = r;
  const { viewWidth: w, viewHeight: h } = r.display;
  const look = chillLook(r.state.kidMode);
  g.fillStyle = tint(look.tint, 0.26 * strength);
  g.fillRect(0, 0, w, h);
  // A denser, deeper band towards the edges, in three steps: shows even where the sky has the tint's hue.
  g.fillStyle = tint(look.edge, 0.1 * strength);
  for (let inset = 0; inset <= 12; inset += 6) {
    g.fillRect(0, inset, w, 6);
    g.fillRect(0, h - inset - 6, w, 6);
  }
}

/**
 * Woozy screen while drunk (never in kid mode): two faint double images of
 * the street that sway against each other, a slow amber wash and a soft
 * vignette that fades in from the left and right edges (no bands). The real
 * image always shows through at more than half strength, so obstacles stay
 * where they really are; the HUD is drawn after it and stays sharp.
 */
function drawDrunk(r: RenderContext, view: UiView): void {
  if (!drunkShown(r.state)) return;
  const strength = drunkStrength(r.state.drunkTimer, view.drunkDuration);
  if (strength <= 0) return;
  const { g } = r;
  const { viewWidth: w, viewHeight: h } = r.display;
  const t = r.state.time;
  const dx = swayOffset(t, strength);
  const dy = swayOffset(t * 0.7 + 1, strength * 0.4);
  if (dx !== 0 || dy !== 0) {
    g.globalAlpha = GHOST_ALPHA * strength;
    g.drawImage(g.canvas, dx, dy);
    g.globalAlpha = SECOND_GHOST_ALPHA * strength;
    g.drawImage(g.canvas, -swayOffset(t * 1.3 + 2, strength * 0.7), -dy);
    g.globalAlpha = 1;
  }
  // The wash breathes slowly, so the woozy feeling never settles.
  g.fillStyle = tint(UI.drunkTint, (0.08 + 0.05 * Math.sin(t * 1.7)) * strength);
  g.fillRect(0, 0, w, h);
  g.globalAlpha = strength;
  g.fillStyle = drunkVignette(g, w);
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 1;
}

/** Widest reach of the drunk vignette from each side (view px) and its alpha right at the edge. */
const VIGNETTE_REACH = 72;
const VIGNETTE_EDGE_ALPHA = 0.28;
let vignette: { g: CanvasRenderingContext2D; width: number; gradient: CanvasGradient } | null = null;

/** A smooth fade from both side edges to clear (no hard bands), built once per buffer and view width. */
function drunkVignette(g: CanvasRenderingContext2D, w: number): CanvasGradient {
  if (vignette?.g === g && vignette.width === w) return vignette.gradient;
  const gradient = g.createLinearGradient(0, 0, w, 0);
  const reach = Math.min(0.5, VIGNETTE_REACH / w);
  const edge = tint(UI.drunkEdge, VIGNETTE_EDGE_ALPHA);
  const clear = tint(UI.drunkEdge, 0);
  gradient.addColorStop(0, edge);
  gradient.addColorStop(reach, clear);
  gradient.addColorStop(1 - reach, clear);
  gradient.addColorStop(1, edge);
  vignette = { g, width: w, gradient };
  return gradient;
}

/**
 * The touch item button (big, under the HUD buttons) or the desktop chip with
 * the "E" key cap; a raised hand instead of the item while a high-fiver is
 * near (on touch from the hint distance on, see high-five.ts).
 */
function drawItemControl(r: RenderContext, view: UiView): void {
  const { state, display, g } = r;
  const hand = handShown(highFiveHand(state.entities), display.touch);
  const control = itemControl(display, state.mode, state.carriedItem, hand);
  if (!control) return;
  const icon = hand || !state.carriedItem ? HAND_ICON : ITEM_ICONS[state.carriedItem];
  if (control === 'button') {
    drawItemButton(r, icon);
    return;
  }
  const chip = view.hud.chip;
  if (!chip) return;
  g.fillStyle = UI.panel;
  g.fillRect(chip.x, chip.y, chip.w, chip.h);
  icon.draw(g, 0, chip.x + 3 + Math.floor((9 - icon.width) / 2), chip.y + Math.floor((CHIP_H - icon.height) / 2), 1);
  const kx = chip.x + chip.w - 12;
  const ky = chip.y + 2;
  keyCap(r, kx, ky);
  text(r, 'E', kx + 3, ky, KEYCAP);
}

function drawItemButton(r: RenderContext, icon: PixelIcon): void {
  const { display, g } = r;
  const b = itemButtonRect(display.viewWidth, display);
  buttonPlateSprite(b.w).draw(g, 0, b.x, b.y);
  const scale = Math.floor((b.w - 12) / Math.max(icon.width, icon.height));
  icon.draw(g, 0, b.x + Math.floor((b.w - icon.width * scale) / 2), b.y + Math.floor((b.h - icon.height * scale) / 2), scale);
}

/** A label on a plate beside the item button, with a pointer towards it. */
function drawButtonHint(r: RenderContext, label: string, scale: number, p: Rect & { pointsRight: boolean }): void {
  const { g } = r;
  const { x, y, w, h, pointsRight } = p;
  ribbon(r, x, y, w, h);
  g.fillStyle = UI.yellow;
  for (let i = 0; i < 4; i++) g.fillRect(pointsRight ? x + w + i : x - 1 - i, y + Math.floor(h / 2) - 3 + i, 1, 7 - 2 * i);
  text(r, label, x + 4, y + 3, scale === 1 ? HINT_TEXT : HINT_TEXT_BIG);
}

/**
 * Beside the touch item button: "Knopf: High Five!" while the high five hint
 * shows, else "Tippe auf den Gegenstand" (never while the zone banner shows).
 */
function drawItemHint(r: RenderContext, view: UiView): void {
  const { state, display } = r;
  if (!display.touch || state.mode !== 'playing') return;
  if (view.highFiveHint.visible) {
    const p = highFiveHintPlate(display);
    if (p.kind === 'button') drawButtonHint(r, p.label, p.scale, p.rect);
    return;
  }
  if (!view.itemHint.visible || itemControl(display, state.mode, state.carriedItem) !== 'button') return;
  const scale = popupScale(display, false);
  drawButtonHint(r, ITEM_HINT_LABEL, scale, itemHintRect(display.viewWidth, display, scale));
}

/** A hint plate at the hint spot: the plate, a caret up at the skater (or `tipX`) and its rows (texts, key caps, arrows). */
function drawHintPlate(r: RenderContext, rows: readonly HintRow[], scale: number, p: Rect, tipX = PLAYER_X): void {
  const { g } = r;
  ribbon(r, p.x, p.y, p.w, p.h);
  g.fillStyle = UI.yellow;
  const tip = Math.min(Math.max(Math.round(tipX), p.x + 4), p.x + p.w - 4);
  for (let i = 0; i < 3; i++) g.fillRect(tip - i, p.y - 3 + i, 1 + 2 * i, 1);
  const options = scale === 1 ? HINT_TEXT : HINT_TEXT_BIG;
  let y = p.y + HINT_PAD_Y;
  for (const row of rows) {
    const h = hintRowHeight(row, scale);
    let x = p.x + HINT_PAD_X;
    for (const piece of row) {
      if (typeof piece === 'string') {
        text(r, piece, x, y + ((h - 8 * scale) >> 1), options);
        x += measureText(piece, scale) + PIECE_GAP;
      } else if ('key' in piece) {
        keyCap(r, x, y);
        if (piece === KEY_DOWN) ARROW_DOWN.draw(g, 0, x + 2, y + 1);
        else text(r, piece.key, x + 3, y, KEYCAP);
        x += KEYCAP_W + PIECE_GAP;
      } else {
        SWIPE_ARROW.draw(g, 0, x, y + ((h - SWIPE_ARROW.height * scale) >> 1), scale);
        x += SWIPE_DOWN_W * scale + PIECE_GAP;
      }
    }
    y += h + ROW_GAP;
  }
}

/**
 * The riding hint at the hint spot, one at a time (the hint slot): the
 * keyboard high five hint, the grind trick hint, the air trick hint or the
 * kicker hint (anchored at its ramp).
 */
function drawRidingHints(r: RenderContext, view: UiView): void {
  const { display } = r;
  const shown = view.hints.kind;
  if (shown === 'highFive') {
    const p = highFiveHintPlate(display);
    if (p.kind === 'spot') drawHintPlate(r, p.rows, p.scale, p.rect);
  } else if (shown === 'trick') {
    const plate = trickHintPlate(display);
    drawHintPlate(r, plate.rows, plate.scale, plate.rect);
  } else if (shown === 'kicker') {
    const anchor = view.kickerHint.anchorX;
    const plate = kickerHintPlate(display, anchor);
    drawHintPlate(r, plate.rows, plate.scale, plate.rect, anchor);
  } else if (shown === 'air') {
    const plate = airTrickHintPlate(display);
    drawHintPlate(r, plate.rows, plate.scale, plate.rect);
  }
}

/** "Linie xN!" / "Kickflip! +…" / "Stunt-Linie! +…": outlined lines centred in their box, fading out at the end. */
function drawStunt(r: RenderContext, view: UiView): void {
  const box = view.stuntRect;
  if (!box) return;
  const { stunt } = view;
  r.g.globalAlpha = stunt.age > 0.75 ? (1 - stunt.age) / 0.25 : 1;
  const cx = box.x + (box.w >> 1);
  for (let i = 0; i < stunt.lines.length; i++) outlined(r, stunt.lines[i]!, cx, calloutLineY(box, i), stunt.colors[i]!, box.scale);
  r.g.globalAlpha = 1;
}

/** Where the current sparkle dot is drawn (reused, no allocation). */
const dot = { x: 0, y: 0 };
/** The sparkle's centre above the skater's feet: his middle. */
const SPARKLE_RISE = 16;

/** The kickflip sparkle: little yellow and white stars flying out from the skater, fading. */
function drawSparkle(r: RenderContext, view: UiView): void {
  const { sparkle } = view;
  if (!sparkle.visible) return;
  const { g } = r;
  const age = sparkle.age;
  const cy = Math.round(r.state.player.y) - SPARKLE_RISE;
  g.globalAlpha = age > 0.6 ? (1 - age) / 0.4 : 1;
  for (let i = 0; i < SPARKLE_RAYS; i++) {
    sparkleDot(i, age, dot);
    const x = PLAYER_X + dot.x;
    const y = cy + dot.y;
    // A little plus, every other one bigger and yellow.
    const arm = i % 2 ? 1 : 2;
    g.fillStyle = i % 2 ? UI.white : UI.yellow;
    g.fillRect(x - arm, y, 2 * arm + 1, 1);
    g.fillRect(x, y - arm, 1, 2 * arm + 1);
  }
  g.globalAlpha = 1;
}

const HINT_TEXT: TextOptions = { color: UI.yellow };
const HINT_TEXT_BIG: TextOptions = { color: UI.yellow, scale: 2 };

/** Popups and the zone ribbon: only while riding, never under the pause dim. */
function drawLive(r: RenderContext, view: UiView): void {
  const { g } = r;

  for (const p of view.popups.active()) {
    g.globalAlpha = p.age > 0.7 ? (1 - p.age) / 0.3 : 1;
    // Text and icon form one box (1 px outline on both sides) centred on the popup, kept off the view edges.
    const w = measureText(p.text, p.scale);
    const iconW = p.icon ? (HEART_ICON.width + 2) * p.scale : 0;
    const left = popupLeft(p.x, w + 2 + iconW, r.display.viewWidth);
    outlined(r, p.text, left + 1 + (w >> 1), p.y, p.color, p.scale);
    if (p.icon) HEART_ICON.draw(g, 0, left + 1 + w + 2 * p.scale, p.y + p.scale, p.scale);
  }
  g.globalAlpha = 1;

  if (view.banner.visible) {
    const w = measureText(view.banner.text, 2) + 16;
    const x = centreX(r.display.viewWidth) - Math.floor(w / 2);
    const y = BANNER_Y - Math.round(view.banner.slide() * 80);
    ribbon(r, x, y, w, BANNER_H);
    text(r, view.banner.text, x + 8, y + 4, { scale: 2, color: UI.white });
  }
}

function drawPortraitHint(r: RenderContext): void {
  fill(r, UI.ink);
  const cx = centreX(r.display.viewWidth);
  ROTATE.draw(r.g, 0, cx - Math.floor(ROTATE.width / 2), 22);
  centred(r, 'Bitte Gerät drehen', 66, { scale: 2, color: UI.yellow });
  centred(r, 'Im Querformat fährt es sich besser.', 92);
  centred(r, 'Tippen zum Ignorieren', 120, { color: UI.muted });
}

function drawSettings(r: RenderContext, view: UiView): void {
  const { settings } = view;
  fill(r, UI.ink);
  if (settings.screen === 'kidNotice') {
    drawKidNotice(r, kidNoticeRestart(settings, r.state));
    return;
  }
  const l = settingsLayout(r.display.viewWidth, uiMetrics(r.display));
  const on = r.state.kidMode;
  centred(r, 'Einstellungen', l.titleY, { scale: 2, color: UI.yellow });
  menuButton(r, l.toggle, `Kindermodus: ${on ? 'AN' : 'AUS'}`, on ? UI.green : UI.white);
  // The notes at the layout's scale (2 in portrait), in a shorter wording where the long one does not fit.
  const note = (texts: readonly string[], y: number, color: string) => {
    const fit = fittingNote(texts, l.noteScale, r.display.viewWidth - 8);
    centred(r, fit.text, y, { color, scale: fit.scale });
  };
  // Switched during a run: closing the menu restarts it.
  if (settings.switched && r.state.mode === 'paused') note([MENU_TEXT.restartNote], l.kidNoteY, UI.yellow);
  else note(on ? KID_NOTE.on : KID_NOTE.off, l.kidNoteY, UI.muted);
  drawStatsSwitch(r, l.stats, settings.statsOn);
  drawPrivacyLink(r, l.privacyLink);
  note(settings.statsOn ? [STATS_TEXT.note, STATS_TEXT.noteShort] : [STATS_TEXT.offNote], l.statsNoteY, UI.muted);
  if (l.keysY !== null) centred(r, SETTINGS_KEYS, l.keysY, { color: UI.muted });
  menuButton(r, l.back, 'Zurück');
  if (settings.testDevice) text(r, TEST_DEVICE_LABEL, l.testDevice.x, l.testDevice.y, { scale: l.testDevice.scale, color: UI.muted });
}

/** Desktop key help of the settings menu. */
export const SETTINGS_KEYS = 'Enter = Kindermodus, A = Statistik, Esc = zurück';

/** "Kindermodus ist an" after turning it on in the menu: what it does, the way back, the restart (paused run), OK. */
function drawKidNotice(r: RenderContext, restart: boolean): void {
  const l = kidNoticeLayout(r.display, restart);
  const colors = [UI.muted, UI.white, UI.yellow];
  centred(r, KID_NOTICE_TITLE, l.title, { scale: 2, color: UI.green });
  kidNoticeLines(r.display.touch, restart).forEach((s, i) => centred(r, s, l.lines + i * l.lineH, { scale: l.scale, color: colors[i] }));
  menuButton(r, l.ok, KID_NOTICE_OK, UI.yellow);
}

/** "Dein Feedback: umgesetzt!" and the like: headline, the reply or a default line, OK (feedback-note.ts). */
function drawFeedbackNote(r: RenderContext, note: FeedbackStatusEntry): void {
  const l = feedbackNoteLayout(r.display, note);
  fill(r, UI.ink);
  centred(r, l.headline, l.headlineY, { scale: 2, color: l.headlineColor });
  const color = l.reply ? UI.white : UI.muted;
  l.lines.forEach((s, i) => centred(r, s, l.linesY + i * l.lineH, { scale: l.scale, color }));
  menuButton(r, l.ok, FEEDBACK_NOTE_TEXT.ok, UI.yellow);
}

export function drawUi(r: RenderContext, view: UiView): void {
  const menu = currentMenu(r, view);
  const screen = menuScreen(r.state, view);
  switch (r.state.mode) {
    case 'title':
      if (view.settings.open) drawSettings(r, view);
      else if (view.scores?.open) drawScores(r, view.scores, view.settings.statsOn);
      else if (view.feedback?.open) drawFeedback(r, view.feedback, feedbackLayout(r.display));
      else if (screen === 'whatsNew') drawWhatsNew(r, menu!, view.whatsNew.offset);
      else if (screen === 'feedbackNote') drawFeedbackNote(r, view.feedbackStatus!.note!);
      else drawTitle(r, view, menu!);
      break;
    case 'playing':
      drawDrunk(r, view);
      drawChillTint(r);
      drawStats(r, view);
      drawItemControl(r, view);
      drawSparkle(r, view);
      drawLive(r, view);
      drawStunt(r, view);
      drawItemHint(r, view);
      drawRidingHints(r, view);
      break;
    case 'paused':
      if (view.settings.open) {
        drawSettings(r, view);
        break;
      }
      if (view.feedback?.open) {
        drawFeedback(r, view.feedback, feedbackLayout(r.display));
        break;
      }
      drawDrunk(r, view);
      drawChillTint(r);
      drawStats(r, view);
      drawItemControl(r, view);
      drawPause(r, view, menu!);
      break;
    case 'gameover':
      if (view.scores?.open) drawScores(r, view.scores, view.settings.statsOn);
      else drawGameOver(r, view, menu!);
      break;
  }
  if (portraitHintShown(r, view)) {
    drawPortraitHint(r);
    return;
  }
  // Modal screens hide the HUD buttons (only M mutes there).
  if (!view.settings.open && !view.scores?.open && !view.feedback?.open && screen !== 'feedbackNote') drawButtons(r, view);
}
