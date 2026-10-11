/**
 * The notice after turning kid mode on in the settings (ROADMAP 43, 64): kid
 * mode is on, and how to turn it off again (only the hidden settings menu can,
 * kid mode has no gear). Switched on during a paused run, it also says the run
 * restarts (on OK).
 * Texts and layout; the screen state is SettingsMenu's 'kidNotice', hotspots
 * in index.ts, drawing in screens.ts.
 */
import type { GameMode } from '../core/modes';
import type { Rect } from '../types';
import { centreX, uiMetrics } from './layout';
import { MENU_TEXT } from './menu-layout';

export const KID_NOTICE_TITLE = 'Kindermodus ist an';
export const KID_NOTICE_OK = 'OK';

/** The notice's lines: what kid mode does, the way back (the logo on touch, K on a keyboard) and, when `restart`, that the paused run restarts. */
export function kidNoticeLines(touch: boolean, restart = false): string[] {
  const lines = ['Kindgerechte Bilder und Texte.', touch ? 'Ausschalten: Logo 3 Sekunden halten' : 'Ausschalten: K 3 Sekunden halten'];
  return restart ? [...lines, MENU_TEXT.restartNote] : lines;
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

/** The notice on this display: headline, its lines (three with `restart`), OK centred under them. */
export function kidNoticeLayout(display: { viewWidth: number; touch: boolean; portrait: boolean }, restart = false): KidNoticeLayout {
  const m = uiMetrics(display);
  const scale = display.touch && display.portrait ? 2 : 1;
  const lineH = scale === 2 ? 17 : 11;
  const lines = TITLE_Y + 14 + GAP;
  const w = Math.max(OK_W, m.menuButtonH);
  const ok: Rect = { x: centreX(display.viewWidth) - Math.floor(w / 2), y: lines + kidNoticeLines(display.touch, restart).length * lineH + GAP, w, h: m.menuButtonH };
  return { title: TITLE_Y, lines, lineH, scale, ok };
}

/** The notice names the restart when kid mode was switched on during a paused run (OK restarts it, like closing the menu). */
export function kidNoticeRestart(menu: { switched: boolean }, state: { mode: GameMode }): boolean {
  return menu.switched && state.mode === 'paused';
}
