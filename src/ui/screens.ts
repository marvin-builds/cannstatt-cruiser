/**
 * Drawing of every UI screen. Pure rendering: all state comes in through
 * `UiView` (records, popups, banner) and the RenderContext.
 */
import { chillStrength } from '../core/chill';
import { GAMEOVER_INPUT_DELAY } from '../core/config';
import { drawText, measureText, type TextOptions } from '../core/font';
import type { RenderContext } from '../types';
import { BUTTON, HEART, ICON_FULLSCREEN, ICON_PAUSE, ICON_PLAY, ICON_SOUND, JOINT_ICON, ROTATE, STAR, UI } from './art';
import type { Banner } from './banner';
import { blinkOn, centreX, formatNumber, hudButtons, metres } from './layout';
import { drawLogo } from './logo';
import type { PopupPool } from './popups';
import type { Records, RunResult } from './records';
import { CHILL_BAR_H, CHILL_BAR_W, chillBarFill, statsLayout } from './stats';

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
}

const LINE = 11;

function text(r: RenderContext, s: string, x: number, y: number, options: TextOptions = {}): void {
  drawText(r.g, s, x, y, { shadow: UI.ink, ...options });
}

function centred(r: RenderContext, s: string, y: number, options: TextOptions = {}): void {
  text(r, s, centreX(r.display.viewWidth), y, { align: 'center', ...options });
}

function fill(r: RenderContext, color: string): void {
  r.g.fillStyle = color;
  r.g.fillRect(0, 0, r.display.viewWidth, r.display.viewHeight);
}

/** Translucent plate behind a block of centred text, `w` wide. */
function panel(r: RenderContext, w: number, y: number, h: number): void {
  r.g.fillStyle = UI.panel;
  r.g.fillRect(centreX(r.display.viewWidth) - Math.floor(w / 2), y, w, h);
}

function hint(r: RenderContext, touch: string, keys: string): string {
  return r.display.touch ? touch : keys;
}

function drawButtons(r: RenderContext, view: UiView): void {
  const b = hudButtons(r.display.viewWidth, view.fullscreenAvailable);
  const { mode, muted } = r.state;
  if (mode === 'playing' || mode === 'paused') {
    BUTTON.draw(r.g, 0, b.pause.x, b.pause.y);
    (mode === 'playing' ? ICON_PAUSE : ICON_PLAY).draw(r.g, 0, b.pause.x + 3, b.pause.y + 3);
  }
  BUTTON.draw(r.g, 0, b.mute.x, b.mute.y);
  ICON_SOUND.draw(r.g, muted ? 1 : 0, b.mute.x + 3, b.mute.y + 3);
  if (b.fullscreen) {
    BUTTON.draw(r.g, 0, b.fullscreen.x, b.fullscreen.y);
    ICON_FULLSCREEN.draw(r.g, r.display.fullscreen ? 1 : 0, b.fullscreen.x + 3, b.fullscreen.y + 3);
  }
}

function drawTitle(r: RenderContext, view: UiView): void {
  const cx = centreX(r.display.viewWidth);
  drawLogo(r.g, cx, 8);

  panel(r, 236, 62, 80);
  centred(r, 'Mit dem Longboard durch Stuttgart', 66, { color: UI.muted });
  if (blinkOn(r.state.modeTime)) {
    centred(r, hint(r, 'Tippen zum Starten', 'Leertaste zum Starten'), 81, { color: UI.yellow });
  }
  centred(r, hint(r, 'Kurz tippen = kleiner Sprung', 'Kurz drücken = kleiner Sprung'), 96);
  centred(r, 'halten = hoher Sprung', 96 + LINE - 1);
  centred(r, hint(r, 'Nach unten wischen = ducken', 'Pfeil runter oder S = ducken'), 96 + 2 * LINE - 2);

  const best = `Highscore ${formatNumber(view.records.highscore)}`;
  const stars = `${formatNumber(view.records.starsTotal)} gesamt`;
  const gap = 14;
  const total = measureText(best) + gap + STAR.width + 3 + measureText(stars);
  let x = cx - Math.floor(total / 2);
  text(r, best, x, 130, { color: UI.white });
  x += measureText(best) + gap;
  STAR.draw(r.g, 0, x, 130);
  text(r, stars, x + STAR.width + 3, 130, { color: UI.white });
}

/** Score, combo, hearts, stars and the chill timer in the top-left corner on a plate sized to them. */
function drawStats(r: RenderContext, view: UiView): void {
  const { state, g } = r;
  const score = formatNumber(state.score);
  const stars = formatNumber(state.stars);
  const combo = state.multiplier > 1 ? `x${state.multiplier}` : '';
  const comboLabel = state.combo > 1 && combo ? `Combo ${state.combo}` : '';
  const scoreW = measureText(score, 2) + (combo ? 6 + measureText(combo, 2) : 0);
  const labelW = comboLabel ? measureText(score, 2) + 6 + measureText(comboLabel) : measureText('Punkte');
  const heartsW = state.maxHealth * 8 - 1;
  const rowW = heartsW + 6 + STAR.width + 3 + measureText(stars);
  const l = statsLayout(Math.max(scoreW, labelW, rowW), state.chillTimer > 0);

  g.fillStyle = UI.panel;
  g.fillRect(l.plate.x, l.plate.y, l.plate.w, l.plate.h);
  text(r, 'Punkte', l.x, l.label, { color: UI.muted });
  text(r, score, l.x, l.score, { scale: 2 });
  if (combo) {
    const x = l.x + measureText(score, 2) + 6;
    text(r, combo, x, l.score, { scale: 2, color: UI.yellow });
    if (comboLabel) text(r, comboLabel, x, l.label, { color: UI.orange });
  }

  for (let i = 0; i < state.maxHealth; i++) HEART.draw(g, i < state.health ? 0 : 1, l.x + i * 8, l.hearts + 1);
  const starX = l.x + heartsW + 6;
  STAR.draw(g, 0, starX, l.hearts);
  text(r, stars, starX + STAR.width + 3, l.hearts);

  if (l.chill !== null) {
    JOINT_ICON.draw(g, 0, l.x, l.chill + 1);
    const y = l.chill + 2;
    g.fillStyle = UI.ink;
    g.fillRect(l.chillBarX, y, CHILL_BAR_W, CHILL_BAR_H);
    g.fillStyle = UI.chillBar;
    g.fillRect(l.chillBarX + 1, y + 1, Math.max(0, chillBarFill(state.chillTimer, view.chillDuration) - 2), CHILL_BAR_H - 2);
  }
}

/** Warm, hazy look while chilled: a steady tint that fades with the effect (no flicker). */
function drawChillTint(r: RenderContext): void {
  const strength = chillStrength(r.state.chillTimer);
  if (strength <= 0) return;
  const { g } = r;
  const { viewWidth: w, viewHeight: h } = r.display;
  g.fillStyle = `rgba(${UI.chillTint}, ${(0.16 * strength).toFixed(3)})`;
  g.fillRect(0, 0, w, h);
  // A slightly denser haze towards the edges, in three steps.
  g.fillStyle = `rgba(${UI.chillTint}, ${(0.06 * strength).toFixed(3)})`;
  for (const inset of [0, 6, 12]) {
    g.fillRect(0, inset, w, 6);
    g.fillRect(0, h - inset - 6, w, 6);
  }
}

/** Popups and the zone ribbon: only while riding, never under the pause dim. */
function drawLive(r: RenderContext, view: UiView): void {
  const { g } = r;

  for (const p of view.popups.active()) {
    g.globalAlpha = p.age > 0.7 ? (1 - p.age) / 0.3 : 1;
    text(r, p.text, p.x, p.y, { color: p.color, align: 'center' });
  }
  g.globalAlpha = 1;

  if (view.banner.visible) {
    const w = measureText(view.banner.text, 2) + 16;
    const x = centreX(r.display.viewWidth) - Math.floor(w / 2);
    const y = 56 - Math.round(view.banner.slide() * 80);
    g.fillStyle = UI.panel;
    g.fillRect(x, y, w, 22);
    g.fillStyle = UI.yellow;
    g.fillRect(x, y, w, 1);
    g.fillRect(x, y + 21, w, 1);
    text(r, view.banner.text, x + 8, y + 4, { scale: 2, color: UI.white });
  }
}

function drawPause(r: RenderContext): void {
  fill(r, UI.dim);
  centred(r, 'Pause', 54, { scale: 3 });
  if (blinkOn(r.state.modeTime)) {
    centred(r, hint(r, 'Tippen zum Weiterfahren', 'Leertaste oder P zum Weiterfahren'), 92, { color: UI.yellow });
  }
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
  centred(r, 'Sturz! Runde vorbei', 16, { scale: 2, color: UI.red });
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

export function portraitHintShown(r: { display: { portrait: boolean; touch: boolean } }, view: UiView): boolean {
  return r.display.portrait && r.display.touch && !view.portraitDismissed;
}

export function drawUi(r: RenderContext, view: UiView): void {
  switch (r.state.mode) {
    case 'title':
      drawTitle(r, view);
      break;
    case 'playing':
      drawChillTint(r);
      drawStats(r, view);
      drawLive(r, view);
      break;
    case 'paused':
      drawChillTint(r);
      drawStats(r, view);
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
  drawButtons(r, view);
}
