/**
 * Small explanatory lines under menu buttons ("Für Kinder: ...", the privacy
 * notes). In portrait a view pixel is about one CSS px, so they are drawn at
 * scale 2 there; a line too wide for the view at that scale falls back to a
 * shorter wording of the same fact (never to an unreadable scale 1 where a
 * variant fits).
 */
import { VIEW_W } from '../core/config';
import { measureText } from '../core/font';

/** Room for a note in the narrowest view (4 px on each side). */
export const PORTRAIT_NOTE_W = VIEW_W - 8;

/** The settings menu's Kindermodus notes, long form first. */
export const KID_NOTE = {
  off: ['Für Kinder: freundliche Bilder und Texte.', 'Freundliche Bilder und Texte.'],
  on: ['Kindgerechte Bilder und Texte sind an.', 'Kindgerechte Bilder sind an.'],
} as const;

/** The first of `texts` (long form first) that fits `maxW` at `scale`, else the first at scale 1. */
export function fittingNote(texts: readonly string[], scale: number, maxW: number): { text: string; scale: number } {
  for (const text of texts) if (measureText(text, scale) <= maxW) return { text, scale };
  return { text: texts[0]!, scale: 1 };
}
