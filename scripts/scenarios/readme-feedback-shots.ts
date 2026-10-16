/**
 * README screenshots of the feedback loop and the insights board, with dummy
 * data: every request to the worker is answered by a Playwright route (a fake
 * worker), so nothing reaches the live worker or GitHub. Saved to
 * docs/screenshots/:
 *
 * - feedback-form.png, mein-feedback.png, feedback-reply.png: the in-game
 *   feedback dialog (a bug report being written; "Mein Feedback" with every
 *   status; a done report with its version and reply), the view buffer
 *   upscaled x3 like scripts/scenarios/readme-shots.ts.
 * - feedback-form-portrait.png, mein-feedback-portrait.png,
 *   feedback-reply-portrait.png: the same on a phone held upright, where the
 *   dialog is a page sheet (the page in CSS pixels).
 * - insights-stats.png, insights-tickets.png: the hidden insights board at
 *   1280 px (Statistik over 30 days; the Feedback tab with tickets in every
 *   state, linked GitHub issues and player replies).
 * - insights-stats-portrait.png, insights-tickets-portrait.png: the same
 *   board and data on a phone held upright (CSS pixels; the Statistik shot
 *   ends below its second chart).
 *
 *   npm run playtest -- --scenario scripts/scenarios/readme-feedback-shots.ts --viewports desktop,phone-portrait --name readme-feedback-shots
 */
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Route } from 'playwright';
import { doneMessage, PLANNED_MESSAGE } from '../../src/insights/messages';
import { sampleStats } from '../../src/insights/sample-stats';
import type { TriagedFeedbackEntry } from '../../src/insights/triage-types';
import { SCORES_URL } from '../../src/net/api';
import type { FeedbackStatusEntry } from '../../src/net/feedback-types';
import type { Rect } from '../../src/types';
import type { FeedbackDebug, UiDebugHook } from '../../src/ui/debug';
import { adultMode, captureCanvas, dismissRotateHint, ensureDir, type PlaytestContext } from '../playtest-lib';

type UiWindow = Window & { __ui?: UiDebugHook };

const OUT_DIR = resolve('docs/screenshots');
const SCALE = 3;
const MAX_BYTES = 400 * 1024;
const TOKEN = 'readme-token';
const FAKE_FEEDBACK = 'https://feedback.example.test';
const TODAY = '2026-10-15';
const VERSION = '2026-10-15.1';
const keyOf = (id: number) => `${id}`.padStart(32, 'a');
const SHEET = '[role=dialog][aria-label="Feedback"]';
const mid = (r: Rect) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)] as const;

/** Reports this device sent earlier (oldest first), all last seen as open. */
const SENT = [
  { kind: 'bug', text: 'Der Skater bleibt an der Bank hängen' },
  { kind: 'idea', text: 'Mehr Brezeln auf der Strecke bitte!' },
  { kind: 'idea', text: 'Ein Level im Rosensteinpark mit Enten' },
  { kind: 'bug', text: 'Nach der Pause ist die Musik weg' },
] as const;

const SENT_STATUS: FeedbackStatusEntry[] = [
  { id: 1, status: 'done', reply: doneMessage('2026-10-13.2'), doneVersion: '2026-10-13.2' },
  { id: 2, status: 'todo', reply: PLANNED_MESSAGE, doneVersion: null },
  { id: 3, status: 'rejected', reply: 'Danke! Das passt leider nicht zur Strecke.', doneVersion: null },
  { id: 4, status: 'open', reply: null, doneVersion: null },
];

function seedSent(): unknown[] {
  return SENT.map(({ kind, text }, i) => ({
    id: i + 1, key: keyOf(i + 1), day: `2026-10-${10 + i}`, kind, text, version: '2026-10-13.2',
    platform: 'android', input: 'touch', orientation: 'landscape', viewWidth: 390, log: [],
    status: 'open', reply: null, doneVersion: null, seen: JSON.stringify(['open', null, null]),
  }));
}

/** The board's tickets (newest first): every status, issue states open, closed and ready to close. */
function tickets(): TriagedFeedbackEntry[] {
  const base = {
    version: VERSION, platform: 'android', input: 'touch', orientation: 'landscape', viewWidth: 390, log: [] as string[],
    status: 'open', issue: null, reply: null, doneVersion: null, issueState: null, issueClosedDay: null,
  } as const;
  return [
    { ...base, id: 31, day: '2026-10-15', kind: 'idea', text: 'Ein Level im Rosensteinpark mit Enten wäre toll!' },
    {
      ...base, id: 30, day: '2026-10-15', kind: 'bug', text: 'Nach dem Kickflip an der Neckarbrücke ruckelt das Bild kurz.',
      platform: 'ios', viewWidth: 427,
      log: ['18:02:11 frame: 41 ms (stepPlayer)', '18:02:11 frame: 38 ms (drawWorld)', '18:02:12 state: mode playing, version 2026-10-15.1, view 427x180'],
    },
    { ...base, id: 29, day: '2026-10-14', kind: 'idea', text: 'Mehr Brezeln auf der Strecke bitte!', status: 'todo', issue: 47, issueState: 'open', reply: PLANNED_MESSAGE },
    {
      ...base, id: 28, day: '2026-10-13', kind: 'bug', text: 'Der Skater bleibt an der Bank hängen, wenn ich ganz knapp springe.',
      input: 'keys', platform: 'other', viewWidth: 427, status: 'todo', issue: 45, issueState: 'completed', issueClosedDay: '2026-10-15', reply: PLANNED_MESSAGE,
    },
    {
      ...base, id: 27, day: '2026-10-11', kind: 'idea', text: 'Ein Zahnrad für die Einstellungen wäre schöner als ein Text.',
      status: 'done', issue: 42, issueState: 'completed', issueClosedDay: '2026-10-13', doneVersion: '2026-10-13.2', reply: doneMessage('2026-10-13.2'),
    },
    { ...base, id: 26, day: '2026-10-10', kind: 'idea', text: 'Bitte ein Level auf dem Mond!', status: 'rejected', reply: 'Danke für dein Feedback! Das passt leider nicht ins Spiel.' },
  ];
}

const NICKNAMES = ['Wasen-Wiesel', 'Neckarblitz', 'Brezel-Boss', 'Stäffele-Star', 'Kursaal-Kid'];

function stats(days: number) {
  const s = sampleStats(days as Parameters<typeof sampleStats>[0], TODAY);
  s.topScores = NICKNAMES.map((name, i) => ({ name, score: 48_200 - i * 3_650, date: `2026-10-${String(15 - i * 2).padStart(2, '0')}T17:00:00.000Z` }));
  s.split.version = [
    { key: VERSION, count: Math.round(s.sessions.total * 0.52) },
    { key: '2026-10-13.2', count: Math.round(s.sessions.total * 0.31) },
    { key: '2026-10-11.4', count: Math.round(s.sessions.total * 0.12) },
    { key: 'other', count: Math.round(s.sessions.total * 0.05) },
  ];
  return s;
}

async function checkSize(t: PlaytestContext, file: string): Promise<void> {
  const { size } = await stat(file);
  t.check(`${file}: under ${MAX_BYTES / 1024} KB`, size < MAX_BYTES, { size });
}

/** The in-game dialog: "Neu" with a bug report typed in, "Mein Feedback", then the done report with its reply. */
async function gameShots(t: PlaytestContext, portrait: boolean): Promise<void> {
  const { page } = t;
  await page.context().addInitScript((url) => ((window as { __feedbackUrl?: string }).__feedbackUrl = url), FAKE_FEEDBACK);
  await page.route(`${FAKE_FEEDBACK}/**`, (route: Route) => {
    const headers = { 'Access-Control-Allow-Origin': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (new URL(route.request().url()).pathname === '/feedback/status') return route.fulfill({ status: 200, headers, json: { entries: SENT_STATUS } });
    return route.abort();
  });
  await page.route(`${SCORES_URL}/**`, (route: Route) => route.abort());
  const fb = () => page.evaluate(() => (window as UiWindow).__ui!.feedback()) as Promise<FeedbackDebug>;
  const tap = async (r: Rect | null | undefined) => {
    if (!r) return;
    await t.realTapView(...mid(r));
    await t.game.step(3);
  };
  const sheet = page.locator(SHEET);
  const sheetTap = async (name: string | RegExp) => {
    await sheet.getByRole('button', { name, exact: typeof name === 'string' }).tap();
    await t.game.step(3);
  };
  const shot = async (name: string) => {
    const file = resolve(OUT_DIR, `${name}${portrait ? '-portrait' : ''}.png`);
    if (portrait) await page.screenshot({ path: file, scale: 'css' });
    else await captureCanvas(page, file, SCALE);
    await checkSize(t, file);
  };

  await page.evaluate((reports) => {
    localStorage.setItem('cannstatt-cruiser:feedbackSent', JSON.stringify(reports));
    localStorage.removeItem('cannstatt-cruiser:feedbackCheckedAt');
  }, seedSent());
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__game));
  await t.game.pause();
  if (portrait) await dismissRotateHint(t);
  await adultMode(t);
  for (let i = 0; i < 40 && !(await fb())?.dot; i++) {
    await t.wait(50);
    await t.game.step(1);
  }
  t.check('the status answer arrived (red dot)', (await fb()).dot);

  if (portrait) {
    await tap((await page.evaluate(() => (window as UiWindow).__ui!.layout())).screen?.feedback);
    await page.locator(`${SHEET} textarea`).tap();
  } else {
    await page.keyboard.press('KeyF');
    await t.game.step(3);
  }
  await page.keyboard.type('Nach dem Grind hängt das Bild kurz', { delay: 5 });
  await t.game.step(3);
  await shot('feedback-form');

  if (portrait) await sheetTap('Mein Feedback');
  else await tap((await fb()).form.mineTab);
  let state = await fb();
  t.check('Mein Feedback lists the four reports', state.page === 'list' && state.rows.length === SENT.length, state.rows);
  await shot('mein-feedback');

  if (portrait) await sheetTap(/Umgesetzt/);
  else await tap(state.rowRects[state.rows.findIndex((r) => r.label === 'Umgesetzt')]);
  state = await fb();
  t.check('the done report shows its version and reply', state.page === 'detail' && !!state.detail?.reply, state.detail);
  await shot('feedback-reply');
}

/** The insights board at 1280 px or on the phone: Statistik (30 T), then the Feedback tab. */
async function boardShots(t: PlaytestContext, portrait: boolean): Promise<void> {
  const browser = t.page.context().browser()!;
  const context = await browser.newContext({ ...t.viewport.options, ...(portrait ? {} : { viewport: { width: 1280, height: 900 } }), serviceWorkers: 'block' });
  await context.route(`${SCORES_URL}/**`, (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Content-Type': 'application/json' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (url.pathname === '/board/tester-pass') return route.fulfill({ status: 200, headers, body: JSON.stringify({ scope: 'tester', pass: 'readme-pass', expiresAt: Date.now() + 86_400_000 }) });
    if (req.method() !== 'GET') return route.abort();
    if (url.pathname === '/stats') return route.fulfill({ status: 200, headers, body: JSON.stringify(stats(Number(url.searchParams.get('days')) || 7)) });
    if (url.pathname === '/feedback') return route.fulfill({ status: 200, headers, body: JSON.stringify({ entries: tickets() }) });
    return route.fulfill({ status: 404, headers, body: '{}' });
  });
  const page = await context.newPage();
  try {
    await page.goto(new URL('insights.html', t.page.url()).href);
    await page.fill('input[name=token]', TOKEN);
    await page.click('button[type=submit]');
    await page.waitForSelector('.chart');
    await page.click('.segmented button:has-text("30 T")');
    await page.waitForFunction(() => document.querySelector('.segmented button[aria-pressed=true]')?.textContent === '30 T' && document.querySelector('.board')?.getAttribute('aria-busy') === 'false');
    /** `height` cuts the full page off below that many CSS pixels. */
    const shot = async (name: string, height?: number) => {
      const file = resolve(OUT_DIR, `${name}${portrait ? '-portrait' : ''}.png`);
      const clip = height === undefined ? undefined : { x: 0, y: 0, width: page.viewportSize()!.width, height };
      await page.screenshot({ path: file, fullPage: true, scale: 'css', clip });
      await checkSize(t, file);
    };
    // The phone shot stops below the second chart: the rest repeats the desktop shot one column at a time.
    const secondChartEnd = () => page.evaluate(() => Math.ceil(document.querySelectorAll('.chart')[1]!.closest('.card')!.getBoundingClientRect().bottom + window.scrollY + 16));
    await shot('insights-stats', portrait ? await secondChartEnd() : undefined);

    await page.click('#tab-feedback');
    await page.click('.chip:has-text("Erledigt")');
    await page.click('.chip:has-text("Abgelehnt")');
    await page.click('.fb-item[data-id="30"] .fb-log summary');
    await shot('insights-tickets');
  } finally {
    await context.close();
  }
}

export default async function readmeFeedbackShots(t: PlaytestContext): Promise<void> {
  const portrait = t.viewport.name === 'phone-portrait';
  if (t.viewport.name !== 'desktop' && !portrait) {
    await t.log(`readme-feedback-shots: no shots for viewport ${t.viewport.name} (use desktop,phone-portrait)`);
    return;
  }
  await ensureDir(OUT_DIR);
  await gameShots(t, portrait);
  await boardShots(t, portrait);
}
