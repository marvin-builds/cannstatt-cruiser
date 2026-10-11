/**
 * Hidden insights board (insights.html, ROADMAP 46) against a FAKE worker:
 * every request to the live worker is intercepted (a Playwright route), so
 * nothing reaches it. Checks the locked view, the 'Token falsch' state on 401,
 * the board with the bearer header, the range switch, a failed reload, safe
 * rendering of player names, no token in storage or URL, no horizontal
 * scroll, and dark mode. Runs in its own browser context with service workers
 * blocked (the game's worker would otherwise answer navigations).
 *
 *   npm run playtest -- --scenario scripts/scenarios/insights.ts --viewports desktop,phone-portrait --name insights
 */
import type { Page, Route } from 'playwright';
import { sampleStats } from '../../src/insights/sample-stats';
import { STATS_RANGES, type StatsRange } from '../../src/net/telemetry-types';
import { join, type PlaytestContext } from '../playtest-lib';

const API = 'https://cannstatt-cruiser-scores.marvinmai.workers.dev';
const TOKEN = 'geheim-123';

/** Fake GET /stats: 401 for a wrong token, the fixture for the right one, or a network error. */
class FakeStats {
  offline = false;
  requests: { url: string; auth: string | undefined }[] = [];

  async handle(route: Route): Promise<void> {
    const request = route.request();
    this.requests.push({ url: request.url(), auth: request.headers()['authorization'] });
    if (this.offline) return route.abort('internetdisconnected');
    const url = new URL(request.url());
    if (url.pathname !== '/stats') return route.fulfill({ status: 404, body: '' });
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (request.headers()['authorization'] !== `Bearer ${TOKEN}`) {
      return route.fulfill({ status: 401, headers, body: JSON.stringify({ error: 'unauthorized' }) });
    }
    const days = Number(url.searchParams.get('days'));
    const range = (STATS_RANGES.includes(days as StatsRange) ? days : 7) as StatsRange;
    return route.fulfill({ status: 200, headers, body: JSON.stringify(sampleStats(range)) });
  }
}

async function noHorizontalScroll(page: Page): Promise<{ scroll: number; client: number }> {
  return page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
}

export default async function (t: PlaytestContext) {
  const browser = t.page.context().browser()!;
  const desktop = !t.viewport.touch;
  const context = await browser.newContext({
    ...t.viewport.options,
    ...(desktop ? { viewport: { width: 1280, height: 800 } } : {}),
    serviceWorkers: 'block',
  });
  const fake = new FakeStats();
  // Anything else bound for the live worker is refused; nothing leaves the machine.
  await context.route(`${API}/**`, (route) => fake.handle(route));
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  let shot = 100;
  const screenshot = (label: string, fullPage = true) =>
    page.screenshot({ path: join(t.outDir, `${++shot}-insights-${label}.png`), fullPage });

  try {
    await page.goto(new URL('insights.html', t.page.url()).href);
    await page.waitForSelector('form.lock');
    t.check('locked view shows the token field', await page.isVisible('input[type=password][name=token]'));
    const lockedWidth = await noHorizontalScroll(page);
    t.check('no horizontal scroll on the locked view', lockedWidth.scroll <= lockedWidth.client, lockedWidth);
    await screenshot('locked');

    await page.fill('input[name=token]', 'falsch');
    await page.click('button[type=submit]');
    await page.waitForSelector('.banner');
    t.check('401 shows Token falsch and the form', (await page.textContent('.banner'))?.trim() === 'Token falsch' && (await page.isVisible('form.lock')));
    await screenshot('token-falsch');

    await page.fill('input[name=token]', TOKEN);
    await page.click('button[type=submit]');
    await page.waitForSelector('.tiles');
    await page.waitForSelector('.chart');
    const last = fake.requests.at(-1);
    t.check('fetches the live worker /stats?days=7 with the bearer header', last?.url === `${API}/stats?days=7` && last.auth === `Bearer ${TOKEN}`, last);
    const leaks = await page.evaluate(
      (tok) => [localStorage, sessionStorage].some((s) => Object.keys(s).some((k) => (s.getItem(k) ?? '').includes(tok))) || location.href.includes(tok),
      TOKEN,
    );
    t.check('token is not in storage or the URL', !leaks);
    const name = await page.evaluate(() => ({
      text: [...document.querySelectorAll('.top-name')].map((n) => n.textContent),
      tags: document.querySelectorAll('.top b').length,
    }));
    t.check('player names render as text', name.text.includes('<b>Kessel</b>') && name.tags === 0, name);
    const cities = await page.evaluate(() => [...document.querySelectorAll('.ranked li .rank-label')].map((n) => n.textContent));
    t.check('cities ranked with Andere last', cities.includes('Stuttgart') && cities.includes('Esslingen am Neckar') && cities.includes('Andere'), cities);
    const width = await noHorizontalScroll(page);
    t.check('no horizontal scroll on the board', width.scroll <= width.client, width);
    await screenshot('board-7');

    await page.click('.segmented button:has-text("30 T")');
    await page.waitForFunction(() => document.querySelector('.segmented button[aria-pressed=true]')?.textContent === '30 T' && document.querySelector('.board')?.getAttribute('aria-busy') === 'false');
    t.check('range switch asks for 30 days', fake.requests.at(-1)?.url === `${API}/stats?days=30`);
    await screenshot('board-30');

    await page.emulateMedia({ colorScheme: 'dark' });
    await screenshot('board-30-dark');
    await page.click('.segmented button:has-text("90 T")');
    await page.waitForFunction(() => document.querySelector('.board')?.getAttribute('aria-busy') === 'false' && document.querySelector('.segmented button[aria-pressed=true]')?.textContent === '90 T');
    const width90 = await noHorizontalScroll(page);
    t.check('no horizontal scroll at 90 days', width90.scroll <= width90.client, width90);
    await screenshot('board-90-dark', false);

    fake.offline = true;
    await page.click('button:has-text("Neu laden")');
    await page.waitForSelector('.board .banner');
    t.check('a failed reload keeps the board and shows a retry note', (await page.textContent('.board .banner'))?.includes('Keine Verbindung') === true);
    await screenshot('reload-offline-dark', false);

    await page.click('button:has-text("Sperren")');
    await page.waitForSelector('form.lock');
    fake.offline = true;
    await page.fill('input[name=token]', TOKEN);
    await page.click('button[type=submit]');
    await page.waitForSelector('.banner button');
    await screenshot('locked-offline-dark');
    fake.offline = false;
    await page.click('.banner button');
    await page.waitForSelector('.tiles');
    t.check('retry after a network error opens the board with the token in memory', true);
    t.check('no page errors on the insights page', errors.length === 0, errors);
  } finally {
    await context.close();
  }
}
