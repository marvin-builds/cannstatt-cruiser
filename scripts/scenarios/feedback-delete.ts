/**
 * Feedback ticket #6 (ROADMAP 77, 78) against a FAKE endpoint: the base URL is
 * injected (window.__feedbackUrl) and every feedback request is a Playwright
 * route; the online list is routed too, nothing reaches the live worker.
 *
 * - Turns (phones only): on every sheet of the dialog ("Neu", "Mein Feedback",
 *   a report's details, "Das wurde gesendet", "Wirklich löschen?" and the list
 *   with the thanks after sending) the viewport turns portrait -> landscape ->
 *   portrait; each step shows the same page, as the portrait sheet or on the
 *   canvas, with a screenshot of each. (The installed app's orientation lock,
 *   the cause of the bug, is covered by the unit tests: a browser tab holds none.)
 * - Delete: "Löschen" on a report's details asks "Wirklich löschen?"; back
 *   (the browser's back, as Android's back button) and on desktop Esc close the
 *   confirm first; the first "Ja, löschen" gets a 500 (the report stays, the
 *   confirm says so), the next one a 204: the list shows "Feedback gelöscht"
 *   without it. The POST body is exactly {id, key} of the kept report.
 *
 *   npm run playtest -- --scenario scripts/scenarios/feedback-delete.ts --viewports desktop,phone-landscape,phone-portrait --name feedback-delete
 */
import type { Route } from 'playwright';
import { SCORES_URL } from '../../src/net/api';
import type { Rect } from '../../src/types';
import type { FeedbackDebug, UiDebugHook } from '../../src/ui/debug';
import { adultMode, dismissRotateHint, type PlaytestContext } from '../playtest-lib';

type UiWindow = Window & { __ui?: UiDebugHook };

const FAKE = 'https://feedback.example.test';
const SHEET = '[role=dialog][aria-label="Feedback"]';
const keyOf = (id: number) => `${id}`.padStart(32, 'b');
const mid = (r: Rect) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)] as const;
const LANDSCAPE = { width: 844, height: 390 };
const PORTRAIT = { width: 390, height: 844 };

/** Two reports this device sent earlier, oldest first (feedback-reports.ts KeptReport). */
function seed(): unknown[] {
  return ['Die Musik ist nach der Pause weg', 'Mehr Brezeln auf der Strecke bitte!'].map((text, i) => ({
    id: i + 3,
    key: keyOf(i + 3),
    day: `2026-10-1${i}`,
    kind: i ? 'idea' : 'bug',
    text,
    version: '2026-10-12.2',
    platform: 'android',
    input: 'touch',
    orientation: 'landscape',
    viewWidth: 390,
    log: i ? [] : ['error: boom (index.js:12)', 'state: mode playing, version 2026-10-12.2, view 390x180'],
    status: 'open',
    reply: null,
    doneVersion: null,
    seen: JSON.stringify(['open', null, null]),
  }));
}

export default async function feedbackDelete(t: PlaytestContext): Promise<void> {
  const { page } = t;
  const deletes: unknown[] = [];
  let failNextDelete = true;
  await page.context().addInitScript((url) => ((window as { __feedbackUrl?: string }).__feedbackUrl = url), FAKE);
  await page.route(`${FAKE}/**`, async (route: Route) => {
    const req = route.request();
    const headers = { 'Access-Control-Allow-Origin': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const path = new URL(req.url()).pathname;
    const body = JSON.parse(req.postData() ?? 'null');
    if (path === '/feedback/status') {
      const entries = (body.items as { id: number }[]).map(({ id }) => ({ id, status: 'open', reply: null, doneVersion: null }));
      return route.fulfill({ status: 200, headers, json: { entries } });
    }
    if (path === '/feedback/delete') {
      deletes.push(body);
      const status = failNextDelete ? 500 : 204;
      failNextDelete = false;
      return route.fulfill({ status, headers });
    }
    return route.fulfill({ status: 201, headers, json: { ok: true, id: 40 } });
  });
  await page.route(`${SCORES_URL}/**`, (route) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
    return route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers }) : route.fulfill({ headers, json: { entries: [] } });
  });

  const fb = () => page.evaluate(() => (window as UiWindow).__ui!.feedback()) as Promise<FeedbackDebug>;
  const screen = () => page.evaluate(() => (window as UiWindow).__ui!.layout().screen);
  const sheet = page.locator(SHEET);
  const sheetButton = (name: string | RegExp) => sheet.getByRole('button', { name, exact: typeof name === 'string' });
  const portrait = async () => (await t.game.display()).portrait;
  const tap = async (r: Rect | null | undefined) => {
    if (!r) return;
    await t.realTapView(...mid(r));
    await t.game.step(3);
  };
  /** A button of the open page: on the sheet by its name, on the canvas by its rect. */
  const press = async (sheetName: string | RegExp, rect: (s: FeedbackDebug) => Rect | null | undefined) => {
    if (await portrait()) await sheetButton(sheetName).tap();
    else await tap(rect(await fb()));
    await t.game.step(3);
  };
  const back = async () => {
    await page.goBack({ waitUntil: 'commit', timeout: 3000 }).catch(() => null);
    await t.wait(50);
    await t.game.step(3);
  };

  async function freshTitle(): Promise<void> {
    await page.evaluate((reports) => {
      localStorage.setItem('cannstatt-cruiser:feedbackSent', JSON.stringify(reports));
      localStorage.removeItem('cannstatt-cruiser:feedbackCheckedAt');
    }, seed());
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__game));
    await t.game.pause();
    await dismissRotateHint(t);
    await adultMode(t);
    await t.game.step(3);
  }

  /** Turns portrait -> landscape -> portrait on the open page: the same page each time, as the sheet or on the canvas. */
  async function turn(label: string): Promise<void> {
    const before = await fb();
    for (const [i, size] of [PORTRAIT, LANDSCAPE, PORTRAIT].entries()) {
      await page.setViewportSize(size);
      await t.wait(150);
      await t.game.step(4);
      const now = await fb();
      const upright = size === PORTRAIT;
      const sheetShown = await sheet.isVisible();
      const step = ['portrait', 'landscape', 'portrait again'][i];
      t.check(`turn ${label}: ${step} keeps the page`, now.open && now.page === before.page && now.tab === before.tab && now.listNote === before.listNote, { before: before.page, now: now.page });
      t.check(`turn ${label}: ${step} shows ${upright ? 'the sheet' : 'the canvas page'}`, (await portrait()) === upright && sheetShown === upright, { upright, sheetShown });
      await t.screenshot(`turn ${label} ${step}`);
    }
  }

  if (t.viewport.touch) {
    await page.setViewportSize(PORTRAIT);
    await freshTitle();
    await tap((await screen())?.feedback);
    await turn('neu');
    await press(/^Mein Feedback/, (s) => s.form.mineTab);
    await turn('mein feedback');
    await press(/Offen.*Idee/s, (s) => s.rowRects[0]);
    await turn('details');
    await press('Ansehen', (s) => s.pageLayout?.view);
    await turn('das wurde gesendet');
    await press('Zurück', (s) => s.pageLayout?.back);
    await press('Löschen', (s) => s.pageLayout?.del);
    await turn('wirklich loeschen');
    await press('Abbrechen', (s) => s.pageLayout?.no);
    await press('Zurück', (s) => s.pageLayout?.back);
    await press(/^Neu/, (s) => s.pageLayout?.newTab);
    await sheet.locator('textarea').tap();
    await page.keyboard.type('Nach dem Grind hängt das Bild kurz', { delay: 5 });
    await t.game.step(2);
    await press('Senden', () => null);
    await page.waitForFunction(() => (window as UiWindow).__ui!.feedback()!.status !== 'sending', undefined, { timeout: 8000 }).catch(() => {});
    await t.game.step(3);
    t.check('turn: sent, the list thanks the player', (await fb()).thanks && (await fb()).page === 'list');
    await turn('danke');
    await press('Schließen', (s) => s.pageLayout?.close);
    await page.setViewportSize(t.viewport.options.viewport!);
    await t.wait(150);
  }

  // Delete one report: confirm, back closes the confirm first, a refused try keeps it, then it is gone.
  failNextDelete = true;
  await freshTitle();
  await tap((await screen())?.feedback);
  await press(/^Mein Feedback/, (s) => s.form.mineTab);
  await press(/Offen.*Fehler/s, (s) => s.rowRects[1]);
  let state = await fb();
  t.check('delete: the details of the bug report show "Löschen"', state.page === 'detail' && state.detail?.text === 'Die Musik ist nach der Pause weg' && ((await portrait()) ? await sheetButton('Löschen').isVisible() : !!state.pageLayout?.del), state.pageLayout);
  await t.screenshot('delete details with loeschen');
  if (!(await portrait())) await t.canvasShot('delete details with loeschen');
  await press('Löschen', (s) => s.pageLayout?.del);
  state = await fb();
  t.check('delete: "Wirklich löschen?" asks first, nothing sent yet', state.page === 'confirm' && deletes.length === 0, state.page);
  await t.screenshot('delete confirm');
  if (!(await portrait())) await t.canvasShot('delete confirm');
  await back();
  state = await fb();
  t.check('delete: back closes the confirm first (the details show)', state.open && state.page === 'detail', state.page);
  if (!t.viewport.touch) {
    await press('Löschen', (s) => s.pageLayout?.del);
    await page.keyboard.press('Escape');
    await t.game.step(3);
    t.check('delete: Esc closes the confirm too', (await fb()).page === 'detail', (await fb()).page);
  }
  await press('Löschen', (s) => s.pageLayout?.del);
  await press('Ja, löschen', (s) => s.pageLayout?.yes);
  await page.waitForFunction(() => (window as UiWindow).__ui!.feedback()!.deleteState !== 'deleting', undefined, { timeout: 8000 }).catch(() => {});
  await t.game.step(3);
  state = await fb();
  t.check('delete: a refused try keeps the report and says so', state.page === 'confirm' && state.deleteMessage === 'Ging leider nicht. Später nochmal.' && deletes.length === 1, state.deleteMessage);
  await t.screenshot('delete refused');
  if (!(await portrait())) await t.canvasShot('delete refused');
  await press('Ja, löschen', (s) => s.pageLayout?.yes);
  await page.waitForFunction(() => (window as UiWindow).__ui!.feedback()!.deleteState !== 'deleting', undefined, { timeout: 8000 }).catch(() => {});
  await t.game.step(3);
  state = await fb();
  t.check('delete: POST /feedback/delete got exactly {id, key}', JSON.stringify(deletes.at(-1)) === JSON.stringify({ id: 3, key: keyOf(3) }), deletes);
  t.check('delete: the list says "Feedback gelöscht" without the report', state.page === 'list' && state.listNote === 'Feedback gelöscht' && JSON.stringify(state.rows.map((r) => r.id)) === '[4]', state.rows);
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('cannstatt-cruiser:feedbackSent') ?? '[]').map((r: { id: number }) => r.id));
  t.check('delete: gone from the device too', JSON.stringify(kept) === '[4]', kept);
  await t.screenshot('delete done list');
  if (!(await portrait())) await t.canvasShot('delete done list');
  await t.log('feedback delete requests', { deletes });
}
