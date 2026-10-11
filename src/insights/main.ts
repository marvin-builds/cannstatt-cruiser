/**
 * Entry of insights.html (ROADMAP 46): the owner's private board. The admin
 * token lives only in memory; it is never written to storage or the URL. With
 * "Angemeldet bleiben" only a 7-day board session is kept (session.ts, ROADMAP 74).
 * Never linked from the game.
 */
import './insights.css';
import { store } from '../core/storage';
import type { FetchLike } from '../net/api';
import type { InsightsStats, StatsRange } from '../net/telemetry-types';
import { drawDayCharts, renderBoard } from './board';
import { apiBase, createIssue, createSession, deleteFeedback, fetchFeedback, fetchStats, patchFeedback, type StatsError, type TriageResult } from './client';
import type { FeedbackFilter } from './feedback';
import type { FeedbackHandlers } from './feedback-card';
import type { StatusFilter } from './triage';
import type { TriagedFeedbackEntry } from './triage-types';
import { renderLocked } from './locked';
import { BoardAuth, type Rejection } from './session';
import { markOnUnlock, setTestDevice, testDeviceState } from './test-device';

const root = document.getElementById('app')!;
const base = apiBase(window.location);
const fetchFn: FetchLike = (url, init) => fetch(url, init);

const ERRORS: Record<StatsError, string> = {
  auth: 'Token falsch',
  offline: 'Keine Verbindung zum Server. Bitte nochmal versuchen.',
  server: 'Der Server hat unerwartet geantwortet. Bitte nochmal versuchen.',
};

const auth = new BoardAuth(store, Date.now);
const REJECTED: Record<Rejection, string> = {
  'token-wrong': ERRORS.auth,
  'session-ended': 'Anmeldung abgelaufen. Bitte den Token neu eingeben.',
};
/** "Angemeldet bleiben" as last ticked on this page (not stored). */
let remember = false;
/** A note shown once on the board after signing in (e.g. the session could not be kept). */
let signInNote: string | null = null;
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
  renderLocked(root, { message, busy, canRetry: auth.bearer() !== null && !busy, remember }, { onSubmit: (t, r) => void unlock(t, r), onRetry: () => void load() });
}

function showBoard(loading: boolean, error: string | null = null): void {
  if (!stats) return;
  renderBoard(
    root,
    {
      stats, range, loading, error, feedback: { entries: feedback, filter: feedbackFilter, status: statusFilter }, testDevice, testers,
      remembered: auth.remembered,
    },
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

/** The worker answered 401 (or the kept session expired): sign out and ask for the token again. */
function reject(): void {
  showLocked(REJECTED[auth.rejected()]);
}

/** A triage call with the current bearer; a 401 locks the board like a failed load. */
async function triage<T>(call: (token: string) => Promise<TriageResult<T>>): Promise<TriageResult<T>> {
  const token = auth.bearer();
  if (!token) {
    showLocked(REJECTED['session-ended']);
    return { ok: false, error: 'auth' };
  }
  const result = await call(token);
  if (!result.ok && result.error === 'auth') reject();
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
  const token = auth.bearer();
  if (!token) {
    showLocked(REJECTED['session-ended']);
    return;
  }
  const asked = range;
  const askedTesters = testers;
  if (stats) showBoard(true);
  else showLocked(null, true);
  const [result, fb] = await Promise.all([fetchStats(fetchFn, { base, token, days: asked, testers: askedTesters }), fetchFeedback(fetchFn, { base, token })]);
  if (asked !== range || askedTesters !== testers || auth.bearer() !== token) return;
  if ((!result.ok && result.error === 'auth') || (!fb.ok && fb.error === 'auth')) {
    reject();
    return;
  }
  feedback = fb.ok ? fb.entries : null;
  if (result.ok) {
    testDevice = markOnUnlock(store);
    stats = result.stats;
    showBoard(false, signInNote);
    signInNote = null;
  } else if (stats) {
    showBoard(false, ERRORS[result.error]);
  } else {
    showLocked(ERRORS[result.error]);
  }
}

async function unlock(value: string, keep: boolean): Promise<void> {
  remember = keep;
  showLocked(null, true);
  const result = await auth.signIn(value, keep, (token) => createSession(fetchFn, { base, token }));
  if (!result.ok) {
    showLocked(ERRORS[result.error]);
    return;
  }
  signInNote = result.note;
  await load();
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

/** "Sperren" / "Abmelden": forgets the token and the kept session. */
function lock(): void {
  auth.signOut();
  if (auth.bearer()) void load();
else showLocked(null);
}

let resizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => stats && drawDayCharts(root, stats), 120);
});

if (auth.bearer()) void load();
else showLocked(null);
