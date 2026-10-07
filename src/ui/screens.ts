/**
 * Drawing of every UI screen. Pure rendering: all state comes in through
 * `UiView` (records, popups, banner) and the RenderContext.
 */
import { GAMEOVER_INPUT_DELAY } from '../core/config';
import { drawText, measureText, type TextOptions } from '../core/font';
import type { RenderContext } from '../types';
import { BUTTON, HEART, ICON_FULLSCREEN, ICON_PAUSE, ICON_PLAY, ICON_SOUND, ROTATE, STAR, UI } from './art';
import type { Banner } from './banner';
import { blinkOn, centreX, formatNumber, hudButtons, metres } from './layout';
import { drawLogo } from './logo';
import type { PopupPool } from './popups';
import type { Records, RunResult } from './records';

export interface UiView {
  records: Records;
  /** Result of the last finished run (game-over screen). */
  lastRun: RunResult | null;
  popups: PopupPool;
  banner: Banner;
  fullscreenAvailable: boolean;
  /** The portrait hint was dismissed for the current orientation. */
  portraitDismissed: boolean;
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

/** Score, combo, hearts and stars in the top-left corner on a translucent plate. */
function drawStats(r: RenderContext): void {
  const { state, g } = r;
  const score = formatNumber(state.score);
  const combo = state.multiplier > 1 ? `x${state.multiplier}` : '';
  const scoreW = measureText(score, 2) + (combo ? 6 + measureText(combo, 2) : 0);
  const comboLabel = state.combo > 1 && combo ? `Combo ${state.combo}` : '';
  const labelW = comboLabel ? measureText(score, 2) + 6 + measureText(comboLabel) : measureText('Punkte');
  g.fillStyle = UI.panel;
  g.fillRect(2, 2, Math.max(scoreW, labelW, state.maxHealth * 8) + 9, 49);
  text(r, 'Punkte', 6, 4, { color: UI.muted });
  text(r, score, 6, 13, { scale: 2 });
  if (combo) {
    const x = 6 + measureText(score, 2) + 6;
    text(r, combo, x, 13, { scale: 2, color: UI.yellow });
    if (comboLabel) text(r, comboLabel, x, 4, { color: UI.orange });
  }

  for (let i = 0; i < state.maxHealth; i++) HEART.draw(g, i < state.health ? 0 : 1, 6 + i * 8, 32);

  STAR.draw(g, 0, 6, 41);
  text(r, formatNumber(state.stars), 16, 41);
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
    centred(r, hint(r, 'Tippen zum Weiterfahren', 'P drücken zum Weiterfahren'), 92, { color: UI.yellow });
  }
}

/** One "label  value" row of the game-over table, split at the centre line. */
function row(r: RenderContext, label: string, value: string, y: number, color: string = UI.white): void {
  const cx = centreX(r.display.viewWidth);
  text(r, label, cx - 4, y, { align: 'right', color: UI.muted });
  text(r, value, cx + 4, y, { color });
}

function drawGameOver(r: RenderContext, view: UiView): void {
  fill(r, UI.dim);
  const { state } = r;
  const run = view.lastRun;
  centred(r, 'Sturz! Runde vorbei', 16, { scale: 2, color: UI.red });
  if (run?.newRecord && blinkOn(state.modeTime * 2)) centred(r, 'Neuer Rekord!', 38, { scale: 2, color: UI.yellow });

  panel(r, 180, 58, 66);
  row(r, 'Punkte', formatNumber(state.score), 62, run?.newRecord ? UI.yellow : UI.white);
  row(r, 'Highscore', formatNumber(view.records.highscore), 62 + LINE);
  row(r, 'Sterne', formatNumber(state.stars), 62 + LINE * 2);
  row(r, 'Sterne gesamt', formatNumber(view.records.starsTotal), 62 + LINE * 3);
  row(r, 'Strecke', `${formatNumber(metres(state.distance))} m`, 62 + LINE * 4);

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
  ROTATE.draw(r.g, 0, cx - Math.floor(ROTATE.width / 2), 40);
  centred(r, 'Bitte Gerät drehen', 70, { scale: 2, color: UI.yellow });
  centred(r, 'Im Querformat fährt es sich besser.', 94);
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
      drawStats(r);
      drawLive(r, view);
      break;
    case 'paused':
      drawStats(r);
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
