/**
 * The hidden settings menu ("Einstellungen") with the kid mode
 * (state.kidMode) and the anonymous statistics switch (ROADMAP 46, also on the
 * "Bestenliste"), plus the notice the title's "Kindermodus" button opens
 * (ROADMAP 43). DOM-free logic: the long press that opens the menu (the only
 * guard: 3 s on the logo or K), the toggles and persistence. Hotspots and
 * drawing live in index.ts and screens.ts.
 */
import type { Store } from '../core/storage';
import { loadStatsOptOut, saveStatsOptOut } from '../net/telemetry';
import type { GameState } from '../types';

/** Seconds the title logo (or K) must be held to open the menu. */
export const LONG_PRESS_TIME = 3;
/** Seconds of holding before any progress shows, so kids don't discover it by chance. */
export const LONG_PRESS_HINT_DELAY = 1;

/** Long press fed by several sources (a pointer on the logo, the K key). Time is counted in ticks. */
export class LongPress {
  private readonly sources = new Set<string>();
  private held = 0;
  private fired = false;

  /** A source went down; the first one starts a new press. */
  start(source: string): void {
    if (this.sources.size === 0) {
      this.held = 0;
      this.fired = false;
    }
    this.sources.add(source);
  }

  /** A source went up. True if that ended a short press (released before it fired). */
  end(source: string): boolean {
    if (!this.sources.delete(source)) return false;
    return this.sources.size === 0 && !this.fired;
  }

  /** Advances one tick; true on the tick the long press completes. */
  update(dt: number): boolean {
    if (this.sources.size === 0 || this.fired) return false;
    this.held += dt;
    // Ticks add up to 2.9999..., so compare with a small tolerance.
    if (this.held < LONG_PRESS_TIME - 1e-6) return false;
    this.fired = true;
    return true;
  }

  /** 0 until the hint delay, then 0..1 up to the long press; 0 when nothing is held or it already fired. */
  get progress(): number {
    if (this.sources.size === 0) return 0;
    if (this.fired) return 1;
    const t = (this.held - LONG_PRESS_HINT_DELAY) / (LONG_PRESS_TIME - LONG_PRESS_HINT_DELAY);
    return Math.min(1, Math.max(0, t));
  }
}

const KID_MODE_KEY = 'kidMode';

/** Adult mode unless an explicit choice turned kid mode on (ROADMAP 43): no, unreadable or junk storage is adult mode. */
export function loadKidMode(store: Store): boolean {
  return store.get<unknown>(KID_MODE_KEY, false) === true;
}

export function saveKidMode(store: Store, on: boolean): void {
  store.set(KID_MODE_KEY, on);
}

/** The statistics switch's texts (game font, fit 320 px at scale 1). */
export const STATS_TEXT = {
  label: (on: boolean) => `Anonyme Statistik: ${on ? 'AN' : 'AUS'}`,
  note: 'Ohne Namen. Ort grob (Stadt), keine IP gespeichert.',
  noteShort: 'Ohne Namen und IP, Ort nur grob.',
  /** The Bestenliste's line under its own privacy line. */
  listNote: 'Statistik: anonym, Ort grob (Stadt), keine IP.',
  listNoteShort: 'Statistik: anonym, ohne IP.',
  offNote: 'Aus: Es wird keine Statistik gesendet.',
} as const;

/** 'kidNotice': "Kindermodus ist an" after the title's button, naming the way back. */
export type SettingsScreen = 'closed' | 'menu' | 'kidNotice';

/**
 * Whether the hidden menu (or the kid mode notice) is showing, and its Kindermodus switch.
 * `onClose(switched)` runs whenever the menu closes: `switched` tells whether
 * kid mode differs from when it opened (a run in progress restarts then).
 */
export class SettingsMenu {
  screen: SettingsScreen = 'closed';
  private kidModeAtOpen = false;
  /** Kid mode differs from when the menu opened. */
  switched = false;
  /** Anonymous statistics are sent (the store keeps the opt-out; Telemetry reads it at every send). */
  statsOn: boolean;

  constructor(
    private readonly store: Store,
    private readonly onClose: (switched: boolean) => void = () => {},
  ) {
    this.statsOn = !loadStatsOptOut(store);
  }

  get open(): boolean {
    return this.screen !== 'closed';
  }

  /** Opens the menu; `kidMode` is the setting now, to tell a switch on close. */
  openMenu(kidMode: boolean): void {
    this.kidModeAtOpen = kidMode;
    this.switched = false;
    this.screen = 'menu';
  }

  /** The title's "Kindermodus" button (adult mode only): kid mode on, saved, and the notice shows. */
  turnOnFromTitle(state: GameState): void {
    this.kidModeAtOpen = state.kidMode;
    this.setKidMode(state, true);
    this.screen = 'kidNotice';
  }

  /** Closes the menu ("Zurück", Esc) or the notice ("OK"). */
  close(): void {
    if (!this.open) return;
    this.screen = 'closed';
    this.onClose(this.switched);
  }

  /** The Kindermodus button: switches kid mode on or off at once. */
  toggle(state: GameState): void {
    if (this.screen !== 'menu') return;
    this.setKidMode(state, !state.kidMode);
  }

  /** The statistics switch (settings menu and "Bestenliste"): on or off at once, stored. */
  toggleStats(): void {
    this.statsOn = !this.statsOn;
    saveStatsOptOut(this.store, !this.statsOn);
  }

  private setKidMode(state: GameState, on: boolean): void {
    state.kidMode = on;
    this.switched = on !== this.kidModeAtOpen;
    saveKidMode(this.store, on);
  }
}
