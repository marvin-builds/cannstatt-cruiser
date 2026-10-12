/**
 * The online list's screens as a DOM-free state machine: the "Bestenliste"
 * (opened from the title, or after an entry) and the name entry after game
 * over ("Eintragen"). It talks to the ScoreService (src/net) and never waits
 * on it inside a tick: submit() is a promise the ui does not await.
 */
import type { Store } from '../core/storage';
import type { ScoreEntry } from '../net/api';
import type { RunStats } from '../net/payload';
import type { ScoreService } from '../net/service';
import { type Texts, texts } from './i18n';
import { formatNumber } from './layout';
import { loadName, nameProblem, cleanName, qualifies, saveName, stripNameInput } from './score-rules';

export type ScoreServiceLike = Pick<ScoreService, 'top' | 'topState' | 'pending' | 'ownBest' | 'ownRank' | 'refreshTop' | 'submit' | 'retryPending'>;

export type ScoreScreen = 'closed' | 'list' | 'entry';

/** A status or error line of the screens, read in the language active when it is shown (texts in i18n/). */
type ScoreMessage = (t: Texts) => string;

export interface HighscoreFlowDeps {
  service: ScoreServiceLike;
  store: Store;
}

export class HighscoreFlow {
  screen: ScoreScreen = 'closed';
  /** The name in the entry field. */
  name = '';
  /** Status or error line of the screen, or null. */
  private note: ScoreMessage | null = null;
  sending = false;
  /** List scroll offset in view px (clamped by the layout, clampScroll). */
  scroll = 0;
  /** The list should scroll to the own entry once laid out. */
  revealOwn = false;
  private run: RunStats | null = null;
  private submitted = false;

  constructor(private readonly deps: HighscoreFlowDeps) {}

  get open(): boolean {
    return this.screen !== 'closed';
  }

  /** The status or error line in the active language, or null. */
  get message(): string | null {
    return this.note?.(texts()) ?? null;
  }

  /** The last fetched list (empty while none is known). */
  get entries(): readonly ScoreEntry[] {
    return this.deps.service.top ?? [];
  }

  get topState() {
    return this.deps.service.topState;
  }

  /** Rank of the device's own row in the list (as the server said), or null. */
  get highlight(): number | null {
    return this.deps.service.ownRank;
  }

  /** The device's known own online best (0 = no entry). */
  get ownBest(): number {
    return this.deps.service.ownBest;
  }

  /**
   * "Eintragen" shows on game over: the run was not entered yet, beats the
   * device's own online best (and a run still waiting to be sent), and makes
   * the top list.
   */
  get offered(): boolean {
    if (!this.run || this.submitted) return false;
    const { pending, top } = this.deps.service;
    return this.run.score > Math.max(this.ownBest, pending?.score ?? 0) && qualifies(this.run.score, top);
  }

  get score(): number {
    return this.run?.score ?? 0;
  }

  get canSubmit(): boolean {
    return !this.sending && nameProblem(this.name) === null;
  }

  /**
   * A run starts: forget the last one. With `fetchList` (adult mode) the list is fetched in the
   * background, so it is ready at game over; a kid run never uses the online list.
   */
  runStarted(fetchList: boolean): void {
    this.run = null;
    this.submitted = false;
    this.close();
    if (fetchList) void this.deps.service.refreshTop();
  }

  runEnded(run: RunStats): void {
    this.run = { ...run };
    this.submitted = false;
  }

  openList(): void {
    this.screen = 'list';
    this.scroll = 0;
    this.revealOwn = true;
    this.note = this.deps.service.pending ? (t) => t.score.queued : null;
    void this.deps.service.refreshTop();
    void this.deps.service.retryPending();
  }

  /** The name entry with the remembered name. */
  openEntry(): void {
    this.screen = 'entry';
    this.note = null;
    this.name = loadName(this.deps.store);
  }

  /** Typing: allowed characters only. */
  setName(raw: string): void {
    if (this.sending) return;
    this.name = stripNameInput(raw);
    this.note = null;
  }

  close(): void {
    if (this.sending) return;
    this.screen = 'closed';
    this.note = null;
  }

  scrollBy(dy: number): void {
    this.scroll = Math.max(0, this.scroll + dy);
  }

  /** Keeps the scroll within the list's overflow `max` (from the layout). */
  clampScroll(max: number): void {
    this.scroll = Math.max(0, Math.min(this.scroll, Math.max(0, max)));
  }

  /** Sends the run under the entered name; the answer switches to the list or shows a message. */
  async submit(): Promise<void> {
    if (!this.run || this.sending || this.screen !== 'entry') return;
    if (nameProblem(this.name) !== null) {
      this.note = (t) => t.score.short;
      return;
    }
    const name = cleanName(this.name);
    this.sending = true;
    this.note = (t) => t.score.sending;
    const outcome = await this.deps.service.submit(this.run, name);
    this.sending = false;
    if (outcome.kind === 'failed') {
      const error = outcome.error;
      this.note = (t) => (error === 'name' ? t.score.badName : error === 'rate' ? t.score.rate : t.score.failed);
      return;
    }
    this.submitted = true;
    saveName(this.deps.store, name);
    this.screen = 'list';
    this.scroll = 0;
    this.revealOwn = true;
    if (outcome.kind === 'queued') {
      const offline = outcome.reason === 'offline';
      this.note = (t) => (offline ? t.score.queued : t.score.queuedLater);
    } else if (!outcome.stored) {
      const best = outcome.best;
      this.note = (t) => t.score.kept(formatNumber(best));
    } else this.note = outcome.rank === null ? (t) => t.score.outside : null;
  }
}
