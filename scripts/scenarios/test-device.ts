/**
 * Test devices and new vs. returning players (ROADMAP 55) against a FAKE
 * statistics endpoint (window.__telemetryUrl, intercepted; nothing reaches the
 * live worker). A first visit (empty storage) sends `returning: false` and no
 * `tester`; a reload sends `returning: true`; with the board's marker
 * (`cannstatt-cruiser:testDevice` = true) the session carries `tester: true`
 * and the hidden settings show a plain "Testgerät" line (screenshots with and
 * without, kid mode too) at a 320 px wide view; the marker alone on a fresh
 * device is still a new player. The game never writes the marker.
 *   npm run playtest -- --scenario scripts/scenarios/test-device.ts --viewports desktop,phone-landscape,phone-portrait --name test-device
 */
import type { Rect } from '../../src/types';
import type { UiDebugHook } from '../../src/ui/debug';
import { dismissRotateHint, holdViewWhile, type PlaytestContext } from '../playtest-lib';

const FAKE = 'https://stats.example.test';
const MARKER = 'cannstatt-cruiser:testDevice';
type UiWindow = Window & { __ui?: UiDebugHook };

const ui = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.settings());
const centre = (r: Rect) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

/** Reloads after `prepare` changed the storage, and returns the session event of the new page load. */
async function load(t: PlaytestContext, bodies: Record<string, unknown>[], prepare: string): Promise<Record<string, unknown> | undefined> {
  // A string: tsx would wrap a named function in an undefined __name().
  await t.page.evaluate(prepare);
  bodies.length = 0;
  await t.page.reload();
  await t.page.waitForFunction(() => Boolean(window.__game));
  await t.game.pause();
  await dismissRotateHint(t);
  await t.game.step(5);
  await t.wait(300);
  return bodies.find((b) => b.kind === 'session');
}

/** K held on desktop, a long press on the logo on touch (like scripts/scenarios/settings.ts). */
async function openMenu(t: PlaytestContext): Promise<void> {
  if (t.viewport.touch) {
    const logo = centre((await t.page.evaluate(() => (window as UiWindow).__ui!.layout())).logo);
    await holdViewWhile(t, logo.x, logo.y, () => t.game.step(185).then(() => {}));
  } else {
    await t.page.keyboard.down('KeyK');
    await t.game.step(185);
    await t.page.keyboard.up('KeyK');
  }
  await t.game.step(2);
}

async function closeMenu(t: PlaytestContext): Promise<void> {
  await t.page.keyboard.press('Escape');
  await t.game.step(2);
}

export default async function testDevice(t: PlaytestContext): Promise<void> {
  const bodies: Record<string, unknown>[] = [];
  await t.page.context().addInitScript((url) => ((window as { __telemetryUrl?: string }).__telemetryUrl = url), FAKE);
  await t.page.route(`${FAKE}/**`, async (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? 'null'));
    await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  // A 320 px wide view in every orientation.
  if (!t.viewport.touch) await t.page.setViewportSize({ width: 1280, height: 720 });
  else if (t.viewport.name === 'phone-portrait') await t.page.setViewportSize({ width: 320, height: 640 });
  else await t.page.setViewportSize({ width: 640, height: 360 });

  const first = await load(t, bodies, `localStorage.clear()`);
  const { viewWidth } = await t.game.display();
  t.check('view is 320 px wide', viewWidth === 320, viewWidth);
  t.check('first visit (empty storage): returning false, no tester', first?.returning === false && !('tester' in (first ?? {})), first);

  await openMenu(t);
  const plain = await ui(t);
  t.check('settings open without the marker: no Testgerät line', plain.screen === 'menu' && !plain.testDevice, plain);
  await t.canvasShot('settings without marker');
  await closeMenu(t);

  const again = await load(t, bodies, `localStorage.setItem('cannstatt-cruiser:kidMode', 'false')`);
  t.check('reload: returning true, no tester', again?.returning === true && !('tester' in (again ?? {})), again);

  const marked = await load(t, bodies, `localStorage.setItem('${MARKER}', 'true')`);
  t.check('marked device: tester true, returning true', marked?.tester === true && marked?.returning === true, marked);
  await openMenu(t);
  const shown = await ui(t);
  t.check('settings with the marker: Testgerät line', shown.screen === 'menu' && shown.testDevice, shown);
  await t.canvasShot('settings with marker');
  await closeMenu(t);

  const kid = await load(t, bodies, `localStorage.setItem('cannstatt-cruiser:kidMode', 'true')`);
  t.check('kid mode, marked: tester true', kid?.tester === true && kid?.kid === true, kid);
  await openMenu(t);
  t.check('kid mode settings with the marker: Testgerät line', (await ui(t)).testDevice);
  await t.canvasShot('settings with marker kid mode');
  await closeMenu(t);

  const switchedOff = await load(t, bodies, `localStorage.setItem('cannstatt-cruiser:kidMode', 'false'); localStorage.setItem('${MARKER}', 'false')`);
  t.check('marker switched off on the board: no tester', !('tester' in (switchedOff ?? {})), switchedOff);
  await openMenu(t);
  t.check('marker false: no Testgerät line', !(await ui(t)).testDevice);
  await closeMenu(t);

  const fresh = await load(t, bodies, `localStorage.clear(); localStorage.setItem('${MARKER}', 'true')`);
  t.check('only the marker stored: tester true, still a new player', fresh?.tester === true && fresh?.returning === false, fresh);
  const marker = await t.page.evaluate((key) => localStorage.getItem(key), MARKER);
  t.check('the game left the marker as the board set it', marker === 'true', marker);
}
