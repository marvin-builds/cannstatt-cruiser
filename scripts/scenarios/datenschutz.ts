/**
 * Datenschutz page and its in-game link (ROADMAP 47). Against the preview
 * build; the live worker is faked (GET /top only) on top of the harness's
 * global block, so nothing reaches it. Checks:
 * - the "Datenschutz" link beside the statistics switch on the Bestenliste and
 *   in the settings menu (kid mode), at a 320 px wide view (phone landscape,
 *   desktop) and in portrait; a real tap / click opens datenschutz.html in a
 *   new page and the game screen stays as it was;
 * - datenschutz.html loads (not the game) once the game's service worker
 *   controls the page, makes no request to another origin, has no horizontal
 *   scroll, and looks right in light and dark.
 *
 *   npm run playtest -- --scenario scripts/scenarios/datenschutz.ts --viewports desktop,phone-landscape,phone-portrait --name datenschutz
 */
import type { Page } from 'playwright';
import type { UiDebugHook } from '../../src/ui/debug';
import { adultMode, dismissRotateHint, join, LIVE_WORKER_HOST, type PlaytestContext } from '../playtest-lib';

type UiWindow = Window & { __ui?: UiDebugHook };
type Box = { x: number; y: number; w: number; h: number };

const TOP = Array.from({ length: 8 }, (_, i) => ({
  rank: i + 1,
  name: ['Kessel', 'Wasen', 'Neckar', 'Rössle', 'Mineral', 'Brezel', 'Stäffele', 'Kehrwoche'][i],
  score: 9000 - i * 850,
  distance: 1200 - i * 100,
  date: '2026-10-10T12:00:00.000Z',
}));

const centre = (r: Box) => [r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2)] as const;
const overlap = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

async function reloadGame(page: Page): Promise<void> {
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__game));
}

/** A real tap / click on view rect `r` opens datenschutz.html in a new page; returns what that page showed. */
async function tapOpensPage(t: PlaytestContext, r: Box, label: string): Promise<void> {
  const popup = t.page.context().waitForEvent('page', { timeout: 5000 }).catch(() => null);
  await t.realTapView(...centre(r));
  await t.game.step(2);
  const page = await popup;
  if (!page) {
    t.check(`${label}: the link opens a new page`, false);
    return;
  }
  await page.waitForLoadState('domcontentloaded');
  const shown = await page.evaluate(() => ({
    path: location.pathname,
    h1: document.querySelector('h1')?.textContent ?? '',
    opener: window.opener !== null,
  }));
  t.check(`${label}: the link opens datenschutz.html in a new page without opener`, shown.path.endsWith('/datenschutz.html') && shown.h1 === 'Datenschutz' && !shown.opener, shown);
  await page.close();
}

export default async function datenschutz(t: PlaytestContext): Promise<void> {
  const { page } = t;
  await page.route(
    (url) => url.hostname === LIVE_WORKER_HOST,
    (route) => {
      const headers = { 'Access-Control-Allow-Origin': '*' };
      if (route.request().method() === 'GET' && new URL(route.request().url()).pathname === '/top') return route.fulfill({ headers, json: { entries: TOP } });
      return route.abort('blockedbyclient');
    },
  );
  // A 320 px wide view: 640 x 360 CSS px on a phone in landscape, 1280 x 720 on desktop; portrait as it is.
  if (t.viewport.touch && t.viewport.options.viewport!.width > t.viewport.options.viewport!.height) await page.setViewportSize({ width: 640, height: 360 });
  if (!t.viewport.touch) await page.setViewportSize({ width: 1280, height: 720 });
  await reloadGame(page);
  await t.game.pause();
  await dismissRotateHint(t);
  await adultMode(t);
  await t.game.step(3);
  const { viewWidth } = await t.game.display();
  await t.log('view', { viewWidth });

  // Bestenliste: the link right of the statistics switch.
  await page.keyboard.press('KeyB');
  await t.game.step(5);
  await t.wait(200);
  await t.game.step(2);
  const hs = (await page.evaluate(() => (window as UiWindow).__ui!.highscores()))!;
  t.check('Bestenliste is open', hs.screen === 'list', hs.screen);
  const link = hs.privacyLink;
  t.check('Bestenliste: link beside the switch, inside the view, clear of switch and close', link.y === hs.stats.y && link.x + link.w <= viewWidth && !overlap(link, hs.stats) && !overlap(link, hs.close), { link, stats: hs.stats, close: hs.close });
  await t.canvasShot('bestenliste with datenschutz link');
  await tapOpensPage(t, link, 'Bestenliste');
  const after = (await page.evaluate(() => (window as UiWindow).__ui!.highscores()))!;
  const statsOn = (await page.evaluate(() => (window as UiWindow).__ui!.settings())).statsOn;
  t.check('Bestenliste stays open, the statistics switch untouched', after.screen === 'list' && statsOn, { screen: after.screen, statsOn });
  await page.keyboard.press('Escape');
  await t.game.step(2);

  // Settings menu (hold K 3 s), in kid mode: the link right of the switch.
  await page.evaluate(() => {
    localStorage.setItem('cannstatt-cruiser:kidMode', 'true');
    window.__player!.kidMode(true);
  });
  await page.keyboard.down('KeyK');
  await t.game.step(185);
  await page.keyboard.up('KeyK');
  await t.game.step(2);
  const menuShown = await page.evaluate(() => (window as UiWindow).__ui!.settings().screen);
  t.check('settings open in kid mode', menuShown === 'menu', menuShown);
  const { menu } = await page.evaluate(() => (window as UiWindow).__ui!.layout());
  t.check('settings: link beside the switch, inside the view, clear of the buttons', menu.privacyLink.y === menu.stats.y && menu.privacyLink.x >= 0 && menu.privacyLink.x + menu.privacyLink.w <= viewWidth && [menu.stats, menu.toggle, menu.back].every((r) => !overlap(menu.privacyLink, r)), menu);
  await t.canvasShot('settings kid mode with datenschutz link');
  await tapOpensPage(t, menu.privacyLink, 'settings');
  t.check('settings stay open after the link', (await page.evaluate(() => (window as UiWindow).__ui!.settings().screen)) === 'menu');
  await page.keyboard.press('Escape');
  await t.game.step(2);
  await page.evaluate(() => {
    localStorage.setItem('cannstatt-cruiser:kidMode', 'false');
    window.__player!.kidMode(false);
  });

  // The page through the service worker.
  const controlled = await page
    .waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  t.check('game page is controlled by the service worker', controlled);
  const gameUrl = page.url();
  const origin = new URL(gameUrl).origin;
  const foreign: string[] = [];
  page.on('request', (r) => void (new URL(r.url()).origin !== origin && foreign.push(r.url())));
  await page.goto(new URL('datenschutz.html', gameUrl).href);
  await page.waitForLoadState('load');
  const shown = await page.evaluate(() => ({
    title: document.title,
    h1: document.querySelector('h1')?.textContent ?? '',
    game: Boolean(document.querySelector('#game')),
    controlled: Boolean(navigator.serviceWorker?.controller),
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
    issues: Boolean(document.querySelector('a[href="https://github.com/marvin-builds/cannstatt-cruiser/issues"]')),
    back: document.querySelector('a.back')?.getAttribute('href'),
    styled: getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)',
  }));
  t.check('datenschutz.html loads under the service worker, not the game', shown.h1 === 'Datenschutz' && !shown.game && shown.controlled, shown);
  t.check('page links GitHub issues and back to the game, its stylesheet loaded', shown.issues && shown.back === './' && shown.styled, shown);
  t.check('no horizontal scroll', shown.scroll <= shown.client, shown);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: join(t.outDir, `datenschutz-page-${scheme}-full.png`), fullPage: true });
  }
  await page.emulateMedia({ colorScheme: null });
  t.check('the page requests nothing from other origins', foreign.length === 0, foreign);
  const cached = await page.evaluate(async () =>
    (await Promise.all((await caches.keys()).map(async (n) => (await caches.open(n)).keys())))
      .flat()
      .map((r) => r.url)
      .filter((url) => /datenschutz/.test(url)),
  );
  t.check('the service worker caches nothing of the page', cached.length === 0, cached);
  await page.goto(gameUrl);
  await page.waitForFunction(() => Boolean(window.__game));
  t.check('the game still loads afterwards', true);
}
