/**
 * Drawing of the HUD, the riding overlays, the settings menu and the portrait
 * hint, and the dispatch to the menu screens (menu-screens.ts). Pure
 * rendering: all state comes in through `UiView` (records, popups, banner)
 * and the RenderContext.
 */
import { chillStrength } from '../core/chill';
import { PLAYER_X } from '../core/config';
import { drawText, measureText, type TextOptions } from '../core/font';
import type { Rect, RenderContext } from '../types';
import {
  ARROW_DOWN,
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
import { type Banner, BANNER_H, BANNER_Y } from './banner';
import { chillLook } from './chill-look';
import { centred, fill, menuButton, ribbon, text } from './draw-kit';
import { drunkShown, drunkStrength, GHOST_ALPHA, SECOND_GHOST_ALPHA, swayOffset } from './drunk-look';
import { COMBO_GAP, HEART_STEP, type HudModel, STAR_GAP, STAR_TEXT_GAP } from './hud-model';
import { AlphaColors } from './hud-text';
import { KICKER_HINT_LABEL, type KickerHint, kickerHintRect } from './kicker-hint';
import { CHIP_H, ITEM_HINT_LABEL, type ItemHint, itemButtonRect, itemControl, itemHintRect } from './item-button';
import {
  centreX,
  type HudButtons,
  hudButtons,
  popupLeft,
  popupScale,
  riding,
  settingsLayout,
  type UiMetrics,
  uiMetrics,
} from './layout';
import { MENU_TEXT } from './menu-layout';
import { drawGameOver, drawPause, drawTitle, drawWhatsNew } from './menu-screens';
import { currentMenu, portraitHintShown } from './menu-state';
import type { PopupPool } from './popups';
import type { Records, RunResult } from './records';
import type { LongPress, SettingsMenu } from './settings';
import { TIMER_BAR_H, TIMER_BAR_W, timerBarFill } from './stats';
import { type CalloutRect, calloutLineY, type StuntCallout } from './stunt-callout';
import { type TrickHint, trickHintLabel, trickHintRect } from './trick-hint';

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
  /** "↓ = Trick!" under the skater on the first grinds, until a grind trick was done once. */
  trickHint: TrickHint;
  /** "Über die Rampe nach oben!" while a kicker approaches, until a stunt line was completed once. */
  kickerHint: KickerHint;
  /** "Combo xN!" and "Stunt-Linie! +…" in the upper middle. */
  stunt: StuntCallout;
  /** Where the stunt callout is drawn this tick (set in update), null while hidden. */
  stuntRect: CalloutRect | null;
  /** The hidden settings menu and the long press on the title logo that opens it. */
  settings: SettingsMenu;
  logoHold: LongPress;
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
  g.fillRect(x, y, KEYCAP_W, 10);
  g.fillStyle = UI.white;
  g.fillRect(x, y, KEYCAP_W, 8);
}

const KEYCAP_W = 9;

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
  const kx = chip.x + chip.w - 12;
  const ky = chip.y + 2;
  keyCap(r, kx, ky);
  text(r, 'E', kx + 3, ky, KEYCAP);
}

/** "Tippe auf den Gegenstand" on a plate beside the item button, with a pointer towards it (never while the zone banner shows). */
function drawItemHint(r: RenderContext, view: UiView): void {
  const { g, state, display } = r;
  if (!view.itemHint.visible || itemControl(display, state.mode, state.carriedItem) !== 'button') return;
  const scale = popupScale(display, false);
  const { x, y, w, h, pointsRight } = itemHintRect(display.viewWidth, display, scale);
  ribbon(r, x, y, w, h);
  g.fillStyle = UI.yellow;
  for (let i = 0; i < 4; i++) g.fillRect(pointsRight ? x + w + i : x - 1 - i, y + Math.floor(h / 2) - 3 + i, 1, 7 - 2 * i);
  text(r, ITEM_HINT_LABEL, x + 4, y + 3, scale === 1 ? HINT_TEXT : HINT_TEXT_BIG);
}

/**
 * The grind trick hint on a plate centred under the skater, below the riding
 * line, with a caret pointing up at the skater: a "↓" key cap and "= Trick!"
 * on desktop, "Wisch runter = Trick!" on touch.
 */
function drawTrickHint(r: RenderContext, view: UiView): void {
  if (!view.trickHint.visible) return;
  const { g, display } = r;
  const scale = popupScale(display, false);
  const label = trickHintLabel(display.touch);
  const cap = display.touch ? 0 : KEYCAP_W + 3;
  const h = display.touch ? 8 * scale + 6 : 14;
  const p = trickHintRect(cap + measureText(label, scale) + 8, h, display.viewWidth);
  ribbon(r, p.x, p.y, p.w, p.h);
  g.fillStyle = UI.yellow;
  const tip = Math.min(Math.max(PLAYER_X, p.x + 4), p.x + p.w - 4);
  for (let i = 0; i < 3; i++) g.fillRect(tip - i, p.y - 3 + i, 1 + 2 * i, 1);
  if (cap) {
    keyCap(r, p.x + 4, p.y + 2);
    ARROW_DOWN.draw(g, 0, p.x + 6, p.y + 3);
  }
  text(r, label, p.x + 4 + cap, p.y + 3, scale === 1 ? HINT_TEXT : HINT_TEXT_BIG);
}

/** The kicker hint at the hint spot under the skater, with a caret up at the skater; the grind trick hint wins. */
function drawKickerHint(r: RenderContext, view: UiView): void {
  if (!view.kickerHint.visible || view.trickHint.visible) return;
  const { g, display } = r;
  const scale = popupScale(display, false);
  const p = kickerHintRect(scale, display.viewWidth);
  ribbon(r, p.x, p.y, p.w, p.h);
  g.fillStyle = UI.yellow;
  const tip = Math.min(Math.max(PLAYER_X, p.x + 4), p.x + p.w - 4);
  for (let i = 0; i < 3; i++) g.fillRect(tip - i, p.y - 3 + i, 1 + 2 * i, 1);
  text(r, KICKER_HINT_LABEL, p.x + 4, p.y + 3, scale === 1 ? HINT_TEXT : HINT_TEXT_BIG);
}

/** "Combo xN!" / "Stunt-Linie! +…": big outlined lines centred in their box, fading out at the end. */
function drawStunt(r: RenderContext, view: UiView): void {
  const box = view.stuntRect;
  if (!box) return;
  const { stunt } = view;
  r.g.globalAlpha = stunt.age > 0.75 ? (1 - stunt.age) / 0.25 : 1;
  const cx = box.x + (box.w >> 1);
  for (let i = 0; i < stunt.lines.length; i++) outlined(r, stunt.lines[i]!, cx, calloutLineY(box, i), stunt.color, box.scale);
  r.g.globalAlpha = 1;
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
  const l = settingsLayout(r.display.viewWidth, uiMetrics(r.display));
  fill(r, UI.ink);
  if (settings.open) {
    const on = r.state.kidMode;
    centred(r, 'Einstellungen', 12, { scale: 2, color: UI.yellow });
    menuButton(r, l.toggle, `Kindermodus: ${on ? 'AN' : 'AUS'}`, on ? UI.green : UI.white);
    const note = l.toggle.y + l.toggle.h + 6;
    // Switched during a run: closing the menu restarts it.
    if (settings.switched && r.state.mode === 'paused') centred(r, MENU_TEXT.restartNote, note, { color: UI.yellow });
    else centred(r, on ? 'Kindgerechte Bilder und Texte sind an.' : 'Für Kinder: freundliche Bilder und Texte.', note, { color: UI.muted });
    if (!r.display.touch) centred(r, 'Enter = umschalten, Esc = schließen', l.back.y - 14, { color: UI.muted });
    menuButton(r, l.back, 'Zurück');
  }
}

export function drawUi(r: RenderContext, view: UiView): void {
  const menu = currentMenu(r, view);
  switch (r.state.mode) {
    case 'title':
      if (view.settings.open) drawSettings(r, view);
      else if (r.state.whatsNew.length > 0) drawWhatsNew(r, menu!);
      else drawTitle(r, view, menu!);
      break;
    case 'playing':
      drawDrunk(r, view);
      drawChillTint(r);
      drawStats(r, view);
      drawItemControl(r, view);
      drawLive(r, view);
      drawStunt(r, view);
      drawItemHint(r, view);
      drawTrickHint(r, view);
      drawKickerHint(r, view);
      break;
    case 'paused':
      if (view.settings.open) {
        drawSettings(r, view);
        break;
      }
      drawDrunk(r, view);
      drawChillTint(r);
      drawStats(r, view);
      drawItemControl(r, view);
      drawPause(r, view, menu!);
      break;
    case 'gameover':
      drawGameOver(r, view, menu!);
      break;
  }
  if (portraitHintShown(r, view)) {
    drawPortraitHint(r);
    return;
  }
  if (!view.settings.open) drawButtons(r, view);
}
