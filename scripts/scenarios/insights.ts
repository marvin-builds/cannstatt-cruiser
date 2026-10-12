/**
 * Hidden insights board (insights.html, ROADMAP 46) against a FAKE worker:
 * every request to the live worker is intercepted (a Playwright route), so
 * nothing reaches it. Checks the locked view, the 'Token falsch' state on 401,
 * the board with the bearer header, the range switch incl. 365 T and Alles
 * (500-day fixture; weeks / months, approximate median), readable bars, a
 * failed reload, safe rendering of player names, no token in storage or URL,
 * no horizontal scroll, and light and dark mode. The Feedback card (ROADMAP 50)
 * gets a fake GET /feedback: newest first, kind badges, a long wrapping text,
 * markup shown as text, an expandable error log, the filter, the empty list
 * and a 404 from an older worker (stats still render). Runs in its own browser context with service workers
 * blocked (the game's worker would otherwise answer navigations).
 *
 *   npm run playtest -- --scenario scripts/scenarios/insights.ts --viewports desktop,phone-portrait --name insights
 */
import type { Page, Route } from 'playwright';
import { sampleFeedback } from '../../src/insights/sample-feedback';
import { sampleStats } from '../../src/insights/sample-stats';
import { ALL_RANGE, STATS_RANGES, type StatsRange } from '../../src/net/telemetry-types';
import { join, type PlaytestContext } from '../playtest-lib';

const API = 'https://cannstatt-cruiser-scores.marvinmai.workers.dev';
const TOKEN = 'geheim-123';

/** Fake GET /stats and /feedback: 401 for a wrong token, the fixtures for the right one, or a network error. */
class FakeStats {
  offline = false;
  /** 'list': the sample entries, 'empty': no entries, a number: that status (404 = older worker). */
  feedback: 'list' | 'empty' | number = 'list';
  requests: { url: string; auth: string | undefined }[] = [];

  lastStats() {
    return this.requests.filter((r) => r.url.includes('/stats')).at(-1);
  }

  async handle(route: Route): Promise<void> {
    const request = route.request();
    this.requests.push({ url: request.url(), auth: request.headers()['authorization'] });
    if (this.offline) return route.abort('internetdisconnected');
    const url = new URL(request.url());
    if (url.pathname !== '/stats' && url.pathname !== '/feedback') return route.fulfill({ status: 404, body: '' });
    const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
    if (request.headers()['authorization'] !== `Bearer ${TOKEN}`) {
      return route.fulfill({ status: 401, headers, body: JSON.stringify({ error: 'unauthorized' }) });
    }
    if (url.pathname === '/feedback') {
      if (typeof this.feedback === 'number') return route.fulfill({ status: this.feedback, headers, body: JSON.stringify({ error: 'not found' }) });
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ entries: this.feedback === 'list' ? sampleFeedback() : [] }) });
    }
    const days = Number(url.searchParams.get('days'));
    const range = (url.searchParams.has('days') && STATS_RANGES.includes(days as StatsRange) ? days : 7) as StatsRange;
    return route.fulfill({ status: 200, headers, body: JSON.stringify(sampleStats(range)) });
  }
}

/** What the board shows after a range switch: chart heading, thinnest bar, axis labels, tiles. */
async function chartState(page: Page) {
  return page.evaluate(() => {
    const bars = [...document.querySelectorAll<SVGGraphicsElement>('.chart .bar')].map((b) => b.getBBox().width);
    return {
      heading: document.querySelector('.card h2')?.textContent ?? '',
      minBar: bars.length ? Math.min(...bars) : 0,
      labels: [...document.querySelectorAll('.chart .slot text.axis')].map((t) => t.textContent),
      tiles: [...document.querySelectorAll('.tile')].map((t) => t.textContent),
    };
  });
}

async function pickRange(page: Page, label: string): Promise<void> {
  await page.click(`.segmented button:has-text("${label}")`);
  await page.waitForFunction(
    (text) => document.querySelector('.segmented button[aria-pressed=true]')?.textContent === text && document.querySelector('.board')?.getAttribute('aria-busy') === 'false',
    label,
  );
}

/** The Feedback card as the owner reads it. */
async function feedbackState(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector<HTMLElement>('.card.feedback');
    const items = [...document.querySelectorAll<HTMLElement>('.fb-item')];
    return {
      count: card?.querySelector('.fb-count')?.textContent ?? '',
      note: card?.querySelector('.empty-note')?.textContent ?? '',
      kinds: items.map((i) => i.querySelector('.fb-kind')?.textContent),
      days: items.map((i) => i.querySelector('time')?.textContent),
      texts: items.map((i) => i.querySelector('.fb-text')?.textContent ?? ''),
      meta: items[0]?.querySelector('.fb-meta')?.textContent ?? '',
      scripts: card?.querySelectorAll('script').length ?? -1,
      overflow: items.some((i) => i.scrollWidth > i.clientWidth + 1),
      logs: [...document.querySelectorAll('.fb-log summary')].map((n) => n.textContent),
    };
  });
}

async function reload(page: Page): Promise<void> {
  await page.click('button:has-text("Neu laden")');
  await page.waitForFunction(() => document.querySelector('.board')?.getAttribute('aria-busy') === 'false');
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
    const last = fake.lastStats();
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
    const splits = await page.evaluate(() => [...document.querySelectorAll('.split h3')].map((n) => n.textContent));
    t.check('device splits without Hoch/Quer (ROADMAP 69)', splits.join() === 'Eingabe,System,Modus', splits);
    const width = await noHorizontalScroll(page);
    t.check('no horizontal scroll on the board', width.scroll <= width.client, width);
    await screenshot('board-7');

    // The feedback card lives on the Feedback tab (ROADMAP 79); all status chips on to see every entry (ROADMAP 80).
    await page.click('#tab-feedback');
    await page.click('.chip:has-text("Erledigt")');
    await page.click('.chip:has-text("Abgelehnt")');
    const fb = await feedbackState(page);
    t.check('feedback asked with the bearer header', fake.requests.some((r) => r.url === `${API}/feedback` && r.auth === `Bearer ${TOKEN}`));
    t.check('feedback newest first with day and kind badge', fb.days.join() === '11.10.2026,11.10.2026,10.10.2026,8.10.2026,7.10.2026,6.10.2026,5.10.2026,4.10.2026' &&
      fb.kinds.join() === 'Idee,Fehler,Fehler,Idee,Idee,Fehler,Idee,Fehler', fb);
    t.check('feedback meta line and count', fb.meta === 'Version 2026-10-11.4 · Android · Touch · Hoch · 390 px' && fb.count === '8 Einträge', fb);
    t.check('feedback markup shows as text', fb.texts.some((x) => x.startsWith('<script>')) && fb.scripts === 0, fb.texts);
    t.check('feedback keeps line breaks and long words wrap', fb.texts[0]!.includes('\n') && !fb.overflow, fb);
    t.check('a bug with log offers the closed Fehlerprotokoll', fb.logs.join() === 'Fehlerprotokoll (4 Zeilen)' && !(await page.isVisible('.fb-log pre')), fb.logs);
    await page.click('.fb-log summary');
    t.check('the log opens in a monospace block', await page.isVisible('.fb-log pre'));
    const card = page.locator('.card.feedback');
    await card.screenshot({ path: join(t.outDir, `${++shot}-insights-feedback.png`) });
    await page.emulateMedia({ colorScheme: 'dark' });
    await card.screenshot({ path: join(t.outDir, `${++shot}-insights-feedback-dark.png`) });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.click('.card.feedback button:has-text("Fehler")');
    const bugs = await feedbackState(page);
    t.check('filter Fehler shows only bug reports', bugs.kinds.join() === 'Fehler,Fehler,Fehler,Fehler' && bugs.count === '4 Einträge', bugs);
    await page.click('.card.feedback button:has-text("Ideen")');
    const ideas = await feedbackState(page);
    t.check('filter Ideen shows only ideas', ideas.kinds.join() === 'Idee,Idee,Idee,Idee' && ideas.count === '4 Einträge', ideas);
    await card.screenshot({ path: join(t.outDir, `${++shot}-insights-feedback-ideen.png`) });
    await page.click('.card.feedback button:has-text("Alle")');
    await page.click('#tab-stats');

    const ranges: { label: string; days: StatsRange; heading: string; approx: boolean }[] = [
      { label: '30 T', days: 30, heading: desktop ? 'pro Tag' : 'pro Woche', approx: false },
      { label: '365 T', days: 365, heading: desktop ? 'pro Woche' : 'pro Monat', approx: true },
      { label: 'Alles', days: ALL_RANGE, heading: 'pro Monat', approx: true },
    ];
    for (const r of ranges) {
      await page.emulateMedia({ colorScheme: 'light' });
      await pickRange(page, r.label);
      t.check(`range ${r.label} asks for days=${r.days}`, fake.lastStats()?.url === `${API}/stats?days=${r.days}`, fake.lastStats());
      const state = await chartState(page);
      t.check(`${r.label}: chart groups ${r.heading}`, state.heading.endsWith(r.heading), state.heading);
      t.check(`${r.label}: bars are readable (>= 3 px) with axis labels`, state.minBar >= 3 && state.labels.length >= 3, state);
      const median = state.tiles.find((text) => text?.includes('Median')) ?? '';
      t.check(`${r.label}: median ${r.approx ? 'marked approximate' : 'exact'}`, median.includes('≈') === r.approx && median.includes('Tageswerten') === r.approx, median);
      if (r.days === ALL_RANGE) t.check('Alles names its first day', state.tiles.some((text) => text?.includes('seit 30.5.2025')), state.tiles);
      const w = await noHorizontalScroll(page);
      t.check(`no horizontal scroll at ${r.label}`, w.scroll <= w.client, w);
      const slug = r.days === ALL_RANGE ? 'alles' : String(r.days);
      await screenshot(`board-${slug}`);
      await page.emulateMedia({ colorScheme: 'dark' });
      await screenshot(`board-${slug}-dark`);
    }

    await pickRange(page, '90 T');
    const width90 = await noHorizontalScroll(page);
    t.check('no horizontal scroll at 90 days', width90.scroll <= width90.client, width90);
    await screenshot('board-90-dark', false);

    fake.offline = true;
    await page.click('button:has-text("Neu laden")');
    await page.waitForSelector('.board .banner');
    t.check('a failed reload keeps the board and shows a retry note', (await page.textContent('.board .banner'))?.includes('Keine Verbindung') === true);
    await screenshot('reload-offline-dark', false);
    fake.offline = false;

    fake.feedback = 'empty';
    await reload(page);
    const empty = await feedbackState(page);
    t.check('an empty feedback list shows Noch kein Feedback', empty.note === 'Noch kein Feedback' && empty.count === '0 Einträge', empty);
    await page.click('#tab-feedback');
    await card.screenshot({ path: join(t.outDir, `${++shot}-insights-feedback-empty-dark.png`) });

    fake.feedback = 404;
    await reload(page);
    const missing = await feedbackState(page);
    const statsShown = (await page.locator('.tile').count()) === 4 && !(await page.isVisible('.board .banner'));
    t.check('a 404 on /feedback shows a short note and the stats still render', missing.note === 'Feedback gerade nicht abrufbar' && statsShown, missing);
    await page.emulateMedia({ colorScheme: 'light' });
    await screenshot('feedback-404');
    await page.click('#tab-stats');
    t.check('the stats still render under the Statistik tab', (await page.locator('.tile').count()) === 4);
    fake.feedback = 'list';

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
