/**
 * When the menu screens offer the reload button ("Neue Version da") and the
 * install hint. Pure rules over the state core writes (updateReady, install);
 * layout in menu-layout.ts, hotspots in index.ts, drawing in menu-screens.ts.
 */
import type { GameMode, InstallState } from '../types';

/** The reload button: while a new version waits, on title, pause and game over (never mid-run). */
export function reloadOffered(state: { mode: GameMode; updateReady: boolean }): boolean {
  return state.updateReady && state.mode !== 'playing';
}

/** 'prompt': an "Installieren" button (captured beforeinstallprompt); 'ios': "Teilen -> Zum Home-Bildschirm". */
export type InstallHintKind = 'prompt' | 'ios';

/** Visits from which on the install hint shows (the first visit is for playing). */
export const INSTALL_HINT_MIN_VISITS = 1;

/** Which install hint a touch device gets, or null when installed, running installed or dismissed. */
export function installHintKind(install: InstallState, touch: boolean): InstallHintKind | null {
  if (!touch || install.standalone || install.installed || install.dismissed) return null;
  if (install.visits < INSTALL_HINT_MIN_VISITS) return null;
  if (install.canPrompt) return 'prompt';
  return install.platform === 'ios' ? 'ios' : null;
}
