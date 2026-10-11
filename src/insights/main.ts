/**
 * Entry of insights.html (ROADMAP 46): the owner's private board. The admin
 * token lives only in this module's memory; it is never written to storage or
 * the URL. Never linked from the game.
 */
import './insights.css';
import type { FetchLike } from '../net/api';
import type { FeedbackEntry } from '../net/feedback-types';
import type { InsightsStats, StatsRange } from '../net/telemetry-types';
import { drawDayCharts, renderBoard } from './board';
import { apiBase, fetchFeedback, fetchStats, type StatsError } from './client';
import type { FeedbackFilter } from './feedback';
import { renderLocked } from './locked';

const root = document.getElementById('app')!;
const base = apiBase(window.location);
const fetchFn: FetchLike = (url, init) => fetch(url, init);

const ERRORS: Record<StatsError, string> = {
  auth: 'Token falsch',
  offline: 'Keine Verbindung zum Server. Bitte nochmal versuchen.',
  server: 'Der Server hat unerwartet geantwortet. Bitte nochmal versuchen.',
};

let token: string | null = null;
let range: StatsRange = 7;
let stats: InsightsStats | null = null;
/** null while GET /feedback fails; the stats still render. */
let feedback: FeedbackEntry[] | null = null;
let feedbackFilter: FeedbackFilter = 'all';

function showLocked(message: string | null, busy = false): void {
  stats = null;
  renderLocked(root, { message, busy, canRetry: token !== null && !busy }, { onSubmit: unlock, onRetry: () => void load() });
}

function showBoard(loading: boolean, error: string | null = null): void {
  if (!stats) return;
  renderBoard(
    root,
    { stats, range, loading, error, feedback: { entries: feedback, filter: feedbackFilter } },
    { onRange: switchRange, onReload: () => void load(), onLock: lock, onFeedbackFilter: (filter) => (feedbackFilter = filter) },
  );
}

async function load(): Promise<void> {
  if (!token) return;
  const asked = range;
  if (stats) showBoard(true);
  else showLocked(null, true);
  const [result, fb] = await Promise.all([fetchStats(fetchFn, { base, token, days: asked }), fetchFeedback(fetchFn, { base, token })]);
  if (asked !== range || !token) return;
  if ((!result.ok && result.error === 'auth') || (!fb.ok && fb.error === 'auth')) {
    token = null;
    showLocked(ERRORS.auth);
    return;
  }
  feedback = fb.ok ? fb.entries : null;
  if (result.ok) {
    stats = result.stats;
    showBoard(false);
  } else if (stats) {
    showBoard(false, ERRORS[result.error]);
  } else {
    showLocked(ERRORS[result.error]);
  }
}

function unlock(value: string): void {
  token = value;
  void load();
}

function switchRange(days: StatsRange): void {
  range = days;
  void load();
}

function lock(): void {
  token = null;
  showLocked(null);
}

let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => stats && drawDayCharts(root, stats), 120);
});

showLocked(null);
