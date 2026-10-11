/**
 * When the menu screens offer the reload button ("Neue Version da"): a pure
 * rule over the state core writes (updateReady); layout in menu-layout.ts,
 * hotspots in index.ts, drawing in menu-screens.ts. The install card's rules
 * are in install-offer.ts.
 */
import type { GameMode } from '../types';

/** The reload button: while a new version waits, on title, pause and game over (never mid-run). */
export function reloadOffered(state: { mode: GameMode; updateReady: boolean }): boolean {
  return state.updateReady && state.mode !== 'playing';
}
