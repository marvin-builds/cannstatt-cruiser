/**
 * "Angemeldet bleiben" on the insights board (ROADMAP 74) against a FAKE worker: a route answers
 * every request to the worker URL, so nothing reaches the live worker. Signs in with the box ticked
 * (only the session token goes into localStorage, never the real token), reloads without being asked
 * again, signs out with "Abmelden", and checks that a rejected session (key rotated), an expired one
 * and an unticked sign-in all leave nothing behind.
 *   npm run playtest -- --scenario scripts/scenarios/insights-session.ts --viewports desktop,phone-portrait --name session
 */
import type { Page, Route } from 'playwright';
import { sampleFeedback } from '../../src/insights/sample-feedback';
import { sampleStats } from '../../src/insights/sample-stats';
import { join, type PlaytestContext } from '../playtest-lib';

const API = 'https://cannstatt-cruiser-scores.marvin-builds.workers.dev';
const TOKEN = 'geheim-123';
const SESSION = 'v1.1760799441000.ZmFrZS1zZXNzaW9uLXNpZ25hdHVyZS1mb3ItdGhlLWJvYXJk';
const STORE_KEY = 'cannstatt-cruiser:insightsSession';
const WEEK_MS = 7 * 24 * 3600_000;

/** The kept session (parsed; a dropped one is stored as JSON null) and whether the real token is anywhere in storage or the URL. */
async function storage(page: Page) {
  return page.evaluate(
    ({ key, token }) => ({
      session: JSON.parse(localStorage.getItem(key) ?? 'null') as { token: string; expiresAt: number } | null,
      leak: [localStorage, sessionStorage].some((s) => Object.keys(s).some((k) => (s.getItem(k) ?? '').includes(token))) || location.href.includes(token),
    }),
    { key: STORE_KEY, token: TOKEN },
  );
}

export default async function (t: PlaytestContext) {
  const browser = t.page.context().browser()!;
  const desktop = !t.viewport.touch;
  const context = await browser.newContext({ ...t.viewport.options, ...(desktop ? { viewport: { width: 1280, height: 800 } } : {}), serviceWorkers: 'block' });
  const calls: { method: string; path: string; auth?: string }[] = [];
  /** true: the worker refuses the session (BOARD_SESSION_KEY rotated). */
  let rotated = false;
  await context.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Content-Type': 'application/json',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const auth = req.headers()['authorization'];
    calls.push({ method: req.method(), path: url.pathname, auth });
    const unauthorized = () => route.fulfill({ status: 401, headers, body: '{"ok":false,"error":"unauthorized"}' });
    if (url.pathname === '/board/session' && req.method() === 'POST') {
      if (auth !== `Bearer ${TOKEN}`) return unauthorized();
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ token: SESSION, expiresAt: Date.now() + WEEK_MS }) });
    }
    if (auth !== `Bearer ${TOKEN}` && (auth !== `Bearer ${SESSION}` || rotated)) return unauthorized();
    if (url.pathname === '/stats') return route.fulfill({ status: 200, headers, body: JSON.stringify(sampleStats(7)) });
    if (url.pathname === '/feedback') return route.fulfill({ status: 200, headers, body: JSON.stringify({ entries: sampleFeedback() }) });
    return route.fulfill({ status: 404, headers, body: '{}' });
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  let shot = 100;
  const screenshot = (label: string, fullPage = false) => page.screenshot({ path: join(t.outDir, `${++shot}-session-${label}.png`), fullPage });
  const boardUrl = new URL('insights.html', t.page.url()).href;
  const signIn = async (token: string, remember: boolean) => {
    await page.fill('input[name=token]', token);
    if (remember) await page.check('input[name=remember]');
    await page.click('button[type=submit]');
  };
  const lastStats = () => calls.filter((c) => c.path === '/stats').at(-1);

  try {
    await page.goto(boardUrl);
    await page.waitForSelector('form.lock');
    const box = await page.locator('label.remember').boundingBox();
    t.check('the locked view offers "Angemeldet bleiben", unticked', (await page.isVisible('text=Angemeldet bleiben')) && !(await page.isChecked('input[name=remember]')));
    t.check('the remember row is a comfortable tap target', (box?.height ?? 0) >= 32, box);
    await page.fill('input[name=token]', TOKEN);
    await page.check('input[name=remember]');
    await screenshot('sign-in-remember');
    await page.click('button[type=submit]');
    await page.waitForSelector('.tiles');
    const sessionCall = calls.find((c) => c.path === '/board/session');
    t.check('signing in asks POST /board/session with the real token', sessionCall?.method === 'POST' && sessionCall.auth === `Bearer ${TOKEN}`, sessionCall);
    t.check('the board loads with the session token, not the real one', lastStats()?.auth === `Bearer ${SESSION}`, lastStats());
    const kept = await storage(page);
    t.check('only the session token and its expiry are stored', kept.session?.token === SESSION && Object.keys(kept.session).sort().join() === 'expiresAt,token' && !kept.leak, kept);
    t.check('the board offers "Abmelden"', await page.isVisible('.board-head button:has-text("Abmelden")'));
    await screenshot('board-signed-in');

    const before = calls.length;
    await page.reload();
    await page.waitForSelector('.tiles');
    t.check('after a reload the board opens without asking again', !(await page.isVisible('form.lock')) && lastStats()?.auth === `Bearer ${SESSION}`);
    t.check('the reload made no new session request', !calls.slice(before).some((c) => c.path === '/board/session'));
    await screenshot('board-after-reload');

    await page.click('.board-head button:has-text("Abmelden")');
    await page.waitForSelector('form.lock');
    t.check('Abmelden drops the stored session', (await storage(page)).session === null);
    await screenshot('signed-out');
    await page.reload();
    await page.waitForSelector('form.lock');
    t.check('after Abmelden a reload asks for the token again', await page.isVisible('input[name=token]'));

    await signIn(TOKEN, true);
    await page.waitForSelector('.tiles');
    rotated = true;
    await page.reload();
    await page.waitForSelector('form.lock .banner');
    const ended = (await page.textContent('form.lock .banner'))?.trim();
    t.check('a refused session (key rotated) asks again and drops it', ended === 'Anmeldung abgelaufen. Bitte den Token neu eingeben.' && (await storage(page)).session === null, ended);
    await screenshot('session-ended');
    rotated = false;

    await page.evaluate(({ key, token }) => localStorage.setItem(key, JSON.stringify({ token, expiresAt: Date.now() - 1000 })), { key: STORE_KEY, token: SESSION });
    const beforeExpired = calls.length;
    await page.reload();
    await page.waitForSelector('form.lock');
    t.check('an expired stored session is dropped without asking the worker', calls.length === beforeExpired && (await storage(page)).session === null);

    await signIn(TOKEN, false);
    await page.waitForSelector('.tiles');
    const unticked = await storage(page);
    t.check('unticked: the real token in memory only, nothing stored, "Sperren" as before', unticked.session === null && !unticked.leak && lastStats()?.auth === `Bearer ${TOKEN}` && (await page.isVisible('.board-head button:has-text("Sperren")')), unticked);
    await page.reload();
    await page.waitForSelector('form.lock');
    t.check('unticked: a reload asks for the token again', await page.isVisible('input[name=token]'));
    const width = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    t.check('no horizontal scroll on the locked view', width.scroll <= width.client, width);
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.check('input[name=remember]');
    await screenshot('locked-dark');
    t.check('no page errors', errors.length === 0, errors);
  } finally {
    await context.close();
  }
}
