/**
 * Drawing of the online list's screens ("Bestenliste" and the name entry)
 * from their layouts (score-layout.ts), the same rects the hotspots use.
 * Menu screens only (not drawn while riding), so plain allocation is fine.
 */
import { measureText } from '../core/font';
import type { Rect, RenderContext } from '../types';
import { UI } from './art';
import { fill, menuButton, text } from './draw-kit';
import { type HighscoreFlow, SCORE_TEXT } from './highscore-flow';
import { fitCentred, formatNumber } from './layout';
import { drawDismiss } from './menu-screens';
import { SCROLLBAR_W, type ScoreEntryLayout, type ScoreListLayout } from './score-layout';

export const LIST_KEYS = 'Pfeiltasten = blättern, Esc/B = schließen';
export const entryKeys = (kid: boolean) => (kid ? 'Enter = eintragen, N = neuer Name, Esc = zurück' : 'Enter = eintragen, Esc = zurück');

/** The bigger scale where `s` fits `maxW`, else 1. */
function fitScale(s: string, maxW: number, preferred: number): number {
  return preferred > 1 && measureText(s, preferred) > maxW ? 1 : preferred;
}

/** `s` centred in the view, kept left of `right` (the close button) where it is that high up. */
function centredLine(r: RenderContext, s: string, y: number, color: string, scale: number, right = r.display.viewWidth): void {
  const w = measureText(s, scale);
  text(r, s, fitCentred(w, r.display.viewWidth, right), y, { align: 'center', color, scale });
}

/** The list's state line in place of the rows (loading, offline, empty), or null when the rows show. */
function placeholder(flow: HighscoreFlow): string | null {
  if (flow.topState === 'offline') return SCORE_TEXT.offline;
  if (flow.entries.length > 0) return null;
  return flow.topState === 'ready' ? SCORE_TEXT.empty : SCORE_TEXT.loading;
}

export function drawScoreList(r: RenderContext, flow: HighscoreFlow, l: ScoreListLayout): void {
  const { g } = r;
  fill(r, UI.ink);
  text(r, SCORE_TEXT.title, l.title.x, l.title.y, { scale: 2, color: UI.yellow });
  drawDismiss(r, l.close);
  g.fillStyle = UI.panel;
  g.fillRect(l.list.x, l.list.y, l.list.w, l.list.h);
  const note = placeholder(flow);
  if (note) {
    const scale = fitScale(note, l.list.w - 8, l.textScale);
    text(r, note, l.list.x + Math.floor(l.list.w / 2), l.list.y + Math.floor((l.list.h - 7 * scale) / 2), { align: 'center', color: UI.muted, scale });
  } else {
    drawRows(r, flow, l);
  }
  // The lines under the list are one small text row each.
  if (l.messageY !== null && flow.message) centredLine(r, flow.message, l.messageY, UI.yellow, 1);
  centredLine(r, SCORE_TEXT.privacy, l.privacyY, UI.muted, 1);
  if (l.keysY !== null) centredLine(r, LIST_KEYS, l.keysY, UI.muted, 1);
}

function drawRows(r: RenderContext, flow: HighscoreFlow, l: ScoreListLayout): void {
  const { g } = r;
  const { list, rowH, textScale: scale } = l;
  const own = flow.highlight;
  const scroll = Math.round(flow.scroll);
  const textTop = Math.floor((rowH - 7 * scale) / 2);
  g.save();
  g.beginPath();
  g.rect(list.x, list.y, list.w, list.h);
  g.clip();
  flow.entries.forEach((e, i) => {
    const y = list.y + i * rowH - scroll;
    if (y + rowH <= list.y || y >= list.y + list.h) return;
    const mine = e.rank === own;
    if (mine) {
      g.fillStyle = UI.empty;
      g.fillRect(list.x + 1, y, list.w - SCROLLBAR_W - 4, rowH);
    }
    const color = mine ? UI.yellow : UI.white;
    text(r, `${e.rank}.`, l.rankRight, y + textTop, { align: 'right', color: mine ? UI.yellow : UI.muted, scale });
    text(r, e.name, l.nameX, y + textTop, { color, scale });
    text(r, formatNumber(e.score), l.scoreRight, y + textTop, { align: 'right', color, scale });
  });
  g.restore();
  if (l.maxScroll > 0) drawScrollbar(r, list, l.contentH, scroll);
}

/** A thin bar at the list's right edge: where the visible rows are in the whole list. */
function drawScrollbar(r: RenderContext, list: Rect, contentH: number, scroll: number): void {
  const { g } = r;
  const x = list.x + list.w - SCROLLBAR_W - 2;
  const track = list.h - 4;
  const thumb = Math.max(6, Math.round((track * list.h) / contentH));
  const y = list.y + 2 + Math.round(((track - thumb) * scroll) / Math.max(1, contentH - list.h));
  g.fillStyle = UI.empty;
  g.fillRect(x, list.y + 2, SCROLLBAR_W, track);
  g.fillStyle = UI.muted;
  g.fillRect(x, y, SCROLLBAR_W, thumb);
}

/**
 * The submit button's label: "Als <Name> eintragen" once the name is valid.
 * Kid mode keeps "Eintragen": the nickname shows in the field above, and the
 * long label would shrink below the "Neuer Name" button's size.
 */
export function submitButtonLabel(flow: HighscoreFlow): string {
  if (flow.sending) return SCORE_TEXT.sending;
  return flow.canSubmit && !flow.kid ? `Als ${flow.name.trim()} eintragen` : SCORE_TEXT.submit;
}

export function drawScoreEntry(r: RenderContext, flow: HighscoreFlow, l: ScoreEntryLayout): void {
  const { g, display } = r;
  fill(r, UI.ink);
  text(r, SCORE_TEXT.entryTitle, l.title.x, l.title.y, { scale: 2, color: UI.yellow });
  drawDismiss(r, l.close);
  centredLine(r, `${formatNumber(flow.score)} Punkte`, l.scoreY, UI.white, l.textScale, l.close.x);
  text(r, flow.kid ? SCORE_TEXT.kidPrompt : SCORE_TEXT.namePrompt, l.field.x, l.promptY, { color: UI.muted });
  // The field (adult mode: the native input lies on it; the text shows in canvas captures).
  const { field } = l;
  g.fillStyle = UI.buttonEdge;
  g.fillRect(field.x, field.y, field.w, field.h);
  g.fillStyle = UI.buttonFace;
  g.fillRect(field.x + 2, field.y + 2, field.w - 4, field.h - 4);
  const nameScale = fitScale(flow.name, field.w - 12, field.h >= 24 ? 2 : 1);
  text(r, flow.name, field.x + 6, field.y + Math.floor((field.h - 7 * nameScale) / 2), { color: flow.kid ? UI.white : UI.yellow, scale: nameScale });
  if (l.reroll) menuButton(r, l.reroll, SCORE_TEXT.newName, UI.teal);
  const label = submitButtonLabel(flow);
  const scale = fitScale(label, l.submit.w - 12, l.submit.h >= 24 ? 2 : 1);
  menuButton(r, l.submit, label, flow.canSubmit ? UI.yellow : UI.muted, scale);
  if (flow.message) centredLine(r, flow.message, l.messageY, UI.yellow, fitScale(flow.message, display.viewWidth - 8, l.textScale));
  if (l.keysY !== null) centredLine(r, entryKeys(flow.kid), l.keysY, UI.muted, 1);
}
