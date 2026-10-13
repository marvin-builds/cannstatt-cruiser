/**
 * Drawing of the menu screens: title, "Neu in dieser Version", pause and game
 * over, with their notice cards (reload, install hint) and buttons. Positions
 * come from the screen's MenuLayout (menu-layout.ts), the same rects the
 * hotspots use.
 */
import { GAMEOVER_INPUT_DELAY } from '../core/config';
import { measureText, type TextOptions } from '../core/font';
import type { Rect, RenderContext } from '../types';
import { DISMISS_ICON, ICON_FEEDBACK, ICON_SETTINGS, STAR, UI } from './art';
import { centred, fill, iconButton, menuButton, redDot, ribbon, scrollBar, text } from './draw-kit';
import { blinkOn, centreX, formatNumber, iconOnPlate, metres, uiMetrics } from './layout';
import { drawLogo, logoRect } from './logo';
import {
  controlsLine,
  feedbackLabel,
  gameOverPrompt,
  installParts,
  titleKeys,
  LINE,
  type MenuLayout,
  pausePrompt,
  reloadLabel,
  resultRows,
  reloadParts,
  startPrompt,
  submitLabel,
  titleHelp,
  toTitleLabel,
  toTitlePlate,
  trickKeysHint,
} from './menu-layout';
import { gameOverReady } from './menu-state';
import { SCROLLBAR_W } from './score-layout';
import { bestOf, type Records, type RunResult } from './records';
import { language, texts } from './i18n';
import type { LanguageSwitch } from './language-switch';

/** What the menu screens read from the ui view. */
export interface MenuScreensView {
  records: Records;
  lastRun: RunResult | null;
  /** The logo long press (progress 0..1). */
  logoHold: { progress: number };
  /** The feedback dialog: `dot` puts the red dot on the title icon and the pause button (ROADMAP 70). Null without one. */
  feedback: { dot: boolean } | null;
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
  text(r, texts().menu.reload, parts.textX, parts.textY, { color: UI.yellow });
  menuButton(r, parts.button, reloadLabel(r.display.touch), UI.yellow);
}

/** The install card: "App installieren" and "×". */
function drawInstallCard(r: RenderContext, card: Rect): void {
  const parts = installParts(card, uiMetrics(r.display));
  cardPlate(r, card);
  menuButton(r, parts.button, texts().menu.installApp, UI.teal);
  drawDismiss(r, parts.dismiss);
}

/** The "Anonyme Statistik: AN/AUS" button (settings menu and "Bestenliste"); scale 1 where scale 2 would not fit. */
export function drawStatsSwitch(r: RenderContext, rect: Rect, on: boolean): void {
  const label = texts().stats.label(on);
  const scale = rect.h >= 24 && measureText(label, 2) <= rect.w - 8 ? 2 : 1;
  menuButton(r, rect, label, on ? UI.white : UI.muted, scale);
}

/** The "Datenschutz" link button beside the statistics switch: scale 2 where its rect has room (portrait), else small. */
export function drawPrivacyLink(r: RenderContext, rect: Rect): void {
  const label = texts().privacy.label;
  const scale = rect.h >= 24 && measureText(label, 2) <= rect.w - 8 ? 2 : 1;
  menuButton(r, rect, label, UI.muted, scale);
}

/** A "×" button (install card, the highscore screens' close): an empty button face with a pixel cross sized to the button. */
export function drawDismiss(r: RenderContext, rect: Rect): void {
  menuButton(r, rect, '');
  const scale = Math.max(1, Math.floor(rect.h / 12));
  const size = DISMISS_ICON.width * scale;
  DISMISS_ICON.draw(r.g, 0, rect.x + Math.floor((rect.w - size) / 2), rect.y + Math.floor((rect.h - size) / 2), scale);
}

/** The cards and buttons a screen's layout placed (game over: only once input is accepted; title: the settings button, feedback). */
function drawNotices(r: RenderContext, l: MenuLayout, feedbackDot: boolean): void {
  const reload = l.blocks.get('reload');
  if (reload) drawReloadCard(r, reload);
  const install = l.blocks.get('install');
  if (install && l.install) drawInstallCard(r, install);
  const { display, state } = r;
  if (l.buttons.toTitle) {
    const label = toTitleLabel(display.touch, state.mode === 'gameover');
    menuButton(r, toTitlePlate(l.buttons.toTitle), label, UI.white, 1);
  }
  if (l.buttons.submit) menuButton(r, l.buttons.submit, submitLabel(display.touch), UI.yellow);
  if (l.buttons.settings) iconButton(r, uiMetrics(display), l.buttons.settings, ICON_SETTINGS);
  // Feedback: the title's speech-bubble icon, the pause screen's button.
  const feedback = l.buttons.feedback;
  if (feedback && state.mode === 'title') iconButton(r, uiMetrics(display), feedback, ICON_FEEDBACK);
  else if (feedback) menuButton(r, feedback, feedbackLabel(display.touch));
  if (feedback && feedbackDot) feedbackButtonDot(r, feedback, state.mode === 'title');
}

/**
 * The red dot on the title's speech bubble (top right of its plate) or the pause menu's "Feedback"
 * (top right inside the button): a report sent from this device changed (ROADMAP 70).
 */
function feedbackButtonDot(r: RenderContext, button: Rect, icon: boolean): void {
  const m = uiMetrics(r.display);
  const size = 3 * m.iconScale;
  if (!icon) {
    redDot(r, button.x + button.w - size - 3, button.y + 3, size);
    return;
  }
  const { plate } = iconOnPlate(button, m, ICON_FEEDBACK.width);
  redDot(r, plate.x + plate.w - size, plate.y, size);
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
  if (tagline !== undefined) centred(r, texts().title.tagline, tagline, { color: UI.muted });
  const prompt = l.blocks.get('prompt');
  if (prompt && blinkOn(r.state.modeTime)) text(r, startPrompt(r.display.touch), prompt.x, prompt.y, { color: UI.yellow });
  const controls = l.blocks.get('controls');
  if (controls) text(r, controlsLine(r.display.touch), controls.x, controls.y);
  const help = y('help');
  if (help !== undefined) titleHelp(r.display.touch).forEach((line, i) => centred(r, line, help + i * LINE));
  const keys = y('keys');
  if (keys !== undefined) centred(r, titleKeys({ feedback: !!l.buttons.feedback, settings: !!l.buttons.settings }), keys, { color: UI.muted });
  drawNotices(r, l, !!view.feedback?.dot);
  const records = y('records');
  if (records !== undefined) drawRecordsRow(r, bestOf(view.records, r.state.kidMode), view.records.starsTotal, records);
  if (l.language) drawLanguageSwitch(r, l.language);
}

/** The language switch "DE | EN" (language-switch.ts): one plate split by a bar, the active language yellow and underlined, the other muted. */
export function drawLanguageSwitch(r: RenderContext, s: LanguageSwitch): void {
  const { g } = r;
  const { plate, scale } = s;
  menuButton(r, plate, '');
  const mid = plate.x + Math.floor(plate.w / 2);
  g.fillStyle = UI.buttonEdge;
  g.fillRect(mid, plate.y + 3, 1, plate.h - 6);
  const active = language();
  const labelY = plate.y + Math.floor((plate.h - 7 * scale) / 2);
  for (const lang of ['de', 'en'] as const) {
    const left = lang === 'de' ? plate.x + 1 : mid + 1;
    const w = lang === 'de' ? mid - left : plate.x + plate.w - 1 - left;
    const on = lang === active;
    text(r, texts().language[lang], left + Math.floor(w / 2), labelY, { align: 'center', scale, color: on ? UI.yellow : UI.muted });
    if (!on) continue;
    g.fillStyle = UI.yellow;
    g.fillRect(left + 2, plate.y + plate.h - 2 - scale, w - 4, scale);
  }
}


/** "Highscore 1.234   ★ 56 gesamt" (the highscore of the mode in play), centred. */
function drawRecordsRow(r: RenderContext, highscore: number, starsTotal: number, y: number): void {
  const best = texts().title.highscore(formatNumber(highscore));
  const stars = texts().title.starsTotal(formatNumber(starsTotal));
  const gap = 14;
  const total = measureText(best) + gap + STAR.width + 3 + measureText(stars);
  let x = centreX(r.display.viewWidth) - Math.floor(total / 2);
  text(r, best, x, y, { color: UI.white });
  x += measureText(best) + gap;
  STAR.draw(r.g, 0, x, y);
  text(r, stars, x + STAR.width + 3, y, { color: UI.white });
}

/** "Neu in dieser Version": the headline, the list scrolled by `scroll` (version headings, bullet items, a scroll bar when it overflows), "Weiter". */
export function drawWhatsNew(r: RenderContext, l: MenuLayout, scroll: number): void {
  const { g } = r;
  fill(r, UI.dim);
  const title = l.blocks.get('title')!;
  text(r, texts().menu.whatsNew, title.x, title.y, { scale: 2, color: UI.yellow });
  const list = l.list!;
  const { rect, rowH, scale } = list;
  g.fillStyle = UI.panel;
  g.fillRect(rect.x, rect.y, rect.w, rect.h);
  const offset = Math.round(scroll);
  const textTop = Math.floor((rowH - 7 * scale) / 2);
  g.save();
  g.beginPath();
  g.rect(rect.x, rect.y, rect.w, rect.h);
  g.clip();
  list.rows.forEach((row, i) => {
    const y = rect.y + i * rowH - offset;
    if (y + rowH <= rect.y || y >= rect.y + rect.h) return;
    if (row.kind === 'heading') {
      text(r, row.text, list.headingX, y + textTop, { color: UI.teal, scale });
      return;
    }
    if (row.kind === 'item') {
      g.fillStyle = UI.yellow;
      g.fillRect(list.headingX, y + textTop + 3 * scale, 2 * scale, 2 * scale);
    }
    text(r, row.text, list.itemX, y + textTop, { color: UI.white, scale });
  });
  g.restore();
  if (list.maxScroll > 0) scrollBar(r, rect, list.contentH, offset, SCROLLBAR_W * scale);
  if (l.buttons.next) menuButton(r, l.buttons.next, texts().menu.next, UI.yellow);
}

export function drawPause(r: RenderContext, view: MenuScreensView, l: MenuLayout): void {
  fill(r, UI.dim);
  const logo = l.buttons.logo;
  if (logo) {
    drawLogo(r.g, logo.x, logo.y);
    drawHoldProgress(r, view.logoHold.progress, logo);
  }
  const pause = l.blocks.get('pause');
  if (pause) {
    textPlate(r, pause);
    centredIn(r, texts().menu.pause, pause, { scale: 2 });
  }
  const scale = l.textScale;
  const prompt = l.blocks.get('prompt');
  if (prompt) {
    ribbon(r, prompt.x, prompt.y, prompt.w, prompt.h);
    if (blinkOn(r.state.modeTime)) centredIn(r, pausePrompt(r.display.touch), { ...prompt, y: prompt.y + 4 }, { color: UI.yellow, scale });
  }
  const keys = l.blocks.get('keys');
  if (keys) centredIn(r, texts().menu.pauseKeys, keys, { color: UI.muted, scale });
  const trick = l.blocks.get('trick');
  if (trick) centredIn(r, trickKeysHint(r.display.touch, scale === 2), trick, { color: UI.muted, scale });
  drawNotices(r, l, !!view.feedback?.dot);
}

/** One "label  value" row of the game-over table, split at the centre line `cx`. */
function resultRow(r: RenderContext, label: string, value: string, cx: number, y: number, color: string): void {
  text(r, label, cx - 4, y, { align: 'right', color: UI.muted });
  text(r, value, cx + 4, y, { color });
}

const TABLE_PAD = 4;

/** An opaque plate behind a line of text (game over: the stars of the street never show through). */
function textPlate(r: RenderContext, block: Rect): void {
  r.g.fillStyle = UI.panel;
  r.g.fillRect(block.x - TABLE_PAD, block.y - 3, block.w + 2 * TABLE_PAD, block.h + 3);
}

export function drawGameOver(r: RenderContext, view: MenuScreensView, l: MenuLayout): void {
  fill(r, UI.dim);
  const { state } = r;
  const run = view.lastRun;
  const title = l.blocks.get('title')!;
  textPlate(r, title);
  text(r, texts().menu.gameOver, title.x, title.y, { scale: 2, color: UI.red });
  // The blinking lines take their plate with them: no empty plate in the off phase.
  const record = l.blocks.get('record');
  if (record && blinkOn(state.modeTime * 2)) {
    textPlate(r, record);
    centredIn(r, texts().menu.newRecord, record, { scale: 2, color: UI.yellow });
  }

  const values = [
    formatNumber(state.score),
    // The record of the mode the run was played in.
    formatNumber(bestOf(view.records, run?.kid ?? state.kidMode)),
    formatNumber(state.stars),
    formatNumber(view.records.starsTotal),
    texts().menu.metres(formatNumber(metres(state.distance))),
    formatNumber(state.missionsDone),
  ];
  const rows = resultRows().map((label, i) => ({ label, value: values[i]!, rect: l.blocks.get(`row${i}`) })).filter((x) => x.rect);
  // Labels end and values start 4 px from the centre line: the plate is as wide as the longer side, twice.
  const half = 4 + Math.max(...rows.flatMap((x) => [measureText(x.label), measureText(x.value)]));
  const top = rows[0]!.rect!.y;
  const bottom = rows[rows.length - 1]!.rect!.y + 8;
  const cx = rows[0]!.rect!.x + Math.floor(rows[0]!.rect!.w / 2);
  const w = 2 * (half + TABLE_PAD);
  r.g.fillStyle = UI.panel;
  r.g.fillRect(cx - Math.floor(w / 2), top - TABLE_PAD, w, bottom - top + 2 * TABLE_PAD);
  rows.forEach((x, i) => resultRow(r, x.label, x.value, cx, x.rect!.y, i === 0 && run?.newRecord ? UI.yellow : UI.white));

  if (!gameOverReady(state)) return;
  const prompt = l.blocks.get('prompt');
  if (prompt && blinkOn(state.modeTime - GAMEOVER_INPUT_DELAY)) {
    textPlate(r, prompt);
    centredIn(r, gameOverPrompt(r.display.touch), prompt, { color: UI.yellow, scale: l.textScale });
  }
  drawNotices(r, l, !!view.feedback?.dot);
}
