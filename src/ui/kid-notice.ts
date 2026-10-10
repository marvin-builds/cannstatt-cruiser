/**
 * The notice after the title's "Kindermodus" button (ROADMAP 43): kid mode
 * is on, and how to turn it off again (only the hidden settings menu can).
 * Texts and layout; the screen state is SettingsMenu's 'kidNotice', hotspots
 * in index.ts, drawing in screens.ts.
 */
import type { Rect } from '../types';
import { centreX, uiMetrics } from './layout';

export const KID_NOTICE_TITLE = 'Kindermodus ist an';
export const KID_NOTICE_OK = 'OK';

/** The notice's lines: what kid mode does and the way back (the logo on touch, K on a keyboard). */
export function kidNoticeLines(touch: boolean): string[] {
  return ['Kindgerechte Bilder und Texte.', touch ? 'Ausschalten: Logo 3 Sekunden halten' : 'Ausschalten: K 3 Sekunden halten'];
}

export interface KidNoticeLayout {
  /** Top of the scale-2 headline. */
  title: number;
  /** Top of the first text line. */
  lines: number;
  lineH: number;
  /** Font scale of the lines: 2 in portrait, where a view pixel is only ~1 CSS px. */
  scale: number;
  ok: Rect;
}

const TITLE_Y = 30;
const OK_W = 80;
const GAP = 10;

/** The notice on this display: headline, two lines, OK centred under them. */
export function kidNoticeLayout(display: { viewWidth: number; touch: boolean; portrait: boolean }): KidNoticeLayout {
  const m = uiMetrics(display);
  const scale = display.touch && display.portrait ? 2 : 1;
  const lineH = scale === 2 ? 17 : 11;
  const lines = TITLE_Y + 14 + GAP;
  const w = Math.max(OK_W, m.menuButtonH);
  const ok: Rect = { x: centreX(display.viewWidth) - Math.floor(w / 2), y: lines + 2 * lineH + GAP, w, h: m.menuButtonH };
  return { title: TITLE_Y, lines, lineH, scale, ok };
}
