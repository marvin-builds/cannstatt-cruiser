/**
 * The hidden settings menu ("Einstellungen") and its only setting, the kid
 * mode (state.kidMode). DOM-free logic: the long press that opens the menu,
 * the parent check that guards switching kid mode off, and persistence.
 * Hotspots and drawing live in index.ts and screens.ts.
 */
import { Rng } from '../core/rng';
import type { Store } from '../core/storage';
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

export interface ParentQuestion {
  a: number;
  b: number;
  /** Three distinct choices; answers[correct] === a * b. */
  answers: number[];
  correct: number;
}

/** "Wie viel ist a × b?" with factors 6-9, the product and two near misses, shuffled. */
export function parentQuestion(seed: number): ParentQuestion {
  const rng = new Rng(seed);
  const a = rng.int(6, 9);
  const b = rng.int(6, 9);
  const product = a * b;
  const misses = [product + a, product - a, product + b, product - b, product + 10, product - 10];
  const answers = [product];
  while (answers.length < 3) {
    const n = rng.pick(misses);
    if (!answers.includes(n)) answers.push(n);
  }
  for (let i = answers.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [answers[i], answers[j]] = [answers[j]!, answers[i]!];
  }
  return { a, b, answers, correct: answers.indexOf(product) };
}

const KID_MODE_KEY = 'kidMode';

export function loadKidMode(store: Store): boolean {
  return store.get<unknown>(KID_MODE_KEY, false) === true;
}

export function saveKidMode(store: Store, on: boolean): void {
  store.set(KID_MODE_KEY, on);
}

export type SettingsScreen = 'closed' | 'menu' | 'check';

/** Which screen of the hidden menu is showing, and the parent check's question. */
export class SettingsMenu {
  screen: SettingsScreen = 'closed';
  question: ParentQuestion | null = null;

  constructor(private readonly store: Store) {}

  get open(): boolean {
    return this.screen !== 'closed';
  }

  show(): void {
    this.screen = 'menu';
    this.question = null;
  }

  close(): void {
    this.screen = 'closed';
    this.question = null;
  }

  /** The Kindermodus button: on at once; off only after the parent check (question from `seed`). */
  toggle(state: GameState, seed: number): void {
    if (this.screen !== 'menu') return;
    if (!state.kidMode) {
      this.setKidMode(state, true);
      return;
    }
    this.screen = 'check';
    this.question = parentQuestion(seed);
  }

  /** An answer button of the parent check: right turns kid mode off, wrong closes without change. */
  answer(state: GameState, index: number): void {
    if (this.screen !== 'check' || !this.question) return;
    if (index === this.question.correct) {
      this.setKidMode(state, false);
      this.show();
    } else {
      this.close();
    }
  }

  /** "Zurück": from the check back to the menu, from the menu out. */
  back(): void {
    if (this.screen === 'check') this.show();
    else this.close();
  }

  private setKidMode(state: GameState, on: boolean): void {
    state.kidMode = on;
    saveKidMode(this.store, on);
  }
}
