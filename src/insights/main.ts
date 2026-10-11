/**
 * Entry of insights.html (ROADMAP 46): the owner's private board. The admin
 * token lives only in this module's memory; it is never written to storage or
 * the URL. Never linked from the game.
 */
import './insights.css';
import { store } from '../core/storage';
import type { FetchLike } from '../net/api';
import type { InsightsStats, StatsRange } from '../net/telemetry-types';
import { drawDayCharts, renderBoard } from './board';
import { apiBase, createIssue, deleteFeedback, fetchFeedback, fetchStats, patchFeedback, type StatsError, type TriageResult } from './client';
import type { FeedbackFilter } from './feedback';
import type { FeedbackHandlers } from './feedback-card';
import type { StatusFilter } from './triage';
import type { TriagedFeedbackEntry } from './triage-types';
import { renderLocked } from './locked';
import { markOnUnlock, setTestDevice, testDeviceState } from './test-device';

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
let feedback: TriagedFeedbackEntry[] | null = null;
let feedbackFilter: FeedbackFilter = 'all';
let statusFilter: StatusFilter = 'all';
/** The test-device marker as the board shows it; written only through test-device.ts. */
let testDevice = testDeviceState(store) === true;
/** 'inkl. Testgeräte': off on every page load, never stored. */
let testers = false;

function showLocked(message: string | null, busy = false): void {
  stats = null;
  renderLocked(root, { message, busy, canRetry: token !== null && !busy }, { onSubmit: unlock, onRetry: () => void load() });
}

function showBoard(loading: boolean, error: string | null = null): void {
  if (!stats) return;
  renderBoard(
    root,
    { stats, range, loading, error, feedback: { entries: feedback, filter: feedbackFilter, status: statusFilter }, testDevice, testers },
    {
      onRange: switchRange,
      onReload: () => void load(),
      onLock: lock,
      feedback: feedbackHandlers,
      onTestDevice: switchTestDevice,
      onTesters: switchTesters,
    },
  );
}

/** A triage call with the token in memory; a 401 locks the board like a failed load. */
async function triage<T>(call: (token: string) => Promise<TriageResult<T>>): Promise<TriageResult<T>> {
  if (!token) return { ok: false, error: 'auth' };
  const result = await call(token);
  if (!result.ok && result.error === 'auth') {
    token = null;
    showLocked(ERRORS.auth);
  }
  return result;
}

const feedbackHandlers: FeedbackHandlers = {
  onFilter(filter, status) {
    feedbackFilter = filter;
    statusFilter = status;
  },
  onEntries(entries) {
    feedback = entries;
  },
  createIssue: (id, draft) => triage((t) => createIssue(fetchFn, { base, token: t, id, draft })),
  patch: (id, patch) => triage((t) => patchFeedback(fetchFn, { base, token: t, id, patch })),
  remove: (id) => triage((t) => deleteFeedback(fetchFn, { base, token: t, id })),
};

async function load(): Promise<void> {
  if (!token) return;
  const asked = range;
  const askedTesters = testers;
  if (stats) showBoard(true);
  else showLocked(null, true);
  const [result, fb] = await Promise.all([fetchStats(fetchFn, { base, token, days: asked, testers: askedTesters }), fetchFeedback(fetchFn, { base, token })]);
  if (asked !== range || askedTesters !== testers || !token) return;
  if ((!result.ok && result.error === 'auth') || (!fb.ok && fb.error === 'auth')) {
    token = null;
    showLocked(ERRORS.auth);
    return;
  }
  feedback = fb.ok ? fb.entries : null;
  if (result.ok) {
    testDevice = markOnUnlock(store);
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

function switchTestDevice(on: boolean): void {
  setTestDevice(store, on);
  testDevice = on;
}

function switchTesters(on: boolean): void {
  testers = on;
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
