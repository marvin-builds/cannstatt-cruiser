/**
 * The text forms in portrait (ROADMAP 58) in the installed app, which frees
 * portrait while the player types (ROADMAP 54). The installed app is faked
 * (display-mode standalone, a recording screen.orientation.lock); feedback
 * goes to a FAKE endpoint (window.__feedbackUrl, intercepted) and the online
 * list is faked by a route (an empty list, POST answered 503): nothing
 * reaches the live worker.
 *
 * - Feedback opened in landscape, typed, the phone turned to portrait: the
 *   full-screen sheet shows with the text and the keyboard focus; text >= 16
 *   CSS px, buttons >= 48 CSS px, a tall field; turned back: the canvas form
 *   with the text and the focus; turned to portrait again: Idee / Fehler, the
 *   log box, Senden (the body carries the log); the sheet stays with the
 *   thanks on "Mein Feedback" (ROADMAP 75) until "Schließen", which shows the
 *   full-screen settle cover right away and during the turn back to landscape
 *   (the fake lock only records, so the test turns the viewport), and then
 *   the full-size canvas.
 * - Game over in portrait: "Eintragen" opens the name entry as a sheet; a
 *   typed name is sent to the fake list.
 *
 * Touch viewports only; a desktop viewport skips the scenario.
 *
 *   npm run playtest -- --scenario scripts/scenarios/portrait-forms.ts --viewports phone-landscape --name portrait-forms
 */
import type { Route } from 'playwright';
import { SCORES_URL } from '../../src/net/api';
import type { Rect } from '../../src/types';
import type { UiDebugHook } from '../../src/ui/debug';
import { adultMode, dismissRotateHint, type PlaytestContext } from '../playtest-lib';

const FAKE = 'https://feedback.example.test';
type UiWindow = Window & { __ui?: UiDebugHook; __locks?: string[] };
const centre = (r: Rect) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)] as const;
const FEEDBACK_SHEET = '[role=dialog][aria-label="Feedback"]';
const ENTRY_SHEET = '[role=dialog][aria-label="Eintragen"]';

/** What a sheet looks like in CSS px: its box, the smallest text, the lowest button, the text field's height. */
async function measure(t: PlaytestContext, selector: string) {
  return t.page.evaluate((sel) => {
    const root = document.querySelector<HTMLElement>(sel)!;
    const box = root.getBoundingClientRect();
    const visible = (el: Element) => (el as HTMLElement).offsetParent !== null || getComputedStyle(el).position === 'fixed';
    const all = [root, ...root.querySelectorAll<HTMLElement>('*')].filter(visible);
    const texts = all.filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()));
    const field = root.querySelector('textarea, input[type=text]')!;
    return {
      box: { x: box.x, y: box.y, w: box.width, h: box.height },
      win: { w: window.innerWidth, h: window.innerHeight },
      minFont: Math.min(...[...texts, field].map((el) => parseFloat(getComputedStyle(el).fontSize))),
      minButton: Math.min(...[...root.querySelectorAll('button')].filter(visible).map((b) => b.getBoundingClientRect().height)),
      fieldH: field.getBoundingClientRect().height,
      focused: document.activeElement === field,
      value: (field as HTMLInputElement).value,
    };
  }, selector);
}

async function turn(t: PlaytestContext, width: number, height: number): Promise<void> {
  await t.page.setViewportSize({ width, height });
  await t.wait(250);
  await t.game.step(3);
}

export default async function portraitForms(t: PlaytestContext): Promise<void> {
  const { page } = t;
  // The installed app turning in the hand: only touch viewports tap and turn.
  if (!t.viewport.touch) {
    await t.log('skipped: needs a touch viewport (phone-landscape)');
    return;
  }
  const bodies: Record<string, unknown>[] = [];
  const posts: string[] = [];
  let listAnswers = 0;
  // tsx keeps function names with a __name helper, which page.evaluate bodies then call.
  await page.context().addInitScript('window.__name = (f) => f;');
  await page.context().addInitScript((url) => {
    (window as { __feedbackUrl?: string }).__feedbackUrl = url;
    // The installed app: standalone display mode, and an orientation lock that only records.
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q: string) => (q.includes('display-mode: standalone') ? ({ ...real(q), matches: true, media: q } as MediaQueryList) : real(q));
    const locks: string[] = ((window as UiWindow).__locks = []);
    Object.defineProperty(screen.orientation, 'lock', { value: (o: string) => (locks.push(o), Promise.resolve()), configurable: true });
  }, FAKE);
  await page.route(`${FAKE}/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
    const headers = { 'Access-Control-Allow-Origin': '*' };
    const body = JSON.parse(req.postData() ?? 'null');
    // The status check of "Mein Feedback": the kept report is open.
    if (new URL(req.url()).pathname === '/feedback/status') return route.fulfill({ headers, json: { entries: body.items.map(({ id }: { id: number }) => ({ id, status: 'open', reply: null, doneVersion: null })) } });
    bodies.push(body);
    return route.fulfill({ status: 201, headers, json: { ok: true, id: bodies.length } });
  });
  await page.route(`${SCORES_URL}/**`, (route) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
    const method = route.request().method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (method === 'POST') {
      posts.push(route.request().postData() ?? '');
      return route.fulfill({ status: 503, headers });
    }
    // The first list request fails: the game logs it, so the error log has a line to send (ROADMAP 70).
    if (listAnswers++ === 0) return route.fulfill({ status: 503, headers });
    return route.fulfill({ headers, json: { entries: [] } });
  });
  await turn(t, 844, 390);
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__game));
  await t.game.pause();
  await adultMode(t);
  // A run start asks for the online list (the failing first answer), then back to the title.
  await t.game.startRun();
  await t.game.step(10);
  await t.wait(200);
  await t.game.endRun();
  await t.game.step(60);
  await page.keyboard.press('Escape');
  await t.game.step(5);
  t.check('the installed app is faked', (await t.game.state()).install.standalone);

  // Landscape: the canvas form, typed into.
  const layout = () => page.evaluate(() => (window as UiWindow).__ui!.layout());
  const icon = (await layout()).screen?.feedback;
  t.check('title offers feedback', !!icon);
  if (!icon) return;
  await t.realTapView(...centre(icon));
  await t.game.step(3);
  const canvasField = page.locator('body > textarea');
  await canvasField.tap();
  await page.keyboard.type('Ich bleibe hängen', { delay: 5 });
  await t.game.step(2);
  await t.screenshot('landscape form typed');

  // Turned to portrait while typing: the sheet with the text and the focus.
  await turn(t, 390, 844);
  t.check('portrait freed while typing', (await page.evaluate(() => (window as UiWindow).__locks!)).includes('any'));
  const sheet = page.locator(FEEDBACK_SHEET);
  t.check('portrait: the feedback sheet shows, the canvas field is hidden', (await sheet.isVisible()) && !(await canvasField.isVisible()));
  let m = await measure(t, FEEDBACK_SHEET);
  t.check('portrait: the sheet keeps the text and the focus', m.value === 'Ich bleibe hängen' && m.focused, m);
  t.check('portrait: the sheet fills the screen', m.box.x === 0 && m.box.y === 0 && m.box.w === m.win.w && m.box.h === m.win.h, m);
  t.check('portrait: text >= 16 CSS px, buttons >= 48 CSS px, a tall field', m.minFont >= 16 && m.minButton >= 48 && m.fieldH >= 0.4 * m.win.h, m);
  await t.screenshot('portrait sheet after the turn');
  await page.keyboard.type(' an der Bank', { delay: 5 });
  await t.game.step(2);

  // And back: the canvas form with the text and the focus.
  await turn(t, 844, 390);
  const back = await page.evaluate(() => {
    const el = document.querySelector<HTMLTextAreaElement>('body > textarea')!;
    return { value: el.value, focused: document.activeElement === el };
  });
  const flowText = (await page.evaluate(() => (window as UiWindow).__ui!.feedback()))!.text;
  t.check('back in landscape: the canvas form keeps the text and the focus', back.value === 'Ich bleibe hängen an der Bank' && flowText === back.value && back.focused && !(await sheet.isVisible()), { back, flowText });
  await t.screenshot('back in landscape');

  // Portrait again: the sheet's buttons work, the report goes to the fake endpoint.
  await turn(t, 390, 844);
  await sheet.getByRole('button', { name: 'Idee' }).tap();
  await t.game.step(2);
  const log = sheet.locator('label');
  t.check('Idee: no log box', (await page.evaluate(() => (window as UiWindow).__ui!.feedback()!.kind)) === 'idea' && !(await log.isVisible()));
  await sheet.getByRole('button', { name: 'Fehler' }).tap();
  await t.game.step(2);
  await log.locator('input').tap();
  await t.game.step(2);
  t.check('Fehler: the log box ticked', (await page.evaluate(() => (window as UiWindow).__ui!.feedback()!.withLog)) === true);
  await t.screenshot('portrait sheet with log');
  await sheet.getByRole('button', { name: 'Senden' }).tap();
  await page.waitForFunction(() => (window as UiWindow).__ui!.feedback()!.status !== 'sending', undefined, { timeout: 8000 }).catch(() => {});
  await t.game.step(3);
  const body = bodies[0] ?? {};
  t.check('Senden posts one bug report with the log to the fake endpoint', bodies.length === 1 && body.kind === 'bug' && body.text === 'Ich bleibe hängen an der Bank' && Array.isArray(body.log) && (body.log as string[]).length > 0, body);
  const thanked = (await sheet.getByText('Danke für dein Feedback!').filter({ visible: true }).count()) === 1;
  const after = await page.evaluate(() => (window as UiWindow).__ui!.feedback()!);
  t.check('sent: the sheet stays with the thanks on Mein Feedback, the report on top (ROADMAP 75)', thanked && after.open && after.page === 'list' && after.rows[0]?.fresh === true, after);
  t.check('sent: the keyboard went down, portrait still free', (await page.evaluate(() => document.activeElement?.tagName)) !== 'TEXTAREA' && (await page.evaluate(() => (window as UiWindow).__locks!.at(-1))) === 'any');
  await t.screenshot('portrait sent thanks on mein feedback');
  await t.game.step(30);
  t.check('sent: still open until the player closes it', await sheet.isVisible());

  // Closing (ROADMAP 75): the cover in the game colours hides the turn back to landscape until the size settled.
  await sheet.getByRole('button', { name: 'Schließen' }).tap();
  await t.game.step(2);
  const cover = page.locator('[data-settle-cover]');
  const covering = async () =>
    page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('[data-settle-cover]');
      const box = el?.getBoundingClientRect();
      return { shown: !!el && getComputedStyle(el).display !== 'none', full: !!box && box.x <= 0 && box.y <= 0 && box.right >= innerWidth && box.bottom >= innerHeight };
    });
  let c = await covering();
  t.check('closed: the sheet is gone, landscape is locked again', !(await sheet.isVisible()) && (await page.evaluate(() => (window as UiWindow).__locks!.at(-1))) === 'landscape');
  t.check('closed: right after, the full-screen cover in the game colours', c.shown && c.full, c);
  await t.screenshot('portrait closed right after');
  // The installed app turns (the fake lock only records, so the test turns the viewport) and the size settles.
  await page.setViewportSize({ width: 844, height: 390 });
  await t.wait(100);
  c = await covering();
  t.check('closed: during the turn the cover still shows in full', c.shown && c.full, c);
  await t.screenshot('portrait closed during the settle');
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-settle-cover]')!).display === 'none', undefined, { timeout: 4000 }).catch(() => {});
  await t.game.step(3);
  const canvas = (await page.locator('#game').boundingBox())!;
  t.check('settled: the cover is gone, the canvas fills the landscape screen', !(await cover.isVisible()) && canvas.width >= 0.9 * 844 && canvas.height >= 0.9 * 390, canvas);
  await t.screenshot('portrait closed settled in landscape');
  await turn(t, 390, 844);

  // Game over in portrait: the name entry as a sheet.
  await dismissRotateHint(t);
  await t.game.startRun();
  await t.game.step(30);
  await t.game.setScore(4321);
  await t.game.endRun();
  await t.game.step(60);
  const submit = (await layout()).screen?.submit;
  t.check('game over offers Eintragen', !!submit, (await t.game.state()).mode);
  if (!submit) return;
  await t.realTapView(...centre(submit));
  await t.game.step(3);
  const entry = page.locator(ENTRY_SHEET);
  m = await measure(t, ENTRY_SHEET);
  t.check('the name entry shows as the sheet, focused, readable and tappable', (await entry.isVisible()) && m.focused && m.minFont >= 16 && m.minButton >= 48, m);
  await page.keyboard.type('Rollo', { delay: 5 });
  await t.game.step(2);
  await t.screenshot('portrait name entry');
  await entry.getByRole('button', { name: 'Als Rollo eintragen' }).tap();
  await t.wait(300);
  await t.game.step(5);
  t.check('the name goes to the fake list only', posts.length === 1 && posts[0]!.includes('Rollo'), posts);
  t.check('the entry sheet is gone after sending', !(await entry.isVisible()));
  await t.screenshot('after the entry');
  // Still in portrait (the device ignores the lock): the cover gives up after its longest wait.
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-settle-cover]')!).display === 'none', undefined, { timeout: 4000 }).catch(() => {});
  t.check('a lock the device ignores: the cover goes after its longest wait', !(await page.locator('[data-settle-cover]').isVisible()));
}
