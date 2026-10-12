/**
 * English as a second language (ROADMAP 71): the "DE | EN" switch on the
 * title and the main screens in English. The online list and feedback go to
 * FAKE endpoints (Playwright routes, window.__feedbackUrl): nothing reaches
 * the live worker.
 *
 * - The device starts in German (the choice stored as "de"): a real tap on
 *   "EN" switches every text at once, sets <html lang="en"> and stores the
 *   choice; a reload stays English. The browser language is only read while
 *   nothing is stored: an English browser starts in English.
 * - English screenshots: title (adult and kid mode, the switch in both), a
 *   run with popups, a stunt callout and the zone ribbon, pause, game over
 *   with "Add score", settings (with the switch), the leaderboard and the
 *   name entry, feedback "New" and "My feedback", the install steps, what's
 *   new, and in portrait the rotate screen. Portrait sheets (feedback, entry,
 *   what's new) are checked for English labels.
 *
 *   npm run playtest -- --scenario scripts/scenarios/i18n-en.ts --viewports desktop,phone-landscape,phone-portrait --name i18n-en
 */
import type { Route } from 'playwright';
import { SCORES_URL } from '../../src/net/api';
import type { Rect } from '../../src/types';
import type { FeedbackDebug, HighscoresDebug, UiDebugHook } from '../../src/ui/debug';
import { adultMode, dismissRotateHint, type PlaytestContext } from '../playtest-lib';

type UiWindow = Window & { __ui?: UiDebugHook };
const FAKE = 'https://feedback.example.test';
const centre = (r: Rect) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)] as const;
const KEY = 'cannstatt-cruiser:language';

/** A small fake leaderboard: a few rows, a POST lands at rank 3. */
async function fakeScores(t: PlaytestContext): Promise<void> {
  const entries = ['Lilli', 'Mats', 'Ayşe', 'Jonas'].map((name, i) => ({ rank: i + 1, name, score: 9000 - i * 1500, distance: 2400 - i * 300, date: '2026-10-11T10:00:00.000Z' }));
  await t.page.route(`${SCORES_URL}/**`, async (route: Route) => {
    const req = route.request();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (req.method() === 'POST') {
      const body = req.postDataJSON();
      const own = { rank: 3, name: body.name, score: body.score, distance: body.distance, date: new Date().toISOString() };
      return route.fulfill({ headers, json: { ok: true, stored: true, rank: 3, best: body.score, entries: [...entries.slice(0, 2), own, ...entries.slice(2)] } });
    }
    return route.fulfill({ headers, json: { entries } });
  });
}

async function fakeFeedback(t: PlaytestContext): Promise<void> {
  await t.page.context().addInitScript((url) => ((window as { __feedbackUrl?: string }).__feedbackUrl = url), FAKE);
  await t.page.route(`${FAKE}/**`, async (route: Route) => {
    const headers = { 'Access-Control-Allow-Origin': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const url = new URL(route.request().url());
    if (url.pathname === '/feedback/status') return route.fulfill({ headers, json: { entries: [{ id: 1, status: 'done', reply: 'Thanks, it is in!', doneVersion: '2026-10-12.1' }] } });
    return route.fulfill({ status: 201, headers, json: { ok: true, id: 7 } });
  });
}

/** One report this device sent earlier (shown under "My feedback"). */
const REPORT = {
  id: 1,
  key: '1'.padStart(32, 'a'),
  day: '2026-10-11',
  kind: 'idea',
  text: 'Ein Level im Schlossgarten wäre toll',
  version: '2026-10-11.9',
  platform: 'android',
  input: 'touch',
  orientation: 'landscape',
  viewWidth: 390,
  log: [],
  status: 'open',
  reply: null,
  doneVersion: null,
  seen: JSON.stringify(['open', null, null]),
};

/** Reloads with the given storage (null removes a key) and waits for the title. */
async function reloadWith(t: PlaytestContext, items: Record<string, string | null>, keepRotate = false): Promise<void> {
  await t.page.evaluate((items) => {
    for (const [k, v] of Object.entries(items)) {
      if (v === null) localStorage.removeItem(`cannstatt-cruiser:${k}`);
      else localStorage.setItem(`cannstatt-cruiser:${k}`, v);
    }
  }, items);
  await t.page.reload();
  await t.page.waitForFunction(() => Boolean(window.__game));
  await t.game.pause();
  await t.game.step(2);
  if (!keepRotate) await dismissRotateHint(t);
}

const ui = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.layout());
const fb = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.feedback()) as Promise<FeedbackDebug>;
const hs = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.highscores()) as Promise<HighscoresDebug>;
const lang = (t: PlaytestContext) => t.page.evaluate(() => ({ html: document.documentElement.lang, stored: localStorage.getItem('cannstatt-cruiser:language') }));

async function tap(t: PlaytestContext, r: Rect | null | undefined): Promise<void> {
  if (!r) throw new Error('nothing to tap');
  await t.realTapView(...centre(r));
  await t.game.step(3);
}

/** Both canvas and page: the canvas shot shows the view, the screenshot the DOM sheets. */
async function shots(t: PlaytestContext, label: string): Promise<void> {
  await t.screenshot(label);
  if (!(await t.game.display()).portrait) await t.canvasShot(label);
}

export default async function i18nEnglish(t: PlaytestContext): Promise<void> {
  const { page } = t;
  await fakeScores(t);
  await fakeFeedback(t);
  const portrait = (await t.game.display()).portrait;
  const sheetTitle = async () => page.evaluate(() => [...document.querySelectorAll('[role=dialog]')].filter((d) => (d as HTMLElement).style.display !== 'none').map((d) => d.getAttribute('aria-label')));

  // An English browser with nothing stored starts in English.
  await reloadWith(t, { language: null });
  const browser = await page.evaluate(() => navigator.language);
  const first = await lang(t);
  t.check('first visit follows the browser language, nothing stored', first.html === (browser.toLowerCase().startsWith('en') ? 'en' : 'de') && first.stored === null, { browser, first });

  // German device: the switch on the title, then a real tap on EN.
  await reloadWith(t, { language: '"de"', kidMode: 'false', scoreName: null, feedbackSent: JSON.stringify([REPORT]) });
  let l = await ui(t);
  t.check('title shows the DE | EN switch', !!l.language, l.language);
  await shots(t, 'title german with switch');
  await tap(t, l.language!.en);
  let now = await lang(t);
  t.check('a tap on EN switches to English and stores it', now.html === 'en' && now.stored === '"en"', now);
  t.check('the tap stays on the title (starts no run)', (await t.game.state()).mode === 'title');
  await shots(t, 'title english');

  await reloadWith(t, {});
  now = await lang(t);
  t.check('a reload stays English', now.html === 'en' && now.stored === '"en"', now);

  // A run: popups, a stunt callout, the zone ribbon.
  await t.game.startRun();
  await t.game.step(10);
  await page.evaluate(() => {
    const u = (window as UiWindow).__ui!;
    u.samplePopups();
    u.itemPopups('eat', 'stomp');
    u.stuntStep(2);
  });
  await t.game.step(4);
  await shots(t, 'run with popups');
  await page.evaluate(() => (window as UiWindow).__ui!.carry('pretzel'));
  await t.game.step(30);
  await shots(t, 'run with item hint');

  // Pause.
  await t.game.pauseGame();
  await t.game.step(3);
  await shots(t, 'pause');

  // Game over with a top score: "Add score", then the name entry and the leaderboard.
  await t.game.resumeGame();
  await t.game.setScore(7777);
  await t.game.step(2);
  await t.game.endRun();
  await t.game.step(90);
  await shots(t, 'game over');
  const submit = (await ui(t)).screen?.submit;
  t.check('game over offers Add score', !!submit);
  if (submit) {
    await tap(t, submit);
    t.check('the name entry opens', (await hs(t)).screen === 'entry');
    if (portrait) {
      const titles = await sheetTitle();
      t.check('the portrait entry sheet is English', titles.includes('Add score'), titles);
    }
    await shots(t, 'name entry');
    await page.keyboard.type('Lilli', { delay: 5 });
    await t.game.step(2);
    await shots(t, 'name entry with name');
    await page.keyboard.press('Escape');
    await t.game.step(3);
  }

  // Back on the title: settings (gear), the switch there, install steps.
  await reloadWith(t, {});
  l = await ui(t);
  await tap(t, l.screen?.settings);
  const menu = (await ui(t)).menu;
  await shots(t, 'settings');
  await tap(t, menu.language.de);
  t.check('the settings switch goes back to German', (await lang(t)).html === 'de');
  await shots(t, 'settings german');
  await tap(t, menu.language.en);
  t.check('and to English again', (await lang(t)).html === 'en');
  if (menu.install) {
    await tap(t, menu.install);
    await t.wait(300);
    await t.game.step(3);
    await shots(t, 'install steps');
    await page.keyboard.press('Escape');
    await t.game.step(3);
  }
  await page.keyboard.press('Escape');
  await t.game.step(3);

  // The leaderboard from the title's trophy.
  await tap(t, (await hs(t)).trophy);
  for (let i = 0; i < 20 && (await hs(t)).topState !== 'ready'; i++) {
    await t.wait(50);
    await t.game.step(1);
  }
  t.check('the trophy opens the leaderboard', (await hs(t)).screen === 'list');
  await shots(t, 'leaderboard');
  await tap(t, (await hs(t)).close);

  // Feedback: "New" and "My feedback".
  await tap(t, (await ui(t)).screen?.feedback);
  const opened = await fb(t);
  t.check('feedback opens on New', opened.open && opened.tab === 'new', opened);
  if (portrait) {
    const sheet = page.locator('[role=dialog][aria-label="Feedback"]');
    t.check('the portrait sheet has English tabs', (await sheet.getByRole('button', { name: 'New', exact: true }).isVisible()) && (await sheet.getByRole('button', { name: 'My feedback' }).isVisible()));
    await t.screenshot('feedback new');
    await sheet.getByRole('button', { name: 'My feedback' }).tap();
    await t.game.step(3);
    await t.screenshot('feedback mine');
    await sheet.getByRole('button', { name: /Ein Level/ }).tap();
    await t.game.step(3);
    await t.screenshot('feedback report details');
    await sheet.getByRole('button', { name: 'Back' }).tap();
    await t.game.step(2);
    await sheet.getByRole('button', { name: 'Close' }).tap();
  } else {
    await shots(t, 'feedback new');
    await tap(t, opened.form.mineTab);
    await shots(t, 'feedback mine');
    const rows = (await fb(t)).rowRects;
    if (rows[0]) {
      await tap(t, rows[0]);
      await shots(t, 'feedback report details');
    }
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
  }
  await t.game.step(3);

  // Kid mode title: the switch shows there too.
  await reloadWith(t, { kidMode: 'true' });
  t.check('kid mode title has the switch', !!(await ui(t)).language);
  await shots(t, 'title kid mode');

  // What's new: English lines where an entry has them, else the German items.
  await reloadWith(t, { kidMode: 'false', lastSeenVersion: '"2026-10-11.9"' });
  const news = await page.evaluate(() => (window as UiWindow).__ui!.whatsNew());
  t.check("what's new shows", !!news, news);
  if (portrait) {
    const titles = await sheetTitle();
    t.check("the portrait what's new sheet is English", titles.includes("What's new"), titles);
  }
  await shots(t, 'whats new');

  // Portrait: the rotate screen in English.
  if (portrait) {
    await reloadWith(t, { lastSeenVersion: null }, true);
    const titles = await sheetTitle();
    t.check('the rotate screen is English', titles.includes('Please turn your device'), titles);
    await t.screenshot('rotate screen');
  }
  await reloadWith(t, { language: '"de"' });
  await t.log('end');
}
