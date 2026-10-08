/**
 * Update signal playtest (production build): once the service worker controls
 * the page, a reload with an unchanged deploy leaves `state.updateReady` off;
 * after a simulated new deploy (the server answers with a page referencing a
 * new hashed bundle) one online start lets the worker cache the new build in
 * the background and post {type: 'updateReady'}, which core turns into
 * `state.updateReady`. The UI hint itself is drawn by the ui slice.
 *
 *   npm run playtest -- --scenario scripts/scenarios/update-hint.ts --name update-hint --viewports desktop
 */
import type { PlaytestContext } from '../playtest-lib';

const UPDATE_TIMEOUT_MS = 10_000;

async function reloadGame(t: PlaytestContext): Promise<void> {
  await t.page.reload();
  await t.page.waitForFunction(() => Boolean(window.__game));
}

const waitForUpdateReady = (t: PlaytestContext, timeout: number) =>
  t.page
    .waitForFunction(() => window.__game?.state().updateReady === true, undefined, { timeout, polling: 100 })
    .then(() => true)
    .catch(() => false);

/** Serves a page that references a copy of the bundle under a new hashed name until the returned undo runs. */
async function simulateDeploy(t: PlaytestContext): Promise<(() => Promise<void>) | null> {
  const context = t.page.context();
  const shellUrl = new URL('./', t.page.url()).href;
  const html = await (await context.request.get(shellUrl)).text();
  const oldBundle = /assets\/index-[\w-]+\.js/.exec(html)?.[0];
  t.check('deploy simulation finds the bundle', Boolean(oldBundle), { html });
  if (!oldBundle) return null;
  const newBundle = 'assets/index-updatehint.js';
  const bundle = await (await context.request.get(new URL(oldBundle, shellUrl).href)).body();
  await context.route(
    (url) => url.href.split('?')[0] === shellUrl,
    (route) => route.fulfill({ contentType: 'text/html', body: html.replace(oldBundle, newBundle) }),
  );
  await context.route(`**/${newBundle}`, (route) => route.fulfill({ contentType: 'text/javascript', body: bundle }));
  return () => context.unrouteAll();
}

export default async function updateHint(t: PlaytestContext): Promise<void> {
  const controlled = await t.page
    .waitForFunction(() => Boolean(navigator.serviceWorker?.controller), undefined, { timeout: UPDATE_TIMEOUT_MS })
    .then(() => true)
    .catch(() => false);
  t.check('service worker controls the page', controlled);
  t.check('no update flagged after the first install', !(await t.game.state()).updateReady);

  await reloadGame(t);
  t.check('unchanged deploy: no update flagged', !(await waitForUpdateReady(t, 2_000)));

  const undo = await simulateDeploy(t);
  if (!undo) return;
  try {
    await reloadGame(t);
    const flagged = await waitForUpdateReady(t, UPDATE_TIMEOUT_MS);
    t.check('new deploy: the page receives updateReady', flagged, await t.game.state().then((s) => s.updateReady));
    await t.log('after simulated deploy');
    await t.canvasShot('update ready (title)');
    await reloadGame(t);
    const fresh = await t.page.evaluate(() => document.querySelector('script[src*="index-updatehint"]') !== null);
    t.check('reload starts the new build from the cache', fresh);
  } finally {
    await undo();
  }
}
