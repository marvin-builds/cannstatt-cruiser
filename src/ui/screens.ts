/**
 * Drawing of every UI screen. Pure rendering: all state comes in through
 * `UiView` (records, popups, banner) and the RenderContext.
 */
import { chillStrength } from '../core/chill';
import { GAMEOVER_INPUT_DELAY } from '../core/config';
import { drawText, measureText, type TextOptions } from '../core/font';
import type { RenderContext } from '../types';
import type { Rect } from '../types';
import {
  buttonPlateSprite,
  GUM_ICON,
  HEART,
  HEART_ICON,
  ICON_FULLSCREEN,
  ICON_PAUSE,
  ICON_PLAY,
  ICON_SIZE,
  ICON_SOUND,
  ITEM_ICONS,
  JOINT_ICON,
  type PixelIcon,
  ROTATE,
  STAR,
  UI,
} from './art';
import type { Banner } from './banner';
import { chillLook } from './chill-look';
import { drunkShown, drunkStrength, swayOffset } from './drunk-look';
import { COMBO_GAP, HEART_STEP, type HudModel, STAR_GAP, STAR_TEXT_GAP } from './hud-model';
import { AlphaColors } from './hud-text';
import { CHIP_H, type ItemHint, itemButtonRect, itemControl } from './item-button';
import {
  answerLabel,
  blinkOn,
  centreX,
  fitCentred,
  formatNumber,
  type HudButtons,
  hudButtons,
  metres,
  popupScale,
  riding,
  settingsLayout,
  type UiMetrics,
  uiMetrics,
} from './layout';
import { drawLogo, logoRect } from './logo';
import type { PopupPool } from './popups';
import type { Records, RunResult } from './records';
import type { LongPress, SettingsMenu } from './settings';
import { TIMER_BAR_H, TIMER_BAR_W, timerBarFill } from './stats';

export interface UiView {
  records: Records;
  /** Result of the last finished run (game-over screen). */
  lastRun: RunResult | null;
  popups: PopupPool;
  banner: Banner;
  fullscreenAvailable: boolean;
  /** The portrait hint was dismissed for the current orientation. */
  portraitDismissed: boolean;
  /** Length of the current chill effect (from chillStart), for the timer bar. */
  chillDuration: number;
  /** Length of the current drunk effect (from drunkStart), for the timer bar and the woozy ease. */
  drunkDuration: number;
  /** Texts and layout of the HUD stats plate, updated every tick. */
  hud: HudModel;
  /** First-time touch hint "Tippe auf den Gegenstand". */
  itemHint: ItemHint;
  /** The hidden settings menu and the long press on the title logo that opens it. */
  settings: SettingsMenu;
  logoHold: LongPress;
}

const LINE = 11;

/*
 * Text helpers reuse one options object and the HUD passes module-level
 * option constants: the HUD and popups draw every frame and must not allocate.
 */
const NO_TEXT_OPTIONS: TextOptions = {};
const scratch: TextOptions = {};

function text(r: RenderContext, s: string, x: number, y: number, options = NO_TEXT_OPTIONS): void {
  scratch.color = options.color;
  scratch.scale = options.scale;
  scratch.align = options.align;
  scratch.shadow = options.shadow ?? UI.ink;
  drawText(r.g, s, x, y, scratch);
}

function centred(r: RenderContext, s: string, y: number, options: TextOptions = {}): void {
  text(r, s, centreX(r.display.viewWidth), y, { align: 'center', ...options });
}

const MUTED: TextOptions = { color: UI.muted };
const SCORE: TextOptions = { scale: 2 };
const MULTIPLIER: TextOptions = { scale: 2, color: UI.yellow };
const COMBO_LABEL: TextOptions = { color: UI.orange };
const KEYCAP: TextOptions = { color: UI.ink, shadow: '' };

function fill(r: RenderContext, color: string): void {
  r.g.fillStyle = color;
  r.g.fillRect(0, 0, r.display.viewWidth, r.display.viewHeight);
}

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

/** Opaque plate with a yellow rule above and below (zone banner, pause prompt), `x`..`x + w`. */
function ribbon(r: RenderContext, x: number, y: number, w: number, h: number): void {
  const { g } = r;
  g.fillStyle = UI.panel;
  g.fillRect(x, y, w, h);
  g.fillStyle = UI.yellow;
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y + h - 1, w, 1);
}

/** Opaque plate behind a block of centred text, `w` wide. */
function panel(r: RenderContext, w: number, y: number, h: number): void {
  r.g.fillStyle = UI.panel;
  r.g.fillRect(centreX(r.display.viewWidth) - Math.floor(w / 2), y, w, h);
}

function hint(r: RenderContext, touch: string, keys: string): string {
  return r.display.touch ? touch : keys;
}

/** One HUD button: the plate centred in its tap area (as layout.ts buttonPlate), the icon centred on the plate. */
function hudButton(r: RenderContext, m: UiMetrics, hit: Rect, icon: PixelIcon, frame: number): void {
  const plateInset = Math.floor((hit.w - m.plate) / 2);
  const x = hit.x + plateInset;
  const y = hit.y + plateInset;
  buttonPlateSprite(m.plate).draw(r.g, 0, x, y);
  const inset = Math.floor((m.plate - ICON_SIZE * m.iconScale) / 2);
  icon.draw(r.g, frame, x + inset, y + inset, m.iconScale);
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
  if (riding(mode)) hudButton(r, m, b.pause, mode === 'playing' ? ICON_PAUSE : ICON_PLAY, 0);
  hudButton(r, m, b.mute, ICON_SOUND, muted ? 1 : 0);
  if (b.fullscreen) hudButton(r, m, b.fullscreen, ICON_FULLSCREEN, r.display.fullscreen ? 1 : 0);
}

/** A 2 px yellow bar under the logo that fills while it is held (shown only after LONG_PRESS_HINT_DELAY). */
function drawHoldProgress(r: RenderContext, progress: number): void {
  if (progress <= 0) return;
  const { g } = r;
  const logo = logoRect(r.display.viewWidth);
  const w = logo.w - 20;
  const x = logo.x + 10;
  const y = TITLE_PANEL_Y - 3;
  g.fillStyle = UI.ink;
  g.fillRect(x - 1, y - 1, w + 2, 4);
  g.fillStyle = UI.empty;
  g.fillRect(x, y, w, 2);
  g.fillStyle = UI.yellow;
  g.fillRect(x, y, Math.round(w * progress), 2);
  g.fillStyle = UI.white;
  g.fillRect(x, y, Math.round(w * progress), 1);
}

/** Top of the title's text panel, just under the logo. */
const TITLE_PANEL_Y = 66;

function drawTitle(r: RenderContext, view: UiView): void {
  const cx = centreX(r.display.viewWidth);
  const { touch } = r.display;
  drawLogo(r.g, r.display.viewWidth);

  const y = TITLE_PANEL_Y + 3;
  const hints = y + 27;
  const keys = hints + 4 * LINE + 1;
  const rowY = touch ? keys + 2 : keys + LINE + 3;
  panel(r, 236, TITLE_PANEL_Y, rowY + LINE - TITLE_PANEL_Y);
  drawHoldProgress(r, view.logoHold.progress);
  centred(r, 'Mit dem Longboard durch Stuttgart', y, { color: UI.muted });
  if (blinkOn(r.state.modeTime)) {
    centred(r, hint(r, 'Tippen zum Starten', 'Leertaste zum Starten'), y + 13, { color: UI.yellow });
  }
  centred(r, hint(r, 'Kurz tippen = kleiner Sprung', 'Leertaste kurz = kleiner Sprung'), hints);
  centred(r, 'Halten = hoher Sprung', hints + LINE);
  centred(r, hint(r, 'Nach unten wischen = ducken', 'Pfeil runter oder S = ducken'), hints + 2 * LINE);
  centred(r, hint(r, 'Gegenstand antippen = benutzen', 'E = Gegenstand benutzen'), hints + 3 * LINE);
  if (!touch) centred(r, 'P/Esc = Pause, M = Ton aus', keys, { color: UI.muted });

  const best = `Highscore ${formatNumber(view.records.highscore)}`;
  const stars = `${formatNumber(view.records.starsTotal)} gesamt`;
  const gap = 14;
  const total = measureText(best) + gap + STAR.width + 3 + measureText(stars);
  let x = cx - Math.floor(total / 2);
  text(r, best, x, rowY, { color: UI.white });
  x += measureText(best) + gap;
  STAR.draw(r.g, 0, x, rowY);
  text(r, stars, x + STAR.width + 3, rowY, { color: UI.white });
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
    const x = l.x + hud.score.width + COMBO_GAP;
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
 * Woozy screen while drunk (never in kid mode): a faint double image of the
 * street that sways sideways, and a soft vignette at the left and right
 * edges. Faint enough that obstacles stay sharp where they really are.
 */
function drawDrunk(r: RenderContext, view: UiView): void {
  if (!drunkShown(r.state)) return;
  const strength = drunkStrength(r.state.drunkTimer, view.drunkDuration);
  if (strength <= 0) return;
  const { g } = r;
  const { viewWidth: w, viewHeight: h } = r.display;
  const dx = swayOffset(r.state.time, strength);
  const dy = swayOffset(r.state.time * 0.7 + 1, strength * 0.4);
  if (dx !== 0 || dy !== 0) {
    g.globalAlpha = 0.3 * strength;
    g.drawImage(g.canvas, dx, dy);
    g.globalAlpha = 1;
  }
  g.fillStyle = tint(UI.drunkTint, 0.08 * strength);
  g.fillRect(0, 0, w, h);
  g.fillStyle = tint(UI.drunkEdge, 0.16 * strength);
  for (let inset = 0; inset <= 16; inset += 8) {
    g.fillRect(inset, 0, 8, h);
    g.fillRect(w - inset - 8, 0, 8, h);
  }
}

/** The touch item button (big, under the HUD buttons) or the desktop chip with the "E" key cap. */
function drawItemControl(r: RenderContext, view: UiView): void {
  const { state, display, g } = r;
  const item = state.carriedItem;
  const control = itemControl(display, state.mode, item);
  if (!item || !control) return;
  const icon = ITEM_ICONS[item];
  if (control === 'button') {
    const b = itemButtonRect(display.viewWidth, display);
    buttonPlateSprite(b.w).draw(g, 0, b.x, b.y);
    const scale = Math.floor((b.w - 12) / Math.max(icon.width, icon.height));
    icon.draw(g, 0, b.x + Math.floor((b.w - icon.width * scale) / 2), b.y + Math.floor((b.h - icon.height * scale) / 2), scale);
    return;
  }
  const chip = view.hud.chip;
  if (!chip) return;
  g.fillStyle = UI.panel;
  g.fillRect(chip.x, chip.y, chip.w, chip.h);
  icon.draw(g, 0, chip.x + 3 + Math.floor((9 - icon.width) / 2), chip.y + Math.floor((CHIP_H - icon.height) / 2), 1);
  // The key cap: light face, darker bottom edge, an ink "E".
  const kx = chip.x + chip.w - 12;
  const ky = chip.y + 2;
  g.fillStyle = UI.muted;
  g.fillRect(kx, ky, 9, 10);
  g.fillStyle = UI.white;
  g.fillRect(kx, ky, 9, 8);
  text(r, 'E', kx + 3, ky, KEYCAP);
}

/** "Tippe auf den Gegenstand" on a plate left of the item button, with a pointer towards it (drawn above the zone banner). */
function drawItemHint(r: RenderContext, view: UiView): void {
  const { g, state, display } = r;
  if (!view.itemHint.visible || itemControl(display, state.mode, state.carriedItem) !== 'button') return;
  const button = itemButtonRect(display.viewWidth, display);
  const scale = popupScale(r.display, false);
  const label = 'Tippe auf den Gegenstand';
  const w = measureText(label, scale) + 8;
  const h = 8 * scale + 6;
  const x = button.x - w - 6;
  const y = button.y + Math.floor((button.h - h) / 2);
  ribbon(r, x, y, w, h);
  g.fillStyle = UI.yellow;
  for (let i = 0; i < 4; i++) g.fillRect(x + w + i, y + Math.floor(h / 2) - 3 + i, 1, 7 - 2 * i);
  text(r, label, x + 4, y + 3, scale === 1 ? HINT_TEXT : HINT_TEXT_BIG);
}

const HINT_TEXT: TextOptions = { color: UI.yellow };
const HINT_TEXT_BIG: TextOptions = { color: UI.yellow, scale: 2 };

/** Popups and the zone ribbon: only while riding, never under the pause dim. */
function drawLive(r: RenderContext, view: UiView): void {
  const { g } = r;

  for (const p of view.popups.active()) {
    g.globalAlpha = p.age > 0.7 ? (1 - p.age) / 0.3 : 1;
    // Keep wide popups (portrait, catch texts, an icon after them) inside the left edge.
    const w = measureText(p.text, p.scale);
    const iconW = p.icon ? (HEART_ICON.width + 2) * p.scale : 0;
    const x = Math.max(p.x, 2 + Math.ceil(w / 2) + iconW);
    outlined(r, p.text, x - (iconW >> 1), p.y, p.color, p.scale);
    if (p.icon) HEART_ICON.draw(g, 0, x - (iconW >> 1) + Math.ceil(w / 2) + 2 * p.scale, p.y + p.scale, p.scale);
  }
  g.globalAlpha = 1;

  if (view.banner.visible) {
    const w = measureText(view.banner.text, 2) + 16;
    const x = centreX(r.display.viewWidth) - Math.floor(w / 2);
    const y = 56 - Math.round(view.banner.slide() * 80);
    ribbon(r, x, y, w, 22);
    text(r, view.banner.text, x + 8, y + 4, { scale: 2, color: UI.white });
  }
}

function drawPause(r: RenderContext): void {
  fill(r, UI.dim);
  centred(r, 'Pause', 54, { scale: 3 });
  const prompt = hint(r, 'Tippen zum Weiterfahren', 'Leertaste, P oder Esc zum Weiterfahren');
  const w = measureText(prompt) + 16;
  ribbon(r, centreX(r.display.viewWidth) - Math.floor(w / 2), 88, w, 15);
  if (blinkOn(r.state.modeTime)) centred(r, prompt, 92, { color: UI.yellow });
  if (!r.display.touch) centred(r, 'E = Gegenstand benutzen, M = Ton aus', 110, { color: UI.muted });
}

/** One "label  value" row of the game-over table, split at the centre line. */
function row(r: RenderContext, label: string, value: string, y: number, color: string = UI.white): void {
  const cx = centreX(r.display.viewWidth);
  text(r, label, cx - 4, y, { align: 'right', color: UI.muted });
  text(r, value, cx + 4, y, { color });
}

/** Top of the first game-over table row. */
const TABLE_Y = 62;
const TABLE_PAD = 4;

function drawGameOver(r: RenderContext, view: UiView): void {
  fill(r, UI.dim);
  const { state } = r;
  const run = view.lastRun;
  // Centred, unless that runs under the button row (portrait): then left of it.
  const buttons = hudButtons(r.display.viewWidth, view.fullscreenAvailable, uiMetrics(r.display), false);
  const title = 'Sturz! Runde vorbei';
  const titleX = fitCentred(measureText(title, 2), r.display.viewWidth, (buttons.fullscreen ?? buttons.mute).x);
  text(r, title, titleX, 16, { scale: 2, color: UI.red, align: 'center' });
  if (run?.newRecord && blinkOn(state.modeTime * 2)) centred(r, 'Neuer Rekord!', 38, { scale: 2, color: UI.yellow });

  const rows: [string, string, string][] = [
    ['Punkte', formatNumber(state.score), run?.newRecord ? UI.yellow : UI.white],
    ['Highscore', formatNumber(view.records.highscore), UI.white],
    ['Sterne', formatNumber(state.stars), UI.white],
    ['Sterne gesamt', formatNumber(view.records.starsTotal), UI.white],
    ['Strecke', `${formatNumber(metres(state.distance))} m`, UI.white],
  ];
  // Labels end and values start 4 px from the centre line: the plate is as wide as the longer side, twice.
  const half = 4 + Math.max(...rows.flatMap(([label, value]) => [measureText(label), measureText(value)]));
  const bottom = TABLE_Y + LINE * (rows.length - 1) + 8;
  panel(r, 2 * (half + TABLE_PAD), TABLE_Y - TABLE_PAD, bottom - TABLE_Y + 2 * TABLE_PAD);
  rows.forEach(([label, value, color], i) => row(r, label, value, TABLE_Y + LINE * i, color));

  if (state.modeTime >= GAMEOVER_INPUT_DELAY) {
    if (blinkOn(state.modeTime - GAMEOVER_INPUT_DELAY)) {
      centred(r, hint(r, 'Tippen für eine neue Runde', 'Leertaste für eine neue Runde'), 134, { color: UI.yellow });
    }
    if (!r.display.touch) centred(r, 'Esc = zum Titelbild', 147, { color: UI.muted });
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

/** A settings menu button: rounded face with an edge and a centred label. */
function menuButton(r: RenderContext, rect: Rect, label: string, color: string = UI.white): void {
  const { g } = r;
  const { x, y, w, h } = rect;
  g.fillStyle = UI.buttonEdge;
  g.fillRect(x + 1, y, w - 2, h);
  g.fillRect(x, y + 1, w, h - 2);
  g.fillStyle = UI.buttonFace;
  g.fillRect(x + 1, y + 1, w - 2, h - 2);
  const scale = h >= 24 ? 2 : 1;
  text(r, label, x + Math.floor(w / 2), y + Math.floor((h - 7 * scale) / 2), { align: 'center', scale, color });
}

function drawSettings(r: RenderContext, view: UiView): void {
  const { settings } = view;
  const l = settingsLayout(r.display.viewWidth, uiMetrics(r.display));
  fill(r, UI.ink);
  if (settings.screen === 'menu') {
    const on = r.state.kidMode;
    centred(r, 'Einstellungen', 12, { scale: 2, color: UI.yellow });
    menuButton(r, l.toggle, `Kindermodus: ${on ? 'AN' : 'AUS'}`, on ? UI.green : UI.white);
    centred(r, on ? 'Kindgerechte Bilder und Texte sind an.' : 'Für Kinder: freundliche Bilder und Texte.', l.toggle.y + l.toggle.h + 6, {
      color: UI.muted,
    });
    if (!r.display.touch) centred(r, 'Enter = umschalten, Esc = schließen', l.back.y - 14, { color: UI.muted });
    menuButton(r, l.back, 'Zurück');
  } else if (settings.question) {
    const q = settings.question;
    centred(r, 'Elternfrage: Kindermodus ausschalten?', 12, { color: UI.muted });
    centred(r, `Wie viel ist ${q.a} × ${q.b}?`, 28, { scale: 2, color: UI.yellow });
    q.answers.forEach((n, i) => menuButton(r, l.answers[i]!, answerLabel(i, n)));
    if (!r.display.touch) centred(r, 'Tasten 1, 2, 3 = antworten, Esc = schließen', l.back.y - 14, { color: UI.muted });
    menuButton(r, l.back, 'Zurück');
  }
}

export function portraitHintShown(r: { display: { portrait: boolean; touch: boolean } }, view: UiView): boolean {
  return r.display.portrait && r.display.touch && !view.portraitDismissed;
}

export function drawUi(r: RenderContext, view: UiView): void {
  switch (r.state.mode) {
    case 'title':
      if (view.settings.open) drawSettings(r, view);
      else drawTitle(r, view);
      break;
    case 'playing':
      drawDrunk(r, view);
      drawChillTint(r);
      drawStats(r, view);
      drawItemControl(r, view);
      drawLive(r, view);
      drawItemHint(r, view);
      break;
    case 'paused':
      drawDrunk(r, view);
      drawChillTint(r);
      drawStats(r, view);
      drawItemControl(r, view);
      drawPause(r);
      break;
    case 'gameover':
      drawGameOver(r, view);
      break;
  }
  if (portraitHintShown(r, view)) {
    drawPortraitHint(r);
    return;
  }
  if (!view.settings.open) drawButtons(r, view);
}
