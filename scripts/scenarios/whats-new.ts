/**
 * "Neu in dieser Version" for a returning player who missed many versions
 * (ROADMAP 59), and the "Neu laden" card on 2:1 landscape titles.
 *
 * - The stored last-seen version is old: the screen lists the newest 10
 *   entries with all their items (more than 6) under version headings.
 * - The list scrolls by mouse wheel (desktop) or a touch drag (phones), by
 *   arrow keys and End / Home, with a scroll bar; a tap on the list keeps the
 *   screen, "Weiter" closes it. Screenshots at a 320 px wide view and at the
 *   viewport's own size, landscape and portrait.
 * - The title at 800x400 and 844x390 with an update ready (forced with
 *   simulateUpdateReady), on phones also with the install card: the reload
 *   card shows.
 * - In portrait the list is a full-screen DOM sheet (whats-new-sheet.ts): the
 *   same checks on the sheet, with text >= 16 CSS px and "Weiter" >= 48 CSS px.
 *
 *   npm run playtest -- --scenario scripts/scenarios/whats-new.ts --viewports desktop,phone-landscape,phone-portrait --name whats-new
 */
import type { CDPSession } from 'playwright';
import type { Rect } from '../../src/types';
import type { UiDebugHook, WhatsNewDebug } from '../../src/ui/debug';
import { dismissRotateHint, type PlaytestContext, viewToClient } from '../playtest-lib';

type UiWindow = Window & { __ui?: UiDebugHook };
const centre = (r: Rect) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)] as const;

/** An old last-seen version: every entry since is new to the player. */
const OLD_VERSION = '2026-10-08.1';

async function showWhatsNew(t: PlaytestContext): Promise<void> {
  await t.page.evaluate((v) => localStorage.setItem('cannstatt-cruiser:lastSeenVersion', JSON.stringify(v)), OLD_VERSION);
  await t.page.reload();
  await t.page.waitForFunction(() => Boolean(window.__game));
  await t.game.pause();
  await dismissRotateHint(t);
  await t.game.step(2);
}

const SHEET = '[role=dialog][aria-label="Neu in dieser Version"]';
const SHEET_LIST = `${SHEET} > div > div[aria-label]`;

const list = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.whatsNew()) as Promise<WhatsNewDebug | null>;

/** A one-finger drag between client points (from.y > to.y scrolls the list down). */
async function drag(t: PlaytestContext, cdp: CDPSession, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
  for (let i = 1; i <= 8; i++) {
    const p = { x: from.x, y: from.y + ((to.y - from.y) * i) / 8 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...p, id: 1 }] });
    await t.game.step(1);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await t.game.step(2);
}

async function checkList(t: PlaytestContext, label: string): Promise<void> {
  const { page } = t;
  await showWhatsNew(t);
  const d = await t.game.display();
  const state = await t.game.state();
  const items = state.whatsNew.reduce((n, e) => n + e.items.length, 0);
  let l = await list(t);
  t.check(`${label}: the screen shows the last 10 entries with all their items`, !!l && state.whatsNew.length === 10 && items > 6 && l.headings >= 10, { entries: state.whatsNew.length, items, l });
  if (!l) return;
  const portrait = d.portrait;
  t.check(`${label}: ${portrait ? 'portrait shows the full-screen sheet' : 'landscape shows the canvas list'}`, l.sheet === portrait, l);
  t.check(`${label}: the list overflows and scrolls`, l.maxScroll > 0 && l.offset === 0, l);
  if (l.sheet) {
    const m = await page.evaluate((sel) => {
      const root = document.querySelector<HTMLElement>(sel)!;
      const texts = [...root.querySelectorAll<HTMLElement>('h2, li, div, button')].filter((el) => el.childNodes[0]?.nodeType === Node.TEXT_NODE);
      const next = root.querySelector('button')!.getBoundingClientRect();
      const box = root.getBoundingClientRect();
      return { minFont: Math.min(...texts.map((el) => parseFloat(getComputedStyle(el).fontSize))), next: next.height, box: [box.width, box.height], view: [innerWidth, innerHeight] };
    }, SHEET);
    t.check(`${label}: the sheet fills the screen, text >= 16 CSS px, Weiter >= 48 CSS px`, m.minFont >= 16 && m.next >= 48 && m.box[0] === m.view[0] && m.box[1] === m.view[1], m);
  }
  await t.screenshot(`${label} top (view ${d.viewWidth})`);
  if (!l.sheet) await t.canvasShot(`${label} top`);

  const [x, y] = centre(l.list);
  const box = l.sheet ? (await page.locator(SHEET_LIST).boundingBox())! : null;
  const at = async (fx: number, fy: number) => (box ? { x: box.x + box.width * fx, y: box.y + box.height * fy } : viewToClient(page, x, y + (fy - 0.5) * 80));
  if (t.viewport.touch) {
    const cdp = await page.context().newCDPSession(page);
    await drag(t, cdp, await at(0.5, 0.75), await at(0.5, 0.25));
    await cdp.detach();
  } else {
    const p = await at(0.5, 0.5);
    await page.mouse.move(p.x, p.y);
    await page.mouse.wheel(0, 120);
    await t.wait(50);
    await t.game.step(2);
  }
  l = (await list(t))!;
  t.check(`${label}: ${t.viewport.touch ? 'a touch drag' : 'the mouse wheel'} scrolls the list`, l.offset > 0, l);
  if (l.sheet) await t.screenshot(`${label} scrolled`);
  else await t.canvasShot(`${label} scrolled`);
  await page.keyboard.press('Home');
  await t.game.step(2);
  await page.keyboard.press('ArrowDown');
  await t.game.step(1);
  const afterArrow = (await list(t))!.offset;
  await page.keyboard.press('End');
  await t.game.step(2);
  l = (await list(t))!;
  t.check(`${label}: arrow down and End scroll, End to the bottom`, afterArrow > 0 && Math.abs(l.offset - l.maxScroll) <= 1, { afterArrow, l });
  await t.screenshot(`${label} bottom`);
  if (!l.sheet) await t.canvasShot(`${label} bottom`);
  if (l.sheet) {
    const p = await at(0.5, 0.5);
    await (t.viewport.touch ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y));
  } else await t.realTapView(x, y);
  await t.game.step(3);
  t.check(`${label}: a tap on the list keeps the screen`, (await list(t)) !== null && (await t.game.state()).whatsNew.length === 10);
  if (l.sheet) {
    const next = page.locator(SHEET).getByRole('button', { name: 'Weiter' });
    await (t.viewport.touch ? next.tap() : next.click());
  } else {
    const next = (await page.evaluate(() => (window as UiWindow).__ui!.layout())).screen?.next ?? null;
    t.check(`${label}: Weiter is there`, !!next);
    if (next) await t.realTapView(...centre(next));
  }
  await t.game.step(3);
  const after = await t.game.state();
  t.check(`${label}: Weiter closes it, back on the title`, after.whatsNew.length === 0 && after.mode === 'title', { mode: after.mode });
  if (l.sheet) t.check(`${label}: the sheet is gone`, !(await page.locator(SHEET).isVisible()));
}

async function reloadCard(t: PlaytestContext, width: number, height: number): Promise<void> {
  await t.page.setViewportSize({ width, height });
  await t.wait(200);
  await t.game.step(2);
  await t.page.evaluate(() => window.__game!.simulateUpdateReady());
  if (t.viewport.touch) await t.game.simulateInstall({ canPrompt: true, visits: 3, dismissed: false, standalone: false });
  await t.game.step(3);
  const screen = (await t.page.evaluate(() => (window as UiWindow).__ui!.layout())).screen;
  const d = await t.game.display();
  t.check(`${width}x${height}: the title shows "Neu laden" with the update ready`, !!screen?.reload, { viewWidth: d.viewWidth, screen });
  await t.screenshot(`title ${width}x${height} update ready`);
}

export default async function whatsNew(t: PlaytestContext): Promise<void> {
  const size = t.page.viewportSize()!;
  // The narrowest view (320 px wide) in the viewport's orientation, then the viewport itself.
  const narrow = size.width > size.height ? { width: 640, height: 360 } : { width: 320, height: 700 };
  await t.page.setViewportSize(narrow);
  await checkList(t, `${narrow.width}x${narrow.height}`);
  await t.page.setViewportSize(size);
  await checkList(t, `${size.width}x${size.height}`);
  if (size.width > size.height) {
    await reloadCard(t, 800, 400);
    await reloadCard(t, 844, 390);
  }
}
