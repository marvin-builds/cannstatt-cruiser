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
import { nickname } from './nicknames';
import { loadLastEntry, loadName, nameProblem, cleanName, ownRank, qualifies, saveLastEntry, saveName, stripNameInput } from './score-rules';

export type ScoreServiceLike = Pick<ScoreService, 'top' | 'topState' | 'pending' | 'refreshTop' | 'submit' | 'retryPending'>;

export type ScoreScreen = 'closed' | 'list' | 'entry';

/** The texts of both screens (German, kid-safe, game font). */
export const SCORE_TEXT = {
  title: 'Bestenliste',
  entryTitle: 'Eintragen',
  submit: 'Eintragen',
  loading: 'Lade Bestenliste ...',
  offline: 'Offline – Bestenliste nicht verfügbar',
  empty: 'Noch keine Einträge – fahr los!',
  privacy: 'Gespeichert werden nur Name, Punkte, Strecke und Datum.',
  sending: 'Wird gesendet ...',
  queued: 'Wird gesendet, sobald du online bist',
  queuedLater: 'Wird später gesendet',
  badName: 'Dieser Name geht leider nicht',
  rate: 'Bitte kurz warten',
  failed: 'Das hat leider nicht geklappt',
  short: 'Mindestens 2 Zeichen',
  newName: 'Neuer Name',
  namePrompt: 'Dein Name:',
  kidPrompt: 'Dein Spitzname:',
  outside: 'Eingetragen! Leider nicht unter den Top 20',
} as const;

export interface HighscoreFlowDeps {
  service: ScoreServiceLike;
  store: Store;
  /** [0, 1) for the kid nicknames. */
  random: () => number;
}

export class HighscoreFlow {
  screen: ScoreScreen = 'closed';
  /** The name in the entry field (kid mode: the generated nickname). */
  name = '';
  /** Kid mode entry: only generated nicknames, no free text. */
  kid = false;
  /** Status or error line of the screen, or null. */
  message: string | null = null;
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

  /** The last fetched list (empty while none is known). */
  get entries(): readonly ScoreEntry[] {
    return this.deps.service.top ?? [];
  }

  get topState() {
    return this.deps.service.topState;
  }

  /** Rank of the own last entry in the list, or null. */
  get highlight(): number | null {
    return ownRank(this.entries, loadLastEntry(this.deps.store));
  }

  /** "Eintragen" shows on game over: the run makes the top list and was not entered yet. */
  get offered(): boolean {
    return !!this.run && !this.submitted && qualifies(this.run.score, this.deps.service.top);
  }

  get score(): number {
    return this.run?.score ?? 0;
  }

  get canSubmit(): boolean {
    return !this.sending && nameProblem(this.name) === null;
  }

  /** A run starts: forget the last one and fetch the list in the background, so it is ready at game over. */
  runStarted(): void {
    this.run = null;
    this.submitted = false;
    this.close();
    void this.deps.service.refreshTop();
  }

  runEnded(run: RunStats): void {
    this.run = { ...run };
    this.submitted = false;
  }

  openList(): void {
    this.screen = 'list';
    this.scroll = 0;
    this.revealOwn = true;
    this.message = this.deps.service.pending ? SCORE_TEXT.queued : null;
    void this.deps.service.refreshTop();
    void this.deps.service.retryPending();
  }

  /** The name entry: the remembered name, in kid mode the remembered or a new nickname. */
  openEntry(kid: boolean): void {
    this.screen = 'entry';
    this.kid = kid;
    this.message = null;
    this.name = loadName(this.deps.store, kid) || (kid ? nickname(this.deps.random) : '');
  }

  /** Typing (adult mode only): allowed characters only. */
  setName(raw: string): void {
    if (this.kid || this.sending) return;
    this.name = stripNameInput(raw);
    this.message = null;
  }

  /** "Neuer Name" in kid mode: another nickname. */
  reroll(): void {
    if (!this.kid || this.sending) return;
    const before = this.name;
    for (let i = 0; i < 10 && this.name === before; i++) this.name = nickname(this.deps.random);
    this.message = null;
  }

  close(): void {
    if (this.sending) return;
    this.screen = 'closed';
    this.message = null;
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
      this.message = SCORE_TEXT.short;
      return;
    }
    const name = cleanName(this.name);
    const score = this.run.score;
    this.sending = true;
    this.message = SCORE_TEXT.sending;
    const outcome = await this.deps.service.submit(this.run, name);
    this.sending = false;
    if (outcome.kind === 'failed') {
      this.message = outcome.error === 'name' ? SCORE_TEXT.badName : outcome.error === 'rate' ? SCORE_TEXT.rate : SCORE_TEXT.failed;
      return;
    }
    this.submitted = true;
    saveName(this.deps.store, this.kid, name);
    saveLastEntry(this.deps.store, { name, score });
    this.screen = 'list';
    this.scroll = 0;
    this.revealOwn = true;
    if (outcome.kind === 'queued') this.message = outcome.reason === 'offline' ? SCORE_TEXT.queued : SCORE_TEXT.queuedLater;
    else this.message = outcome.rank === null ? SCORE_TEXT.outside : null;
  }
}
