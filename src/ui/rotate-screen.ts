/**
 * The rotate screen (ROADMAP 73): one rule for when "Bitte Gerät drehen" covers
 * the game. It shows on a touch device in portrait only where the game needs
 * landscape (wantsLandscape); screens with their own portrait sheet (the
 * feedback dialog, the name entry, "Neu in dieser Version") never get it, so
 * turning the phone there goes straight to the sheet, and closing the sheet
 * while still in portrait brings it back. "Trotzdem weiter" (or a tap anywhere)
 * dismisses it until the device is in landscape again. Pure; the DOM overlay is
 * rotate-sheet.ts.
 */
import type { GameMode } from '../types';

/** The ui screen on top, as far as the orientation cares. */
export type UiScreen = 'title' | 'run' | 'pause' | 'gameOver' | 'scores' | 'settings' | 'installGuide' | 'whatsNew' | 'feedback' | 'nameEntry';

/** Whether each screen needs landscape; false = it has its own portrait layout. */
const LANDSCAPE: Record<UiScreen, boolean> = {
  title: true,
  run: true,
  pause: true,
  gameOver: true,
  scores: true,
  settings: true,
  installGuide: true,
  whatsNew: false,
  feedback: false,
  nameEntry: false,
};

export function wantsLandscape(screen: UiScreen): boolean {
  return LANDSCAPE[screen];
}

/** What is open, from the game state and the ui view. */
export interface ScreenSource {
  mode: GameMode;
  /** "Neu in dieser Version" entries wait on the title. */
  whatsNew: boolean;
  installGuide: boolean;
  settings: boolean;
  feedback: boolean;
  /** The online list's screen, null when closed. */
  scores: 'list' | 'entry' | null;
}

const MODE_SCREEN: Record<GameMode, UiScreen> = { title: 'title', playing: 'run', paused: 'pause', gameover: 'gameOver' };

/** The screen on top: the install steps over everything, then settings, feedback, the online list, the mode's screen. */
export function uiScreen(s: ScreenSource): UiScreen {
  if (s.installGuide) return 'installGuide';
  if (s.settings) return 'settings';
  if (s.feedback) return 'feedback';
  if (s.scores) return s.scores === 'entry' ? 'nameEntry' : 'scores';
  if (s.mode === 'title' && s.whatsNew) return 'whatsNew';
  return MODE_SCREEN[s.mode];
}

interface Device {
  touch: boolean;
  portrait: boolean;
}

/** Whether the rotate screen shows, and the player's "Trotzdem weiter". */
export class RotateHint {
  private dismissed = false;

  shown(display: Device, screen: UiScreen): boolean {
    return display.portrait && display.touch && !this.dismissed && wantsLandscape(screen);
  }

  /** Every tick: landscape forgets the dismissal, so the next turn to portrait shows it again. */
  update(display: Device): void {
    if (!display.portrait) this.dismissed = false;
  }

  dismiss(): void {
    this.dismissed = true;
  }
}
