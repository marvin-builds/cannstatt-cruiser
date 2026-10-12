/**
 * Drawing of the online list's screens ("Bestenliste" and the name entry)
 * from their layouts (score-layout.ts), the same rects the hotspots use.
 * Menu screens only (not drawn while riding), so plain allocation is fine.
 */
import { measureText } from '../core/font';
import type { RenderContext } from '../types';
import { UI } from './art';
import { fill, menuButton, scrollBar, text } from './draw-kit';
import type { HighscoreFlow } from './highscore-flow';
import { fitCentred, formatNumber } from './layout';
import { drawDismiss, drawPrivacyLink, drawStatsSwitch } from './menu-screens';
import { fittingNote } from './note-text';
import { SCROLLBAR_W, type ScoreEntryLayout, type ScoreListLayout } from './score-layout';
import { texts } from './i18n';

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
  if (flow.topState === 'offline') return texts().score.offline;
  if (flow.entries.length > 0) return null;
  return flow.topState === 'ready' ? texts().score.empty : texts().score.loading;
}

export function drawScoreList(r: RenderContext, flow: HighscoreFlow, l: ScoreListLayout, statsOn: boolean): void {
  const { g } = r;
  fill(r, UI.ink);
  text(r, texts().score.title, l.title.x, l.title.y, { scale: 2, color: UI.yellow });
  drawDismiss(r, l.close);
  drawStatsSwitch(r, l.stats, statsOn);
  drawPrivacyLink(r, l.privacyLink);
  g.fillStyle = UI.panel;
  g.fillRect(l.list.x, l.list.y, l.list.w, l.list.h);
  const empty = placeholder(flow);
  if (empty) {
    const scale = fitScale(empty, l.list.w - 8, l.textScale);
    text(r, empty, l.list.x + Math.floor(l.list.w / 2), l.list.y + Math.floor((l.list.h - 7 * scale) / 2), { align: 'center', color: UI.muted, scale });
  } else {
    drawRows(r, flow, l);
  }
  // The lines under the list are one text row each (scale 2 in portrait, a shorter wording where needed).
  const note = (texts: readonly string[], y: number, color: string) => {
    const fit = fittingNote(texts, l.noteScale, r.display.viewWidth - 8);
    centredLine(r, fit.text, y, color, fit.scale);
  };
  if (l.messageY !== null && flow.message) note([flow.message], l.messageY, UI.yellow);
  note([texts().score.privacy, texts().score.privacyShort], l.privacyY, UI.muted);
  note(statsOn ? [texts().stats.listNote, texts().stats.listNoteShort] : [texts().stats.offNote], l.statsNoteY, UI.muted);
  if (l.keysY !== null) centredLine(r, texts().score.listKeys, l.keysY, UI.muted, 1);
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
  if (l.maxScroll > 0) scrollBar(r, list, l.contentH, scroll, SCROLLBAR_W);
}

/** The submit button's label: "Als <Name> eintragen" once the name is valid. */
export function submitButtonLabel(flow: Pick<HighscoreFlow, 'sending' | 'canSubmit' | 'name'>): string {
  if (flow.sending) return texts().score.sending;
  return flow.canSubmit ? texts().score.submitAs(flow.name.trim()) : texts().score.submit;
}

export function drawScoreEntry(r: RenderContext, flow: HighscoreFlow, l: ScoreEntryLayout): void {
  const { g, display } = r;
  fill(r, UI.ink);
  text(r, texts().score.entryTitle, l.title.x, l.title.y, { scale: 2, color: UI.yellow });
  drawDismiss(r, l.close);
  centredLine(r, texts().score.points(formatNumber(flow.score)), l.scoreY, UI.white, l.textScale, l.close.x);
  text(r, texts().score.namePrompt, l.field.x, l.promptY, { color: UI.muted });
  // The field (the native input lies on it; the text shows in canvas captures).
  const { field } = l;
  g.fillStyle = UI.buttonEdge;
  g.fillRect(field.x, field.y, field.w, field.h);
  g.fillStyle = UI.buttonFace;
  g.fillRect(field.x + 2, field.y + 2, field.w - 4, field.h - 4);
  const nameScale = fitScale(flow.name, field.w - 12, field.h >= 24 ? 2 : 1);
  text(r, flow.name, field.x + 6, field.y + Math.floor((field.h - 7 * nameScale) / 2), { color: UI.yellow, scale: nameScale });
  const label = submitButtonLabel(flow);
  const scale = fitScale(label, l.submit.w - 12, l.submit.h >= 24 ? 2 : 1);
  menuButton(r, l.submit, label, flow.canSubmit ? UI.yellow : UI.muted, scale);
  if (flow.message) centredLine(r, flow.message, l.messageY, UI.yellow, fitScale(flow.message, display.viewWidth - 8, l.textScale));
  if (l.keysY !== null) centredLine(r, texts().score.entryKeys, l.keysY, UI.muted, 1);
}
