/**
 * The tester pass on the insights board (ROADMAP 75) against a FAKE worker: a route answers every request to
 * the worker URL, so nothing reaches the live worker. The first unlock marks the device and stores a pass
 * under `cannstatt-cruiser:testerPass` (plain JSON string, as the game reads it); switching
 * 'Dieses Gerät ist ein Testgerät' off drops it, on fetches a new one, and a worker without
 * BOARD_SESSION_KEY (503) leaves a note and no pass.
 *   npm run playtest -- --scenario scripts/scenarios/insights-tester-pass.ts --viewports desktop,phone-portrait --name tester-pass
 */
import type { Page, Route } from 'playwright';
import { sampleFeedback } from '../../src/insights/sample-feedback';
import { sampleStats } from '../../src/insights/sample-stats';
import { join, type PlaytestContext } from '../playtest-lib';

const API = 'https://cannstatt-cruiser-scores.marvin-builds.workers.dev';
const TOKEN = 'geheim-123';
const PASS_KEY = 'cannstatt-cruiser:testerPass';
const MARKER_KEY = 'cannstatt-cruiser:testDevice';
const DAY_MS = 24 * 3600_000;

/** The raw stored pass and marker, and whether the real token is anywhere in storage. */
function storage(page: Page) {
  return page.evaluate(
    ({ pass, marker, token }) => ({
      pass: localStorage.getItem(pass),
      marker: localStorage.getItem(marker),
      leak: Object.keys(localStorage).some((k) => (localStorage.getItem(k) ?? '').includes(token)),
    }),
    { pass: PASS_KEY, marker: MARKER_KEY, token: TOKEN },
  );
}

export default async function (t: PlaytestContext) {
  const browser = t.page.context().browser()!;
  const desktop = !t.viewport.touch;
  const context = await browser.newContext({ ...t.viewport.options, ...(desktop ? { viewport: { width: 1280, height: 800 } } : {}), serviceWorkers: 'block' });
  const passCalls: string[] = [];
  /** true: the worker has no BOARD_SESSION_KEY and answers 503. */
  let keyMissing = false;
  let issued = 0;
  await context.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Content-Type': 'application/json',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (req.headers()['authorization'] !== `Bearer ${TOKEN}`) return route.fulfill({ status: 401, headers, body: '{"ok":false,"error":"unauthorized"}' });
    if (url.pathname === '/board/tester-pass' && req.method() === 'POST') {
      passCalls.push(url.pathname);
      if (keyMissing) return route.fulfill({ status: 503, headers, body: '{"ok":false,"error":"session-key-missing"}' });
      const expiresAt = Date.now() + 180 * DAY_MS;
      const pass = `tester.v1.${expiresAt}.ZmFrZS10ZXN0ZXItcGFzcy1zaWduYXR1cmUtbnVtYmVyLT${++issued}`;
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ pass, scope: 'tester', expiresAt }) });
    }
    if (url.pathname === '/stats') return route.fulfill({ status: 200, headers, body: JSON.stringify(sampleStats(7)) });
    if (url.pathname === '/feedback') return route.fulfill({ status: 200, headers, body: JSON.stringify({ entries: sampleFeedback() }) });
    return route.fulfill({ status: 404, headers, body: '{}' });
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  let shot = 400;
  const switches = page.locator('.switches');
  const note = page.locator('#tester-pass-note');
  const toggle = page.locator('label[for="switch-test-device"]');
  const fullShot = (label: string) => page.screenshot({ path: join(t.outDir, `${++shot}-tester-pass-${label}.png`) });
  try {
    await page.goto(new URL('insights.html', t.page.url()).href);
    await page.fill('input[name=token]', TOKEN);
    await page.click('button[type=submit]');
    await note.filter({ hasText: 'Feedback ohne Tageslimit' }).waitFor();
    let stored = await storage(page);
    t.check('first unlock marks the device and fetches one pass', stored.marker === 'true' && passCalls.length === 1, { stored, passCalls });
    t.check('the pass is stored as a plain JSON string under the game key', JSON.parse(stored.pass ?? 'null')?.startsWith('tester.v1.'), stored);
    t.check('the note names the expiry', /^Feedback ohne Tageslimit bis \d{1,2}\.\d{1,2}\.\d{4}$/.test((await note.textContent()) ?? ''), await note.textContent());
    t.check('the real token is never stored', !stored.leak);
    t.check('switches row without horizontal scroll', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
    await fullShot('unlocked');
    await switches.screenshot({ path: join(t.outDir, `${++shot}-tester-pass-switch-on.png`) });

    await toggle.click();
    await note.waitFor({ state: 'hidden' });
    stored = await storage(page);
    t.check('switching off drops the pass without asking the worker', stored.marker === 'false' && stored.pass === 'null' && passCalls.length === 1, { stored, passCalls });
    await switches.screenshot({ path: join(t.outDir, `${++shot}-tester-pass-switch-off.png`) });

    await toggle.click();
    await note.filter({ hasText: 'Feedback ohne Tageslimit' }).waitFor();
    stored = await storage(page);
    t.check('switching on again stores a new pass', stored.marker === 'true' && passCalls.length === 2 && (stored.pass ?? '').endsWith('2"'), { stored, passCalls });

    keyMissing = true;
    await toggle.click();
    await note.waitFor({ state: 'hidden' });
    await toggle.click();
    await note.filter({ hasText: 'nicht abrufbar' }).waitFor();
    stored = await storage(page);
    t.check('without the key the board says so and keeps no pass', stored.marker === 'true' && stored.pass === 'null', stored);
    await switches.screenshot({ path: join(t.outDir, `${++shot}-tester-pass-key-missing.png`) });

    keyMissing = false;
    await page.click('button:has-text("Sperren")');
    await page.fill('input[name=token]', TOKEN);
    await page.click('button[type=submit]');
    await note.filter({ hasText: 'Feedback ohne Tageslimit' }).waitFor();
    t.check('unlocking a marked device refreshes the pass', passCalls.length === 4 && (await storage(page)).pass !== 'null', passCalls);
    await page.emulateMedia({ colorScheme: 'dark' });
    await switches.screenshot({ path: join(t.outDir, `${++shot}-tester-pass-dark.png`) });
    t.check('no page errors', errors.length === 0, errors);
  } finally {
    await context.close();
  }
}
