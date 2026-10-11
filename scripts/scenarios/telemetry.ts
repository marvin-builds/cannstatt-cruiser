/**
 * Anonymous statistics (ROADMAP 46) end to end against a FAKE endpoint: the
 * base URL is injected (window.__telemetryUrl) and intercepted, nothing
 * reaches the live worker. One session per page load, one run per game over,
 * end on hide and pagehide, the opt-out switch on the Bestenliste and in the
 * settings menu (screenshots at 320 px wide), and the service worker leaving
 * insights.html to the network.
 */
import type { Page } from 'playwright';
import type { UiDebugHook } from '../../src/ui/debug';
import { adultMode, dismissRotateHint, type PlaytestContext } from '../playtest-lib';

const FAKE = 'https://stats.example.test';
type UiWindow = Window & { __ui?: UiDebugHook };

async function reloadGame(page: Page) {
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__game));
}

const ui = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!);

export default async function telemetry(t: PlaytestContext): Promise<void> {
  const bodies: Record<string, unknown>[] = [];
  const types: string[] = [];
  await t.page.context().addInitScript((url) => ((window as { __telemetryUrl?: string }).__telemetryUrl = url), FAKE);
  await t.page.route(`${FAKE}/**`, async (route) => {
    const req = route.request();
    types.push(req.headers()['content-type'] ?? '');
    bodies.push(JSON.parse(req.postData() ?? 'null'));
    await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  // 320 px wide view: 640 x 360 CSS px (phone landscape) or the desktop window.
  if (t.viewport.touch) await t.page.setViewportSize({ width: 640, height: 360 });
  else await t.page.setViewportSize({ width: 1280, height: 720 });
  await reloadGame(t.page);
  await t.game.pause();
  await dismissRotateHint(t);
  await adultMode(t);
  await t.game.step(5);
  await t.wait(300);
  const kinds = () => bodies.map((b) => b.kind);
  t.check('one session event on the title', kinds().filter((k) => k === 'session').length === 1, bodies);
  t.check('sent as text/plain', types.every((c) => c.startsWith('text/plain')), types);
  const session = bodies[0]?.session as string;
  t.check('session id is 32 hex', /^[0-9a-f]{32}$/.test(session ?? ''), session);
  const stored = await t.page.evaluate((id) => Object.values(localStorage).some((v) => v.includes(id)), session ?? 'none');
  t.check('session id not in localStorage', !stored);

  // A run ends in game over: one run event with buckets.
  await t.game.seed(3);
  await t.game.startRun();
  await t.game.step(600);
  await t.game.setScore(2345);
  await t.game.endRun();
  await t.game.step(5);
  await t.wait(300);
  const runs = bodies.filter((b) => b.kind === 'run');
  t.check('one run event per game over', runs.length === 1, runs);
  t.check('run uses buckets', runs[0]?.score === 2000 && (runs[0]?.seconds as number) % 10 === 0, runs[0]);

  // Hide and pagehide send end via the beacon.
  // A string: tsx would wrap the named getter in an undefined __name().
  await t.page.evaluate(`Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    window.dispatchEvent(new PageTransitionEvent('pagehide'));`);
  await t.wait(500);
  const ends = bodies.filter((b) => b.kind === 'end');
  t.check('end on hide and pagehide', ends.length === 2 && ends.every((e) => (e.seconds as number) >= 9), ends);
  await t.page.evaluate(`Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })`);
  await t.log('telemetry bodies', { bodies });

  // Opt-out on the Bestenliste (adult): tap the switch.
  await t.game.step(60);
  await t.page.keyboard.press('Escape'); // game over -> title
  await t.game.step(5);
  await t.page.keyboard.press('KeyB');
  await t.game.step(3);
  await t.canvasShot('bestenliste with statistics on');
  const hs = (await t.page.evaluate(() => (window as UiWindow).__ui!.highscores()))!;
  await t.realTapView(hs.stats.x + Math.floor(hs.stats.w / 2), hs.stats.y + Math.floor(hs.stats.h / 2));
  await t.game.step(2);
  const optOut = await t.page.evaluate(() => localStorage.getItem('cannstatt-cruiser:statsOptOut'));
  const settings = await t.page.evaluate(() => (window as UiWindow).__ui!.settings());
  t.check('switch on the Bestenliste stores the opt-out', optOut === 'true' && !settings.statsOn, { optOut, settings });
  await t.canvasShot('bestenliste with statistics off');
  await t.screenshot('bestenliste page statistics off');
  await t.page.keyboard.press('Escape');
  await t.game.step(2);

  // Honoured at once: the next game over sends nothing.
  const before = bodies.length;
  await t.game.startRun();
  await t.game.step(120);
  await t.game.endRun();
  await t.game.step(5);
  await t.wait(300);
  t.check('opted out: no run event', bodies.length === before, bodies.slice(before));

  // Settings menu (hold K 3 s): the switch is there, in kid mode too.
  await t.page.keyboard.press('Escape');
  await t.game.step(5);
  await t.page.evaluate(() => {
    localStorage.setItem('cannstatt-cruiser:kidMode', 'true');
    window.__player!.kidMode(true);
  });
  await reloadGame(t.page);
  await t.game.pause();
  await dismissRotateHint(t);
  await t.game.step(3);
  await t.page.keyboard.down('KeyK');
  await t.game.step(185);
  await t.page.keyboard.up('KeyK');
  await t.game.step(2);
  t.check('settings open in kid mode', (await ui(t).then(() => t.page.evaluate(() => (window as UiWindow).__ui!.settings()))).screen === 'menu');
  await t.canvasShot('settings kid mode statistics off');
  await t.page.keyboard.press('KeyA');
  await t.game.step(2);
  const back = await t.page.evaluate(() => localStorage.getItem('cannstatt-cruiser:statsOptOut'));
  t.check('A in settings switches statistics back on', back === 'false', back);
  await t.canvasShot('settings kid mode statistics on');
  await t.page.keyboard.press('Escape');
  await t.game.step(2);
  await t.page.evaluate(() => {
    localStorage.setItem('cannstatt-cruiser:kidMode', 'false');
    window.__player!.kidMode(false);
  });

  // Service worker: insights.html is not answered with the cached game page.
  const controlled = await t.page
    .waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  t.check('page is controlled by the service worker', controlled);
  const gameUrl = t.page.url();
  await t.page.goto(new URL('insights.html', gameUrl).href);
  await t.wait(500);
  const insights = await t.page.evaluate(() => ({ title: document.title, game: Boolean(document.querySelector('#game')) }));
  t.check('insights.html is not the game page', !insights.game, insights);
  await t.screenshot('insights html through the service worker');
  // No named helpers in here: tsx would wrap them in an undefined __name().
  const cachedInsights = await t.page.evaluate(async () =>
    (await Promise.all((await caches.keys()).map(async (n) => (await caches.open(n)).keys())))
      .flat()
      .map((r) => r.url)
      .filter((url) => /\/assets\/insights-/.test(url)),
  );
  t.check('insights.html assets are not cached by the service worker', cachedInsights.length === 0, { cachedInsights });
  await t.page.goto(gameUrl);
  await t.page.waitForFunction(() => Boolean(window.__game));
  t.check('game page still loads', true);
}
