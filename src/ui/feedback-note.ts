/**
 * The note on the title about the player's own feedback (ROADMAP 57): what
 * happened to a report sent from this device (planned, done, not planned) and
 * the operator's short reply, or a friendly default line, with an OK. Shown
 * once per report and status (src/net/feedback-status.ts decides which), in
 * adult mode only, after "Neu in dieser Version" and before the title.
 * Texts and layout; hotspots in index.ts, drawing in screens.ts.
 */
import { VIEW_H } from '../core/config';
import { measureText } from '../core/font';
import type { FeedbackStatus, FeedbackStatusEntry } from '../net/feedback-types';
import type { Rect } from '../types';
import { UI } from './art';
import { wrapText } from './feedback-screen';
import { centreX, uiMetrics } from './layout';

/** The statuses a note is about (src/net/feedback-status.ts never offers 'open'). */
type NoteStatus = Exclude<FeedbackStatus, 'open'>;

/** All texts of the note (German, kid-safe, game font). */
export const FEEDBACK_NOTE_TEXT = {
  headline: { todo: 'Dein Feedback: geplant!', done: 'Dein Feedback: umgesetzt!', rejected: 'Dein Feedback: nicht geplant' },
  /** The line under the headline when the operator wrote no reply. */
  thanks: { todo: 'Es steht auf unserer Liste.', done: 'Danke für deine Hilfe!', rejected: 'Danke trotzdem fürs Mitmachen!' },
  ok: 'OK',
} as const satisfies Record<string, unknown>;

const HEADLINE_COLOR: Record<NoteStatus, string> = { todo: UI.yellow, done: UI.green, rejected: UI.white };

export interface FeedbackNoteLayout {
  headline: string;
  headlineColor: string;
  /** Top of the scale-2 headline. */
  headlineY: number;
  /** The reply (in quotes) or the default line, wrapped; a reply too long for the view ends in "...". */
  lines: string[];
  /** The lines are the operator's reply (drawn white) rather than the default line (muted). */
  reply: boolean;
  linesY: number;
  lineH: number;
  /** Font scale of the lines: 2 in portrait, where a view pixel is only ~1 CSS px. */
  scale: number;
  ok: Rect;
}

const MARGIN = 4;
const HEADLINE_H = 16;
const GAP = 8;
const OK_GAP = 10;
const OK_W = 80;
const ELLIPSIS = '...';

/** `lines` cut to `max`, the last one ending in "..." within `maxW` (scale-1 px) when something was cut. */
function clip(lines: string[], max: number, maxW: number): string[] {
  if (lines.length <= max) return lines;
  const kept = lines.slice(0, max);
  let last = kept[max - 1]!;
  while (last && measureText(`${last}${ELLIPSIS}`) > maxW) last = last.slice(0, -1);
  kept[max - 1] = `${last.trimEnd()}${ELLIPSIS}`;
  return kept;
}

/** The note for `note` on this display: headline, lines and OK as one block centred in the view. */
export function feedbackNoteLayout(
  display: { viewWidth: number; touch: boolean; portrait: boolean },
  note: FeedbackStatusEntry,
): FeedbackNoteLayout {
  const status = note.status === 'open' ? 'todo' : note.status;
  const okH = uiMetrics(display).menuButtonH;
  const scale = display.touch && display.portrait ? 2 : 1;
  const lineH = scale === 2 ? 17 : 11;
  const maxW = Math.floor((display.viewWidth - 2 * MARGIN) / scale);
  const maxLines = Math.floor((VIEW_H - 2 * MARGIN - HEADLINE_H - GAP - OK_GAP - okH) / lineH);
  const text = note.reply ? `„${note.reply}“` : FEEDBACK_NOTE_TEXT.thanks[status];
  const lines = clip(wrapText(text, maxW), maxLines, maxW);
  const total = HEADLINE_H + GAP + lines.length * lineH + OK_GAP + okH;
  const headlineY = Math.max(MARGIN, Math.floor((VIEW_H - total) / 2));
  const linesY = headlineY + HEADLINE_H + GAP;
  const w = Math.max(OK_W, okH);
  const ok: Rect = { x: centreX(display.viewWidth) - Math.floor(w / 2), y: linesY + lines.length * lineH + OK_GAP, w, h: okH };
  return {
    headline: FEEDBACK_NOTE_TEXT.headline[status],
    headlineColor: HEADLINE_COLOR[status],
    headlineY,
    lines,
    reply: !!note.reply,
    linesY,
    lineH,
    scale,
    ok,
  };
}
