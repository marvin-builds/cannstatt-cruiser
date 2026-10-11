/**
 * The title's settings gear (ROADMAP 64) across the title layouts: adult mode
 * with the trophy (fake online list) and the feedback icon (fake feedback
 * URL), with no card and the update card ("Neue Version da"); on phones also
 * with an install prompt kept or on iOS, which must not bring the install
 * card to the title (ROADMAP 68: game over only). Each title is screenshotted and
 * checked: the gear shows top left, clear of the logo, the panel's rows and
 * cards, the trophy, the HUD buttons and every other title button, inside
 * the view, a >= 44 CSS px tap area on phones; the old Kindermodus button is
 * gone. Then the gear opens the settings (tap / G) and kid mode hides it.
 * Phones also run at a 320 px wide view (landscape 640 x 360, portrait 320 x 640). Nothing
 * reaches the live worker: the list is a Playwright route and feedback is
 * never sent.
 *   npm run playtest -- --scenario scripts/scenarios/title-gear.ts --viewports desktop,phone-landscape,phone-portrait --name title-gear
 */
import type { Rect } from '../../src/types';
import type { UiDebugHook } from '../../src/ui/debug';
import { adultMode, cssPerViewPixel, dismissRotateHint, type PlaytestContext } from '../playtest-lib';

type UiWindow = Window & { __ui?: UiDebugHook };

const API = 'https://cannstatt-cruiser-scores.marvinmai.workers.dev';
const FAKE_FEEDBACK = 'https://feedback.example.test';

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const mid = (r: Rect) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)] as const;
const ui = (t: PlaytestContext) => ({
  layout: () => t.page.evaluate(() => (window as UiWindow).__ui!.layout()),
  settings: () => t.page.evaluate(() => (window as UiWindow).__ui!.settings()),
  scores: () => t.page.evaluate(() => (window as UiWindow).__ui!.highscores()),
});

type Cards = { update: boolean; install: 'prompt' | 'ios' | null };

/** A fresh adult title with the given notice cards. */
async function title(t: PlaytestContext, cards: Cards): Promise<void> {
  await t.page.reload();
  await t.page.waitForFunction(() => Boolean(window.__game));
  await t.game.pause();
  await dismissRotateHint(t);
  await adultMode(t);
  if (cards.update) await t.page.evaluate(() => window.__game!.simulateUpdateReady());
  if (cards.install === 'prompt') await t.game.simulateInstall({ visits: 3, canPrompt: true });
  if (cards.install === 'ios') await t.game.simulateInstall({ visits: 3, platform: 'ios', canPrompt: false });
  await t.game.step(3);
}

/** The gear against everything else on the title. */
async function checkTitle(t: PlaytestContext, label: string): Promise<void> {
  const { layout, scores } = ui(t);
  const l = await layout();
  const { viewWidth, viewHeight } = await t.game.display();
  const gear = l.screen?.settings ?? null;
  t.check(`${label}: the gear shows`, gear !== null, l.screen);
  if (!gear) return;
  const list = await scores();
  const others: [string, Rect][] = [
    ['logo', l.logo],
    ['mute', l.hud.mute],
    ...(l.hud.fullscreen ? [['fullscreen', l.hud.fullscreen] as [string, Rect]] : []),
    ...(list?.trophyShown ? [['trophy', list.trophy] as [string, Rect]] : []),
    ...Object.entries(l.screen!)
      .filter(([id, r]) => id !== 'settings' && r !== null)
      .map(([id, r]) => [id, r as Rect] as [string, Rect]),
  ];
  const hits = others.filter(([, r]) => overlap(gear, r)).map(([id]) => id);
  t.check(`${label}: the gear overlaps nothing`, hits.length === 0, { gear, hits });
  t.check(`${label}: the gear is inside the view`, gear.x >= 0 && gear.y >= 0 && gear.x + gear.w <= viewWidth && gear.y + gear.h <= viewHeight, gear);
  // Every title button pairwise: nothing else overlaps either.
  const buttons = others.filter(([id]) => id !== 'logo');
  const pairs = buttons.flatMap(([a, ra], i) => buttons.slice(i + 1).filter(([, rb]) => overlap(ra, rb)).map(([b]) => `${a}/${b}`));
  t.check(`${label}: no title buttons overlap`, pairs.length === 0, pairs);
  if (t.viewport.touch) {
    const css = await cssPerViewPixel(t.page);
    const sizes = [gear, ...buttons.map(([, r]) => r)].map((r) => Math.round(Math.min(r.w, r.h) * css));
    t.check(`${label}: tap areas >= 44 CSS px`, sizes.every((s) => s >= 44), { css, sizes });
  }
  t.check(`${label}: no Kindermodus button`, !('kidMode' in l.screen!), Object.keys(l.screen!));
  t.check(`${label}: no install card on the title`, l.screen!.install === null && l.screen!.dismiss === null, l.screen);
}

/** The gear opens the settings (tap on touch, G on desktop, a click as well); kid mode hides it. */
async function gearOpensSettings(t: PlaytestContext): Promise<void> {
  const { layout, settings } = ui(t);
  await title(t, { update: false, install: null });
  const gear = (await layout()).screen!.settings!;
  const before = (await t.game.state()).frame;
  await t.realTapView(...mid(gear));
  await t.game.step(2);
  const opened = (await settings()).screen;
  t.check(`gear ${t.viewport.touch ? 'tap' : 'click'} opens the settings, no run`, opened === 'menu' && (await t.game.eventsSince(before, 'runStarted')).length === 0, opened);
  await t.canvasShot('settings from the gear');
  await t.page.keyboard.press('Escape');
  await t.game.step(2);
  if (!t.viewport.touch) {
    await t.page.keyboard.press('KeyG');
    await t.game.step(2);
    t.check('G opens the settings', (await settings()).screen === 'menu');
    await t.page.keyboard.press('Escape');
    await t.game.step(2);
  }
  await t.page.evaluate(() => {
    localStorage.setItem('cannstatt-cruiser:kidMode', 'true');
  });
  await t.page.reload();
  await t.page.waitForFunction(() => Boolean(window.__game));
  await t.game.pause();
  await dismissRotateHint(t);
  await t.game.step(3);
  t.check('kid mode: no gear', (await t.game.state()).kidMode && (await layout()).screen?.settings === null);
  await t.canvasShot('title kid mode no gear');
}

export default async function titleGear(t: PlaytestContext): Promise<void> {
  let posts = 0;
  await t.page.context().addInitScript((url) => ((window as { __feedbackUrl?: string }).__feedbackUrl = url), FAKE_FEEDBACK);
  await t.page.route(`${FAKE_FEEDBACK}/**`, (route) => {
    posts++;
    return route.abort();
  });
  await t.page.route(`${API}/**`, (route) => {
    const req = route.request();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (req.method() === 'POST') {
      posts++;
      return route.abort();
    }
    return route.fulfill({ headers, json: { entries: [] } });
  });
  // Also a 320 px wide view: phone landscape at 640 x 360, phone portrait on a 320 CSS px wide phone.
  const narrow = { 'phone-landscape': { width: 640, height: 360 }, 'phone-portrait': { width: 320, height: 640 } }[t.viewport.name];
  const sizes = narrow ? [null, narrow] : [null];
  const combos: Cards[] = t.viewport.touch
    ? [
        { update: false, install: null },
        { update: true, install: null },
        { update: false, install: 'prompt' },
        { update: true, install: 'prompt' },
        { update: true, install: 'ios' },
      ]
    : [
        { update: false, install: null },
        { update: true, install: null },
      ];
  for (const size of sizes) {
    if (size) await t.page.setViewportSize(size);
    for (const cards of combos) {
      await title(t, cards);
      const { viewWidth } = await t.game.display();
      const label = `title ${viewWidth}w${cards.update ? ' update' : ''}${cards.install ? ` install-${cards.install}` : ''}`;
      await checkTitle(t, label);
      await t.canvasShot(label);
    }
  }
  await gearOpensSettings(t);
  t.check('nothing was posted', posts === 0, posts);
}
