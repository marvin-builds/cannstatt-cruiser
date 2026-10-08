/**
 * Changelog and install-hint state (core contract, ROADMAP items 16 and 18):
 * a first visit stores the running build silently, an older stored version
 * fills `state.whatsNew`, every page load counts a visit, the user agent picks
 * the install platform, and simulateInstall fakes a browser install prompt.
 * The screens themselves are drawn by the ui slice.
 *
 *   npm run playtest -- --scenario scripts/scenarios/version-install.ts --name version-install --viewports desktop
 */
import type { Page } from 'playwright';
import { BUILD_VERSION, CHANGELOG } from '../../src/changelog';
import type { PlaytestContext } from '../playtest-lib';

const LAST_SEEN_KEY = 'cannstatt-cruiser:lastSeenVersion';
const OLDEST = CHANGELOG[CHANGELOG.length - 1]!.version;
const USER_AGENTS = {
  ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
} as const;

async function reloadGame(page: Page): Promise<void> {
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__game));
}

async function platformFor(t: PlaytestContext, userAgent: string): Promise<string> {
  const context = await t.page.context().browser()!.newContext({ userAgent, hasTouch: true, isMobile: true });
  try {
    const page = await context.newPage();
    await page.goto(t.page.url());
    await page.waitForFunction(() => Boolean(window.__game));
    return await page.evaluate(() => window.__game!.state().install.platform);
  } finally {
    await context.close();
  }
}

export default async function versionInstall(t: PlaytestContext): Promise<void> {
  const first = await t.game.state();
  const stored = await t.page.evaluate((k) => localStorage.getItem(k), LAST_SEEN_KEY);
  t.check('first visit: nothing new', first.whatsNew.length === 0, first.whatsNew);
  t.check('first visit: running build stored', stored === JSON.stringify(BUILD_VERSION), { stored });
  t.check('first visit counted', first.install.visits === 1, first.install);

  await t.page.evaluate(([k, v]) => localStorage.setItem(k!, JSON.stringify(v)), [LAST_SEEN_KEY, OLDEST]);
  await reloadGame(t.page);
  const again = await t.game.state();
  t.check('older stored version: newer entries listed', again.whatsNew.length > 0 && again.whatsNew[0]!.version === BUILD_VERSION, again.whatsNew);
  t.check('older stored version: the oldest is not listed', again.whatsNew.every((e) => e.version !== OLDEST));
  t.check('second visit counted', again.install.visits === 2, again.install);
  await t.log('whats new after an update');

  await t.game.simulateInstall({ canPrompt: true, platform: 'android' });
  t.check('simulated prompt offered', (await t.game.state()).install.canPrompt);
  await t.game.simulateInstall({ canPrompt: false });
  t.check('simulated prompt withdrawn', !(await t.game.state()).install.canPrompt && (await t.game.promptsShown()) === 0);
  await t.canvasShot('title with whatsNew and install state');

  t.check('iPhone user agent: ios', (await platformFor(t, USER_AGENTS.ios)) === 'ios');
  t.check('Android user agent: android', (await platformFor(t, USER_AGENTS.android)) === 'android');
}
