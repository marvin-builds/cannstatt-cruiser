/**
 * When the game offers installing itself (ROADMAP 18, 68): the "App
 * installieren" card on game over after a calm run (a decent one or a beaten
 * record, never on the title where any tap starts a run), its "×" snooze, and
 * what the button does: the kept browser prompt when there is one, else the
 * manual steps of the platform (install-guide.ts). The settings menu offers
 * the same button for as long as the game is not installed. DOM-free; the
 * snooze lives under the ui's own store key SNOOZE_KEY (core's old "never
 * again" flag is migrated to one used snooze).
 */
import type { Store } from '../core/storage';
import type { InstallState } from '../types';

/** "×" hides the card for this many days ... */
export const SNOOZE_DAYS = 7;
/** ... or until this many more page loads, whichever comes first. */
export const SNOOZE_VISITS = 5;
/** The card comes back after "×" at most this many times; the next "×" hides it for good. */
export const MAX_SNOOZES = 3;
/** A run at least this long is a calm moment for the card. */
export const CALM_RUN_SECONDS = 30;
/** Store key of the snooze (ui-owned). */
export const SNOOZE_KEY = 'installSnooze';

const DAY_MS = 24 * 60 * 60 * 1000;

/** How often "×" was pressed, and the time (ms) and visit count of the last press. */
interface Snooze {
  count: number;
  at: number;
  visits: number;
}

const NONE: Snooze = { count: 0, at: 0, visits: 0 };

function parseSnooze(v: unknown): Snooze | null {
  if (!v || typeof v !== 'object') return null;
  const { count, at, visits } = v as Record<string, unknown>;
  const ok = [count, at, visits].every((n) => typeof n === 'number' && Number.isFinite(n) && n >= 0);
  return ok ? { count: count as number, at: at as number, visits: visits as number } : null;
}

/** Installing is possible: not installed during this visit and not running as the installed app. */
export function installable(install: InstallState): boolean {
  return !install.standalone && !install.installed;
}

/** The parts of a finished run the card's timing reads (records.ts RunResult and the run's playing time). */
export interface FinishedRun {
  seconds: number;
  newRecord: boolean;
  previousHighscore: number;
}

/** A calm moment: a decent run, or a beaten record (the first run always sets one, so that alone does not count). */
function calmRun(run: FinishedRun): boolean {
  return run.seconds >= CALM_RUN_SECONDS || (run.newRecord && run.previousHighscore > 0);
}

export class InstallOffer {
  private snoozed: Snooze = NONE;
  private calm = false;
  /** The manual steps (install-guide.ts) show, over every other screen. */
  guideOpen = false;

  constructor(
    private readonly store: Store,
    private readonly now: () => number,
  ) {}

  /** Once at startup: the stored snooze, or core's old "never again" as one snooze counted from now. */
  load(install: InstallState): void {
    const stored = parseSnooze(this.store.get<unknown>(SNOOZE_KEY, null));
    if (stored) this.snoozed = stored;
    else if (install.dismissed) this.save({ count: 1, at: this.now(), visits: install.visits });
  }

  runStarted(): void {
    this.calm = false;
  }

  runEnded(run: FinishedRun): void {
    this.calm = calmRun(run);
  }

  /**
   * The game-over card: touch devices after a calm run, while installable and not snoozed;
   * Android and iOS always have a way (prompt or manual steps), other platforms only a kept prompt.
   */
  cardShown(install: InstallState, touch: boolean): boolean {
    if (!touch || !this.calm || !installable(install) || this.isSnoozed(install)) return false;
    return install.platform !== 'other' || install.canPrompt;
  }

  /** "×" on the card. */
  snooze(install: InstallState): void {
    this.save({ count: this.snoozed.count + 1, at: this.now(), visits: install.visits });
  }

  /** "App installieren" (card or settings): the kept browser prompt (call inside the user gesture), else the manual steps. */
  press(install: InstallState, commands: { promptInstall(): void }): void {
    if (install.canPrompt) commands.promptInstall();
    else this.guideOpen = true;
  }

  closeGuide(): void {
    this.guideOpen = false;
  }

  private isSnoozed(install: InstallState): boolean {
    const s = this.snoozed;
    if (s.count === 0) return false;
    if (s.count > MAX_SNOOZES) return true;
    return this.now() - s.at < SNOOZE_DAYS * DAY_MS && install.visits - s.visits < SNOOZE_VISITS;
  }

  private save(s: Snooze): void {
    this.snoozed = s;
    this.store.set(SNOOZE_KEY, s);
  }
}
