/**
 * When the menu screens offer the reload button ("Neue Version da"), the
 * install hint and the "Neu in dieser Version" lines. Pure rules over the
 * state core writes (updateReady, install, whatsNew); layout in
 * menu-layout.ts, hotspots in index.ts, drawing in menu-draw.ts.
 */
import type { ChangelogEntry, GameMode, InstallState } from '../types';

/** The reload button: while a new version waits, on title, pause and game over (never mid-run). */
export function reloadOffered(state: { mode: GameMode; updateReady: boolean }): boolean {
  return state.updateReady && state.mode !== 'playing';
}

/** 'prompt': an "Installieren" button (captured beforeinstallprompt); 'ios': "Teilen -> Zum Home-Bildschirm". */
export type InstallHintKind = 'prompt' | 'ios';

/** Visits from which on the install hint shows (the first visit is for playing). */
export const INSTALL_HINT_MIN_VISITS = 2;

/** Which install hint a touch device gets, or null: never installed, running installed, dismissed or before the 2nd visit. */
export function installHintKind(install: InstallState, touch: boolean): InstallHintKind | null {
  if (!touch || install.standalone || install.installed || install.dismissed) return null;
  if (install.visits < INSTALL_HINT_MIN_VISITS) return null;
  if (install.canPrompt) return 'prompt';
  return install.platform === 'ios' ? 'ios' : null;
}

/** The bullet lines of the "Neu in dieser Version" screen: every entry's items, newest first (core caps them). */
export function whatsNewLines(entries: readonly ChangelogEntry[]): string[] {
  return entries.flatMap((e) => e.items);
}
