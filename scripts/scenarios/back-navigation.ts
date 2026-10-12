/**
 * Android back (ROADMAP 75) through the browser's real back navigation
 * (page.goBack(), as the back button or gesture does in the installed app):
 * while a dialog, sheet, menu screen or run is open the game keeps exactly
 * one extra history entry and goes one level back on each press; on the
 * title there is none, so back may leave the app. Feedback goes to a FAKE
 * endpoint (window.__feedbackUrl, intercepted) and the online list is a
 * Playwright route: nothing reaches the live worker.
 *
 * - Feedback: a report's details -> "Mein Feedback" -> closed -> the title.
 * - A run: back pauses, back again keeps the pause screen; the feedback dialog
 *   over the pause screen closes back to it; "Zum Startbildschirm" drops the
 *   entry.
 * - Settings -> title; game over -> title; the title keeps no entry, so back there
 * may leave the app (not pressed here: it would leave the page).
 * - The history never grows by more than the one entry.
 *
 *   npm run playtest -- --scenario scripts/scenarios/back-navigation.ts --viewports desktop,phone-landscape,phone-portrait --name back-navigation
 */
import type { Route } from 'playwright';
import { SCORES_URL } from '../../src/net/api';
import type { Rect } from '../../src/types';
import type { FeedbackDebug, UiDebugHook } from '../../src/ui/debug';
import { adultMode, dismissRotateHint, type PlaytestContext } from '../playtest-lib';

const FAKE = 'https://feedback.example.test';
const SHEET = '[role=dialog][aria-label="Feedback"]';
type UiWindow = Window & { __ui?: UiDebugHook };
const mid = (r: Rect) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)] as const;

/** One report this device sent earlier (feedback-reports.ts KeptReport). */
const REPORT = {
  id: 7,
  key: 'a'.repeat(32),
  day: '2026-10-10',
  kind: 'bug',
  text: 'Der Skater bleibt an der Bank hängen',
  version: '2026-10-09.2',
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

export default async function backNavigation(t: PlaytestContext): Promise<void> {
  const { page } = t;
  await page.context().addInitScript((url) => ((window as { __feedbackUrl?: string }).__feedbackUrl = url), FAKE);
  await page.route(`${FAKE}/**`, async (route: Route) => {
    const headers = { 'Access-Control-Allow-Origin': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    return route.fulfill({ headers, json: { entries: [{ id: 7, status: 'open', reply: null, doneVersion: null }] } });
  });
  await page.route(`${SCORES_URL}/**`, (route) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
    return route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers }) : route.fulfill({ headers, json: { entries: [] } });
  });
  await page.evaluate((r) => localStorage.setItem('cannstatt-cruiser:feedbackSent', JSON.stringify([r])), REPORT);
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__game));
  await t.game.pause();
  await dismissRotateHint(t);
  await adultMode(t);
  await t.game.step(3);
  const { portrait } = await t.game.display();

  const fb = () => page.evaluate(() => (window as UiWindow).__ui!.feedback()) as Promise<FeedbackDebug>;
  const screen = () => page.evaluate(() => (window as UiWindow).__ui!.layout().screen);
  const mode = async () => (await t.game.state()).mode;
  const tap = async (r: Rect | null | undefined) => {
    if (!r) return;
    await t.realTapView(...mid(r));
    await t.game.step(3);
  };
  /** The history as the game left it: its length and whether the current entry is the game's extra one. */
  const stack = () => page.evaluate(() => ({ length: history.length, ours: (history.state as Record<string, boolean> | null)?.['cannstatt-cruiser:back'] === true }));
  const base = (await stack()).length;
  /** The back button or gesture; popstate is handled at once, the next ticks push the entry again. */
  const back = async () => {
    await page.goBack({ waitUntil: 'commit', timeout: 3000 }).catch(() => null);
    await t.wait(50);
    await t.game.step(3);
  };
  t.check('title: no extra history entry', !(await stack()).ours, await stack());

  // The feedback dialog: details -> list -> closed.
  await tap((await screen())?.feedback);
  t.check('feedback open: one extra entry', (await fb()).open && (await stack()).ours && (await stack()).length === base + 1, await stack());
  if (portrait) await page.locator(SHEET).getByRole('button', { name: /^Mein Feedback/ }).tap();
  else await tap((await fb()).form.mineTab);
  await t.game.step(3);
  if (portrait) await page.locator(SHEET).getByRole('button', { name: /Offen/ }).tap();
  else await tap((await fb()).rowRects[0]);
  await t.game.step(3);
  t.check('a report\'s details show', (await fb()).page === 'detail', (await fb()).page);
  await t.screenshot('feedback details before back');
  await back();
  t.check('back: details -> Mein Feedback', (await fb()).open && (await fb()).page === 'list', (await fb()).page);
  await t.screenshot('back to the list');
  await back();
  t.check('back: the dialog closes, the title shows', !(await fb()).open && (await mode()) === 'title');
  t.check('title again: the entry is gone, the stack did not grow', !(await stack()).ours && (await stack()).length <= base + 1, await stack());

  // A run: back pauses and keeps the pause screen.
  await t.game.startRun();
  await t.game.step(20);
  t.check('riding: one extra entry', (await stack()).ours, await stack());
  await back();
  t.check('back during a run pauses it', (await mode()) === 'paused');
  await back();
  t.check('back on the pause screen keeps it', (await mode()) === 'paused' && (await stack()).ours, await stack());
  await t.screenshot('paused by back');
  await tap((await screen())?.feedback);
  t.check('feedback over the pause screen', (await fb()).open);
  await back();
  t.check('back closes the dialog to the pause screen', !(await fb()).open && (await mode()) === 'paused');
  await tap((await screen())?.toTitle);
  await t.wait(100);
  await t.game.step(3);
  t.check('"Zum Startbildschirm" drops the entry', (await mode()) === 'title' && !(await stack()).ours && (await stack()).length <= base + 1, await stack());

  // Settings -> title (the gear on the title).
  await tap((await screen())?.settings);
  t.check('settings open', (await page.evaluate(() => (window as UiWindow).__ui!.settings().screen)) === 'menu');
  await back();
  t.check('back closes the settings to the title', (await page.evaluate(() => (window as UiWindow).__ui!.settings().screen)) === 'closed' && (await mode()) === 'title');

  // Game over -> title.
  await t.game.startRun();
  await t.game.step(20);
  await t.game.endRun();
  await t.game.step(60);
  t.check('game over', (await mode()) === 'gameover');
  await back();
  t.check('back on game over goes to the title', (await mode()) === 'title');
  await t.wait(100);
  await t.game.step(3);
  t.check('the stack never grew past one extra entry', (await stack()).length <= base + 1 && !(await stack()).ours, await stack());
  await t.canvasShot('title after back from game over');
  await t.log('history', { base, now: await stack() });
}
