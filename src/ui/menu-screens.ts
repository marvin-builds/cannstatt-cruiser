/**
 * Drawing of the menu screens: title, "Neu in dieser Version", pause and game
 * over, with their notice cards (reload, install hint) and buttons. Positions
 * come from the screen's MenuLayout (menu-layout.ts), the same rects the
 * hotspots use.
 */
import { GAMEOVER_INPUT_DELAY } from '../core/config';
import { measureText, type TextOptions } from '../core/font';
import type { Rect, RenderContext } from '../types';
import { ARROW_RIGHT, DISMISS_ICON, SHARE_ICON, STAR, UI } from './art';
import { centred, fill, menuButton, panel, ribbon, text } from './draw-kit';
import { blinkOn, centreX, formatNumber, metres, uiMetrics } from './layout';
import { drawLogo, logoRect } from './logo';
import {
  BULLET_W,
  controlsLine,
  GAMEOVER_KEYS,
  gameOverPrompt,
  installParts,
  LINE,
  MENU_TEXT,
  type MenuLayout,
  PAUSE_KEYS,
  pausePrompt,
  RESULT_ROWS,
  reloadLabel,
  reloadParts,
  STEP_GAP,
  startPrompt,
  toTitleLabel,
  trickKeysHint,
} from './menu-layout';
import { gameOverReady } from './menu-state';
import { installHintKind, whatsNewLines } from './notices';
import type { Records, RunResult } from './records';

/** What the menu screens read from the ui view. */
export interface MenuScreensView {
  records: Records;
  lastRun: RunResult | null;
  /** The logo long press (progress 0..1). */
  logoHold: { progress: number };
}

/** Text centred on a layout block (a line may sit right of the skater instead of at the view centre). */
function centredIn(r: RenderContext, s: string, block: Rect, options: TextOptions = {}): void {
  text(r, s, block.x + Math.floor(block.w / 2), block.y, { align: 'center', ...options });
}

/** A 2 px yellow bar at the bottom of the logo that fills while it is held (shown only after the hint delay). */
function drawHoldProgress(r: RenderContext, progress: number, logo: Rect): void {
  if (progress <= 0) return;
  const { g } = r;
  const w = logo.w - 20;
  const x = logo.x + 10;
  const y = logo.y + logo.h - 1;
  g.fillStyle = UI.ink;
  g.fillRect(x - 1, y - 1, w + 2, 4);
  g.fillStyle = UI.empty;
  g.fillRect(x, y, w, 2);
  g.fillStyle = UI.yellow;
  g.fillRect(x, y, Math.round(w * progress), 2);
  g.fillStyle = UI.white;
  g.fillRect(x, y, Math.round(w * progress), 1);
}

/** An opaque plate behind a card, a little wider than it, so its text reads on any background. */
function cardPlate(r: RenderContext, card: Rect): void {
  r.g.fillStyle = UI.panel;
  r.g.fillRect(card.x - 3, card.y, card.w + 6, card.h);
}

function drawReloadCard(r: RenderContext, card: Rect): void {
  const parts = reloadParts(card, uiMetrics(r.display), r.display.touch);
  cardPlate(r, card);
  text(r, MENU_TEXT.reload, parts.textX, parts.textY, { color: UI.yellow });
  menuButton(r, parts.button, reloadLabel(r.display.touch), UI.yellow);
}

function drawInstallCard(r: RenderContext, card: Rect): void {
  const kind = installHintKind(r.state.install, r.display.touch);
  if (!kind) return;
  const parts = installParts(card, kind, uiMetrics(r.display));
  cardPlate(r, card);
  text(r, MENU_TEXT.installReason, parts.textX, parts.textY, { color: UI.white });
  if (parts.button) menuButton(r, parts.button, MENU_TEXT.install, UI.teal);
  drawDismiss(r, parts.dismiss);
  if (kind !== 'ios') return;
  // "Teilen [share] -> Zum Home-Bildschirm"
  const y = parts.textY + LINE;
  let x = parts.textX;
  text(r, MENU_TEXT.iosShare, x, y, { color: UI.yellow });
  x += measureText(MENU_TEXT.iosShare) + STEP_GAP;
  SHARE_ICON.draw(r.g, 0, x, y - 1);
  x += SHARE_ICON.width + STEP_GAP;
  ARROW_RIGHT.draw(r.g, 0, x, y + 1);
  x += ARROW_RIGHT.width + STEP_GAP;
  text(r, MENU_TEXT.iosHome, x, y, { color: UI.yellow });
}

/** The install hint's "×" button: an empty button face with a pixel cross sized to the button. */
function drawDismiss(r: RenderContext, rect: Rect): void {
  menuButton(r, rect, '');
  const scale = Math.max(1, Math.floor(rect.h / 12));
  const size = DISMISS_ICON.width * scale;
  DISMISS_ICON.draw(r.g, 0, rect.x + Math.floor((rect.w - size) / 2), rect.y + Math.floor((rect.h - size) / 2), scale);
}

/** The cards and buttons a screen's layout placed (game over: only once input is accepted). */
function drawNotices(r: RenderContext, l: MenuLayout): void {
  const reload = l.blocks.get('reload');
  if (reload) drawReloadCard(r, reload);
  const install = l.blocks.get('install');
  if (install) drawInstallCard(r, install);
  if (l.buttons.toTitle) menuButton(r, l.buttons.toTitle, toTitleLabel(r.display.touch));
}

/** The title's five controls lines. */
function titleHelp(touch: boolean): string[] {
  return [
    touch ? 'Kurz tippen = kleiner Sprung' : 'Leertaste kurz = kleiner Sprung',
    'Halten = hoher Sprung',
    touch ? 'Nach unten wischen = ducken' : 'Pfeil runter oder S = ducken',
    trickKeysHint(touch),
    touch ? 'Gegenstand antippen = benutzen' : 'E = Gegenstand benutzen',
  ];
}

export function drawTitle(r: RenderContext, view: MenuScreensView, l: MenuLayout): void {
  const logo = logoRect(r.display.viewWidth);
  drawLogo(r.g, logo.x, logo.y);
  if (l.panel) {
    r.g.fillStyle = UI.panel;
    r.g.fillRect(l.panel.x, l.panel.y, l.panel.w, l.panel.h);
  }
  drawHoldProgress(r, view.logoHold.progress, logo);
  const y = (id: string) => l.blocks.get(id)?.y;
  const tagline = y('tagline');
  if (tagline !== undefined) centred(r, 'Mit dem Longboard durch Stuttgart', tagline, { color: UI.muted });
  const prompt = l.blocks.get('prompt');
  if (prompt && blinkOn(r.state.modeTime)) text(r, startPrompt(r.display.touch), prompt.x, prompt.y, { color: UI.yellow });
  const controls = l.blocks.get('controls');
  if (controls) text(r, controlsLine(r.display.touch), controls.x, controls.y);
  const help = y('help');
  if (help !== undefined) titleHelp(r.display.touch).forEach((line, i) => centred(r, line, help + i * LINE));
  const keys = y('keys');
  if (keys !== undefined) centred(r, 'P/Esc = Pause, M = Ton aus', keys, { color: UI.muted });
  drawNotices(r, l);
  const records = y('records');
  if (records !== undefined) drawRecordsRow(r, view.records, records);
}

/** "Highscore 1.234   ★ 56 gesamt", centred. */
function drawRecordsRow(r: RenderContext, records: Records, y: number): void {
  const best = `Highscore ${formatNumber(records.highscore)}`;
  const stars = `${formatNumber(records.starsTotal)} gesamt`;
  const gap = 14;
  const total = measureText(best) + gap + STAR.width + 3 + measureText(stars);
  let x = centreX(r.display.viewWidth) - Math.floor(total / 2);
  text(r, best, x, y, { color: UI.white });
  x += measureText(best) + gap;
  STAR.draw(r.g, 0, x, y);
  text(r, stars, x + STAR.width + 3, y, { color: UI.white });
}

export function drawWhatsNew(r: RenderContext, l: MenuLayout): void {
  fill(r, UI.dim);
  const title = l.blocks.get('title')!;
  text(r, MENU_TEXT.whatsNew, title.x, title.y, { scale: 2, color: UI.yellow });
  if (l.panel) {
    r.g.fillStyle = UI.panel;
    r.g.fillRect(l.panel.x, l.panel.y, l.panel.w, l.panel.h);
  }
  const lines = whatsNewLines(r.state.whatsNew);
  const left = l.panel ? l.panel.x + 6 : 0;
  lines.forEach((s, i) => {
    const row = l.blocks.get(`line${i}`);
    if (!row) return;
    r.g.fillStyle = UI.yellow;
    r.g.fillRect(left, row.y + 3, 2, 2);
    text(r, s, left + BULLET_W, row.y, { color: UI.white });
  });
  if (l.buttons.next) menuButton(r, l.buttons.next, MENU_TEXT.next, UI.yellow);
}

export function drawPause(r: RenderContext, view: MenuScreensView, l: MenuLayout): void {
  fill(r, UI.dim);
  const logo = l.buttons.logo;
  if (logo) {
    drawLogo(r.g, logo.x, logo.y);
    drawHoldProgress(r, view.logoHold.progress, logo);
  }
  const pause = l.blocks.get('pause');
  if (pause) centredIn(r, MENU_TEXT.pause, pause, { scale: 2 });
  const prompt = l.blocks.get('prompt');
  if (prompt) {
    ribbon(r, prompt.x, prompt.y, prompt.w, prompt.h);
    if (blinkOn(r.state.modeTime)) centredIn(r, pausePrompt(r.display.touch), { ...prompt, y: prompt.y + 4 }, { color: UI.yellow });
  }
  const keys = l.blocks.get('keys');
  if (keys) centredIn(r, PAUSE_KEYS, keys, { color: UI.muted });
  const trick = l.blocks.get('trick');
  if (trick) centredIn(r, trickKeysHint(r.display.touch), trick, { color: UI.muted });
  drawNotices(r, l);
}

/** One "label  value" row of the game-over table, split at the centre line. */
function resultRow(r: RenderContext, label: string, value: string, y: number, color: string): void {
  const cx = centreX(r.display.viewWidth);
  text(r, label, cx - 4, y, { align: 'right', color: UI.muted });
  text(r, value, cx + 4, y, { color });
}

const TABLE_PAD = 4;

export function drawGameOver(r: RenderContext, view: MenuScreensView, l: MenuLayout): void {
  fill(r, UI.dim);
  const { state } = r;
  const run = view.lastRun;
  const title = l.blocks.get('title')!;
  text(r, MENU_TEXT.gameOver, title.x, title.y, { scale: 2, color: UI.red });
  const record = l.blocks.get('record');
  if (record && blinkOn(state.modeTime * 2)) centredIn(r, MENU_TEXT.newRecord, record, { scale: 2, color: UI.yellow });

  const values = [
    formatNumber(state.score),
    formatNumber(view.records.highscore),
    formatNumber(state.stars),
    formatNumber(view.records.starsTotal),
    `${formatNumber(metres(state.distance))} m`,
  ];
  const rows = RESULT_ROWS.map((label, i) => ({ label, value: values[i]!, rect: l.blocks.get(`row${i}`) })).filter((x) => x.rect);
  // Labels end and values start 4 px from the centre line: the plate is as wide as the longer side, twice.
  const half = 4 + Math.max(...rows.flatMap((x) => [measureText(x.label), measureText(x.value)]));
  const top = rows[0]!.rect!.y;
  const bottom = rows[rows.length - 1]!.rect!.y + 8;
  panel(r, 2 * (half + TABLE_PAD), top - TABLE_PAD, bottom - top + 2 * TABLE_PAD);
  rows.forEach((x, i) => resultRow(r, x.label, x.value, x.rect!.y, i === 0 && run?.newRecord ? UI.yellow : UI.white));

  if (!gameOverReady(state)) return;
  const prompt = l.blocks.get('prompt');
  if (prompt && blinkOn(state.modeTime - GAMEOVER_INPUT_DELAY)) centredIn(r, gameOverPrompt(r.display.touch), prompt, { color: UI.yellow });
  const keys = l.blocks.get('keys');
  if (keys) centredIn(r, GAMEOVER_KEYS, keys, { color: UI.muted });
  drawNotices(r, l);
}
