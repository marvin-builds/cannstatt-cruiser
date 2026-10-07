/**
 * Audio + PWA playtest (production build): manifest, icons and service worker
 * load; the AudioContext unlocks on the first real input; every gameplay event
 * triggers its sound (read from the audio debug log `window.__audio`, no real
 * sound is inspected); mute persists across reloads; after a simulated deploy
 * the service worker precaches the new build, and the game reloads offline.
 *
 *   npm run playtest -- --scenario scripts/scenarios/audio-pwa.ts --name audio-pwa
 */
import type { AudioDebug } from '../../src/audio/debug';
import type { GameEvents } from '../../src/types';
import type { PlaytestContext } from '../playtest-lib';

type AudioWindow = Window & { __audio?: AudioDebug };

/** Bus event -> sound the audio system must log for it. */
const EXPECTED_SOUND: Partial<Record<keyof GameEvents, string>> = {
  jump: 'jump',
  land: 'land',
  starCollected: 'star',
  obstacleCleared: 'cleared',
  crash: 'crash',
  gameOver: 'gameOver',
  grindStart: 'grind:start',
  chillStart: 'chill',
};

const audioLog = (t: PlaytestContext) =>
  t.page.evaluate(() => (window as AudioWindow).__audio?.log.map((e) => e.sound) ?? []);
const audioStatus = (t: PlaytestContext) =>
  t.page.evaluate(() => (window as AudioWindow).__audio?.status() ?? 'missing');

async function checkPwaFiles(t: PlaytestContext): Promise<void> {
  const result = await t.page.evaluate(async () => {
    const manifestUrl = document.querySelector<HTMLLinkElement>('link[rel=manifest]')!.href;
    const res = await fetch(manifestUrl);
    const manifest = (await res.json()) as {
      name: string;
      start_url: string;
      scope: string;
      display: string;
      orientation: string;
      icons: { src: string; sizes: string; purpose: string }[];
    };
    const appleIcon = document.querySelector<HTMLLinkElement>('link[rel=apple-touch-icon]')!.href;
    const images = [
      ...manifest.icons.map((i) => ({ url: new URL(i.src, manifestUrl).href, sizes: i.sizes, purpose: i.purpose })),
      { url: appleIcon, sizes: '180x180', purpose: 'apple' },
    ];
    const icons = await Promise.all(
      images.map(async (icon) => {
        const r = await fetch(icon.url);
        const img = new Image();
        img.src = URL.createObjectURL(await r.blob());
        await img.decode();
        return { ...icon, status: r.status, type: r.headers.get('content-type'), actual: `${img.naturalWidth}x${img.naturalHeight}` };
      }),
    );
    return { status: res.status, manifest, icons };
  });
  const m = result.manifest;
  const relative = (p: string) => !p.startsWith('/') && !/^https?:/.test(p);
  t.check('manifest loads', result.status === 200 && m.name === 'Cannstatt Cruiser', { status: result.status, name: m.name });
  t.check(
    'manifest uses relative paths',
    relative(m.start_url) && relative(m.scope) && m.icons.every((i) => relative(i.src)),
    { start_url: m.start_url, scope: m.scope },
  );
  t.check('manifest fullscreen landscape', m.display === 'fullscreen' && m.orientation === 'landscape', m);
  t.check(
    'icons load with the declared size',
    result.icons.every((i) => i.status === 200 && i.type === 'image/png' && i.actual === i.sizes),
    result.icons,
  );
  t.check('maskable icon declared', m.icons.some((i) => i.purpose === 'maskable'), m.icons);
  await t.log('pwa files', result);
}

async function waitForServiceWorker(t: PlaytestContext): Promise<void> {
  const ok = await t.page
    .waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  const caches = await t.page.evaluate(async () => {
    const names = await window.caches.keys();
    const entries = await Promise.all(names.map(async (n) => (await (await window.caches.open(n)).keys()).length));
    return names.map((n, i) => ({ name: n, entries: entries[i] }));
  });
  t.check('service worker registers and controls the page', ok, caches);
}

/** Scripted run: real first input (unlock), seeded jumps, a held jump, live play, game over. */
async function scriptedRun(t: PlaytestContext): Promise<void> {
  const { game } = t;
  t.check('audio locked before the first input', (await audioStatus(t)) === 'locked', await audioStatus(t));
  await t.realPress(80); // also starts the run from the title
  await t.wait(100);
  const status = await audioStatus(t);
  t.check('AudioContext unlocks on the first real input', status === 'running', status);

  await game.pause();
  await game.seed(5);
  if ((await game.state()).mode !== 'playing') await game.startRun();
  const since = (await game.state()).frame;
  const before = (await audioLog(t)).length;
  await game.step(20);
  await game.tap(2);
  await game.step(60);
  await game.hold(20);
  await game.step(60);
  // A few seconds of live play so gameplay events (stars, obstacles, crashes, rails) can happen.
  await game.resume();
  await game.setTimeScale(2);
  for (let i = 0; i < 12; i++) {
    await game.tap(3);
    await t.wait(250);
  }
  await game.pause();
  await game.setTimeScale(1);
  if ((await game.state()).mode === 'paused') await game.resumeGame();
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.step(1);
  await t.canvasShot('game over with jingle');

  const events = await game.eventsSince(since);
  const sounds = (await audioLog(t)).slice(before);
  const counts = (list: string[]) => list.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s]: (acc[s] ?? 0) + 1 }), {});
  const eventCounts = counts(events.map((e) => e.name));
  const soundCounts = counts(sounds);
  const mismatched = Object.entries(EXPECTED_SOUND).filter(
    ([event, sound]) => (eventCounts[event] ?? 0) !== (soundCounts[sound!] ?? 0),
  );
  t.check('every gameplay event triggered its sound', mismatched.length === 0, { mismatched, eventCounts, soundCounts });
  t.check('jump, boost, land and game-over sounds fired', ['jump', 'boost', 'land', 'gameOver'].every((s) => soundCounts[s]), soundCounts);
  t.check('grind loop is stopped after the run', (soundCounts['grind:start'] ?? 0) === (soundCounts['grind:stop'] ?? 0), soundCounts);
  await t.log('sfx fired', { sounds, soundCounts, eventCounts });
}

async function checkMutePersists(t: PlaytestContext): Promise<void> {
  await t.page.keyboard.press('m');
  await t.game.step(1);
  const stored = await t.page.evaluate(() => localStorage.getItem('cannstatt-cruiser:muted'));
  t.check('M mutes and stores the flag', stored === 'true' && (await t.game.state()).muted, { stored });
  await t.page.reload();
  await t.page.waitForFunction(() => Boolean(window.__game));
  t.check('mute survives a reload', (await t.game.state()).muted, await t.game.state().then((s) => s.muted));
  await t.page.keyboard.press('m');
  await t.wait(100);
  const after = await t.page.evaluate(() => localStorage.getItem('cannstatt-cruiser:muted'));
  t.check('M unmutes again', after === 'false', { after });
}

/**
 * Simulated deploy: the server starts answering with a page that references a
 * new hashed bundle. After one online start (served from the cache, refreshed
 * in the background) the worker must have cached the new page together with
 * its bundle and dropped the old bundle, so the next offline start works.
 */
async function checkDeployUpdate(t: PlaytestContext): Promise<void> {
  const context = t.page.context();
  const shellUrl = new URL('./', t.page.url()).href;
  const html = await (await context.request.get(shellUrl)).text();
  const oldBundle = /assets\/index-[\w-]+\.js/.exec(html)?.[0];
  if (!oldBundle) {
    t.check('deploy simulation finds the bundle', false, { html });
    return;
  }
  const newBundle = 'assets/index-deploytest.js';
  const bundle = await (await context.request.get(new URL(oldBundle, shellUrl).href)).body();
  const isShell = (url: URL) => url.href.split('?')[0] === shellUrl;
  await context.route(isShell, (route) =>
    route.fulfill({ contentType: 'text/html', body: html.replace(oldBundle, newBundle) }),
  );
  await context.route(`**/${newBundle}`, (route) => route.fulfill({ contentType: 'text/javascript', body: bundle }));
  try {
    await t.page.reload();
    await t.page.waitForFunction(() => Boolean(window.__game));
    const result = await t.page
      .waitForFunction(
        async ([shell, fresh, stale]) => {
          const page = await caches.match(shell!);
          if (!page || !(await page.text()).includes(fresh!)) return false;
          // No named helpers in here: tsx would wrap them in an undefined __name().
          return {
            fresh: Boolean(await caches.match(new URL(fresh!, shell).href, { ignoreVary: true })),
            stale: Boolean(await caches.match(new URL(stale!, shell).href, { ignoreVary: true })),
            cached: (await Promise.all((await caches.keys()).map(async (n) => (await caches.open(n)).keys())))
              .flat()
              .map((r) => r.url),
          };
        },
        [shellUrl, newBundle, oldBundle],
        { timeout: 10_000, polling: 200 },
      )
      .then((h) => h.jsonValue() as Promise<{ fresh: boolean; stale: boolean; cached: string[] }>)
      .catch(() => null);
    t.check('deploy: new page is cached in the background', result !== null);
    t.check('deploy: new bundle is precached with the page', result?.fresh === true, result);
    t.check('deploy: old bundle is removed from the cache', result?.stale === false, result);
  } finally {
    await context.unrouteAll();
  }
}

async function checkOfflineReload(t: PlaytestContext): Promise<void> {
  const context = t.page.context();
  await context.setOffline(true);
  try {
    await t.page.reload();
    const loaded = await t.page
      .waitForFunction(() => Boolean(window.__game), undefined, { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    t.check('game reloads offline', loaded);
    if (loaded) {
      await t.wait(300);
      await t.game.pause();
      await t.game.seed(2);
      await t.game.startRun();
      await t.game.step(90);
      await t.canvasShot('offline run');
      t.check('offline run plays', (await t.game.state()).distance > 0);
    }
  } finally {
    await context.setOffline(false);
  }
}

export default async function audioPwa(t: PlaytestContext): Promise<void> {
  await checkPwaFiles(t);
  await waitForServiceWorker(t);
  await scriptedRun(t);
  await checkMutePersists(t);
  await checkDeployUpdate(t);
  await checkOfflineReload(t);
}
