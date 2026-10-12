/**
 * Layout polish of ROADMAP 84 (ui slice) at the narrowest sizes, against a
 * FAKE feedback endpoint (window.__feedbackUrl, every request a Playwright
 * route) and a routed online list: nothing reaches the live worker.
 *
 * - Landscape with a 320 px view (640x360): the "Neu" form on the canvas with
 *   the red dot on "Mein Feedback" (a kept report whose status changed) clear
 *   of the tab border, and the log toggle's box apart from its label.
 * - Portrait at 320x568: the sheet's tabs on one line ("Mein Feedback" does not
 *   wrap), a report's details and "Das wurde gesendet" with the version on one
 *   line, and "Wirklich löschen?" as one block with its buttons (no tall empty
 *   panel); the confirm again at 390x844.
 * - The rotate screen at 320x568, 390x844 and a tablet (820x1180): the arrow
 *   above the phone on one centre line, the button taller on the tablet.
 *
 * Touch viewports only (run it on phone-portrait); a desktop viewport skips it.
 *
 *   npm run playtest -- --scenario scripts/scenarios/ui-polish.ts --viewports phone-portrait --name ui-polish
 */
import type { Route } from 'playwright';
import { SCORES_URL } from '../../src/net/api';
import type { Rect } from '../../src/types';
import type { FeedbackDebug, UiDebugHook } from '../../src/ui/debug';
import { adultMode, dismissRotateHint, type PlaytestContext } from '../playtest-lib';

type UiWindow = Window & { __ui?: UiDebugHook };

const FAKE = 'https://feedback.example.test';
const SHEET = '[role=dialog][aria-label="Feedback"]';
const ROTATE = '[role=dialog][aria-label="Bitte Gerät drehen"]';
const mid = (r: Rect) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)] as const;
const LANDSCAPE_320 = { width: 640, height: 360 };
const PORTRAIT_320 = { width: 320, height: 568 };
const PORTRAIT_390 = { width: 390, height: 844 };
const TABLET = { width: 820, height: 1180 };

/** One kept report whose status changed since it was last seen (the red dot), with a reply and a version. */
function seed(): unknown[] {
  return [
    {
      id: 3,
      key: '3'.padStart(32, 'b'),
      day: '2026-10-10',
      kind: 'bug',
      text: 'Die Musik ist nach der Pause weg',
      version: '2026-10-12.2',
      platform: 'android',
      input: 'touch',
      orientation: 'landscape',
      viewWidth: 390,
      log: ['error: boom (index.js:12)'],
      status: 'done',
      reply: 'Ist drin!',
      doneVersion: '2026-10-12.3',
      seen: JSON.stringify(['open', null, null]),
    },
  ];
}

export default async function uiPolish(t: PlaytestContext): Promise<void> {
  if (!t.viewport.touch) return;
  const { page } = t;
  await page.context().addInitScript((url) => ((window as { __feedbackUrl?: string }).__feedbackUrl = url), FAKE);
  await page.route(`${FAKE}/**`, async (route: Route) => {
    const headers = { 'Access-Control-Allow-Origin': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    // The status check answers what the device already keeps, so the dot stays as seeded.
    const entries = [{ id: 3, status: 'done', reply: 'Ist drin!', doneVersion: '2026-10-12.3' }];
    return route.fulfill({ status: 200, headers, json: { entries } });
  });
  await page.route(`${SCORES_URL}/**`, (route) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
    return route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers }) : route.fulfill({ headers, json: { entries: [] } });
  });

  const fb = () => page.evaluate(() => (window as UiWindow).__ui!.feedback()) as Promise<FeedbackDebug>;
  const screen = () => page.evaluate(() => (window as UiWindow).__ui!.layout().screen);
  const sheet = page.locator(SHEET);
  const sheetButton = (name: string | RegExp) => sheet.getByRole('button', { name, exact: typeof name === 'string' });
  const tap = async (r: Rect | null | undefined) => {
    if (!r) return;
    await t.realTapView(...mid(r));
    await t.game.step(3);
  };
  const resize = async (size: { width: number; height: number }) => {
    await page.setViewportSize(size);
    await t.wait(150);
    await t.game.step(4);
  };

  async function freshTitle(size: { width: number; height: number }): Promise<void> {
    await page.setViewportSize(size);
    await page.evaluate((reports) => {
      localStorage.setItem('cannstatt-cruiser:feedbackSent', JSON.stringify(reports));
      localStorage.removeItem('cannstatt-cruiser:feedbackCheckedAt');
    }, seed());
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__game));
    await t.game.pause();
    await dismissRotateHint(t);
    await adultMode(t);
    await t.game.step(3);
  }

  // Landscape, 320 px view: the form with the tab dot and the log toggle.
  await freshTitle(LANDSCAPE_320);
  t.check('landscape: the view is 320 px wide', (await t.game.display()).viewWidth === 320, await t.game.display());
  await tap((await screen())?.feedback);
  const form = await fb();
  t.check('landscape 320: the form shows with the red dot on "Mein Feedback"', form.open && form.page === 'form' && form.dot, form.page);
  await t.canvasShot('landscape 320 form with dot', 6);

  // Portrait, 320 px: the sheet's tabs, the details, what was sent, the confirm.
  await resize(PORTRAIT_320);
  const tabLines = await page.evaluate((sel) => {
    const buttons = [...document.querySelectorAll<HTMLElement>(`${sel} button`)].filter((b) => b.offsetParent && /^(Neu|Mein Feedback)/.test(b.textContent ?? ''));
    return buttons.map((b) => {
      const range = document.createRange();
      range.selectNodeContents(b.firstChild!);
      return { text: b.textContent, lines: new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size };
    });
  }, SHEET);
  t.check('portrait 320: the tabs stay on one line', tabLines.length === 2 && tabLines.every((b) => b.lines === 1), tabLines);
  await t.screenshot('portrait 320 neu tabs');
  await sheetButton(/^Mein Feedback/).tap();
  await t.game.step(3);
  await t.screenshot('portrait 320 mein feedback');
  await sheetButton(/Umgesetzt/).first().tap();
  await t.game.step(3);
  const versions = await page.evaluate((sel) => {
    const parts = [...document.querySelectorAll<HTMLElement>(`${sel} span`)].filter((el) => /^\d{4}-\d{2}-\d{2}\.\d+$/.test(el.textContent ?? ''));
    return parts.map((el) => ({ text: el.textContent, lines: new Set([...el.getClientRects()].map((r) => Math.round(r.top))).size }));
  }, SHEET);
  t.check('portrait 320: every version on the details is on one line', versions.length >= 2 && versions.every((v) => v.lines === 1), versions);
  await t.screenshot('portrait 320 details');
  await sheetButton('Ansehen').tap();
  await t.game.step(3);
  await t.screenshot('portrait 320 das wurde gesendet');
  await sheetButton('Zurück').tap();
  await t.game.step(3);
  await sheetButton('Löschen').tap();
  await t.game.step(3);
  const gap = await page.evaluate((sel) => {
    const root = document.querySelector<HTMLElement>(sel)!;
    const yes = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Ja, löschen')!.getBoundingClientRect();
    const panel = root.querySelector('[aria-label="Feedback"] > div[style*="relative"]')?.getBoundingClientRect() ?? null;
    return { panelBottom: panel?.bottom ?? null, buttonsTop: yes.top, panelH: panel?.height ?? null, h: window.innerHeight };
  }, SHEET);
  t.check('portrait 320: the confirm panel sits right over its buttons, no tall empty panel', gap.panelBottom !== null && gap.buttonsTop - gap.panelBottom <= 16 && (gap.panelH ?? 0) < gap.h / 2, gap);
  await t.screenshot('portrait 320 wirklich loeschen');
  await resize(PORTRAIT_390);
  await t.screenshot('portrait 390 wirklich loeschen');
  await resize(LANDSCAPE_320);
  t.check('landscape 320: the confirm stays open on the canvas', (await fb()).page === 'confirm');
  await t.canvasShot('landscape 320 wirklich loeschen', 6);
  await page.keyboard.press('Escape');
  await t.game.step(3);
  await page.keyboard.press('Escape');
  await t.game.step(3);
  await page.keyboard.press('Escape');
  await t.game.step(3);
  if ((await fb()).open) await tap((await fb()).pageLayout?.close ?? (await fb()).form.close);

  // The rotate screen on the title at three portrait sizes.
  for (const [label, size] of [
    ['320', PORTRAIT_320],
    ['390', PORTRAIT_390],
    ['tablet', TABLET],
  ] as const) {
    await page.setViewportSize(LANDSCAPE_320);
    await t.wait(100);
    await t.game.step(3);
    await resize(size);
    const m = await page.evaluate((sel) => {
      const root = document.querySelector<HTMLElement>(sel);
      if (!root || getComputedStyle(root).display === 'none') return null;
      const [, arrow, phone] = [...root.querySelectorAll('canvas')].map((c) => c.getBoundingClientRect());
      const button = root.querySelector('button')!.getBoundingClientRect();
      return { arrowCentre: arrow!.left + arrow!.width / 2, phoneCentre: phone!.left + phone!.width / 2, screenCentre: window.innerWidth / 2, arrowBottom: arrow!.bottom, phoneTop: phone!.top, button: button.height };
    }, ROTATE);
    t.check(`rotate ${label}: shown`, m !== null, m);
    if (!m) continue;
    t.check(`rotate ${label}: arrow and phone on one centre line in the middle`, Math.abs(m.arrowCentre - m.phoneCentre) <= 1 && Math.abs(m.phoneCentre - m.screenCentre) <= 1, m);
    t.check(`rotate ${label}: button ${label === 'tablet' ? 'taller than on phones' : 'at least 48 CSS px'}`, label === 'tablet' ? m.button >= 72 : m.button >= 48, m.button);
    await t.screenshot(`rotate ${label}`);
  }
  await page.setViewportSize(t.viewport.options.viewport!);
  await t.wait(150);
}
