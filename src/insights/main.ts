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
import { showTesterPassNote } from './device-switches';
import {
  apiBase, createIssue, createSession, createTesterPass, deleteFeedback, fetchFeedback, fetchStats, linkIssue, patchFeedback, type StatsError, type TriageResult,
} from './client';
import type { FeedbackFilter } from './feedback';
import type { FeedbackHandlers } from './feedback-card';
import { type BoardTab, initialTab, readStoredTab, storeTab, tabFromHash, tabHash } from './tabs';
import { DEFAULT_STATUSES } from './triage';
import type { FeedbackStatus, TriagedFeedbackEntry } from './triage-types';
import { renderLocked } from './locked';
import { BoardAuth, type Rejection } from './session';
import { markOnUnlock, refreshTesterPass, switchTestDevice, testDeviceState, testerPassNote } from './test-device';
import type { TesterPassResult } from './client';

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
let statusFilter: readonly FeedbackStatus[] = DEFAULT_STATUSES;
/** sessionStorage keeps only the tab name (ROADMAP 79); null where it is blocked. */
const tabStore = (() => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
})();
let tab: BoardTab = initialTab(window.location.hash, readStoredTab(tabStore));
/** The test-device marker as the board shows it; written only through test-device.ts. */
let testDevice = testDeviceState(store) === true;
/** 'inkl. Testgeräte': off on every page load, never stored. */
let testers = false;
/** The tester pass of a marked device is refreshed on the first successful load after an unlock (and after page load). */
let refreshPassOnLoad = true;
/** The line under the switches about the tester pass. */
let passNote: string | null = null;
/** Only the newest tester pass request may set the note. */
let passRequest = 0;

function showLocked(message: string | null, busy = false): void {
  stats = null;
  renderLocked(root, { message, busy, canRetry: auth.bearer() !== null && !busy, remember }, { onSubmit: (t, r) => void unlock(t, r), onRetry: () => void load() });
}

function showBoard(loading: boolean, error: string | null = null): void {
  if (!stats) return;
  renderBoard(
    root,
    {
      stats, range, loading, error, feedback: { entries: feedback, filter: feedbackFilter, statuses: statusFilter }, tab, testDevice, testers,
      testerPassNote: passNote, remembered: auth.remembered,
    },
    {
      onRange: switchRange,
      onReload: () => void load(),
      onLock: lock,
      onTab: rememberTab,
      feedback: feedbackHandlers,
      onTestDevice: toggleTestDevice,
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
  onFilter(filter, statuses) {
    feedbackFilter = filter;
    statusFilter = statuses;
  },
  onEntries(entries) {
    feedback = entries;
  },
  createIssue: (id, draft) => triage((t) => createIssue(fetchFn, { base, token: t, id, draft })),
  linkIssue: (id, link) => triage((t) => linkIssue(fetchFn, { base, token: t, id, link })),
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
    if (refreshPassOnLoad) {
      refreshPassOnLoad = false;
      trackPass(refreshTesterPass(store, fetchTesterPass));
    }
  } else if (stats) {
    showBoard(false, ERRORS[result.error]);
  } else {
    showLocked(ERRORS[result.error]);
  }
}

async function unlock(value: string, keep: boolean): Promise<void> {
  remember = keep;
  refreshPassOnLoad = true;
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

/** POST /board/tester-pass with the current bearer; a 401 only fails the pass, the next load locks the board. */
function fetchTesterPass(): Promise<TesterPassResult> {
  const token = auth.bearer();
  return token ? createTesterPass(fetchFn, { base, token }) : Promise.resolve({ ok: false, error: 'auth' });
}

/** Shows how a tester pass refresh went under the switches, unless a newer one started meanwhile. */
function trackPass(refresh: Promise<TesterPassResult | null>): void {
  const request = ++passRequest;
  void refresh.then((result) => {
    if (request !== passRequest) return;
    passNote = testerPassNote(result);
    showTesterPassNote(root, passNote);
  });
}

function toggleTestDevice(on: boolean): void {
  testDevice = on;
  trackPass(switchTestDevice(store, on, fetchTesterPass));
}

function switchTesters(on: boolean): void {
  testers = on;
  void load();
}

/** Keeps the shown tab in the hash (replacing the history entry, so Back leaves the board) and in sessionStorage. */
function rememberTab(next: BoardTab): void {
  tab = next;
  storeTab(tabStore, next);
  history.replaceState(history.state, '', tabHash(next));
}

/** A link to #feedback or #statistik opened on the board switches the tab. */
window.addEventListener('hashchange', () => {
  const next = tabFromHash(window.location.hash);
  if (!next || next === tab) return;
  tab = next;
  storeTab(tabStore, next);
  if (stats) showBoard(false);
});

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
