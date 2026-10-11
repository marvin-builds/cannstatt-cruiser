/**
 * The rotate screen in portrait (ROADMAP 73), in a plain browser tab (not the
 * installed app). Feedback goes to a FAKE endpoint (window.__feedbackUrl,
 * intercepted) and the online list is faked by a route (an empty list, POST
 * answered 503): nothing reaches the live worker.
 *
 * - The full-screen overlay at 320x568, 390x844 and a tablet (820x1180): logo,
 *   phone, "Bitte Gerät drehen", the reason >= 16 CSS px, "Trotzdem weiter"
 *   >= 48 CSS px, nothing clipped; the phone turns, and stays still under
 *   prefers-reduced-motion.
 * - "Trotzdem weiter" dismisses it without starting a run; a turn to landscape
 *   and back brings it again; a run turned to portrait pauses under it.
 * - Turned to portrait during the feedback form and during the name entry: the
 *   portrait sheet shows at once, with no rotate screen and no extra tap;
 *   closing the sheet in portrait brings the rotate screen.
 *
 * Touch viewports only; a desktop viewport skips the scenario.
 *
 *   npm run playtest -- --scenario scripts/scenarios/rotate-screen.ts --viewports phone-portrait --name rotate-screen
 */
import type { Route } from 'playwright';
import { SCORES_URL } from '../../src/net/api';
import type { Rect } from '../../src/types';
import type { UiDebugHook } from '../../src/ui/debug';
import { adultMode, type PlaytestContext } from '../playtest-lib';

const FAKE = 'https://feedback.example.test';
type UiWindow = Window & { __ui?: UiDebugHook };
const centre = (r: Rect) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)] as const;
const ROTATE = '[role=dialog][aria-label="Bitte Gerät drehen"]';
const FEEDBACK_SHEET = '[role=dialog][aria-label="Feedback"]';
const ENTRY_SHEET = '[role=dialog][aria-label="Eintragen"]';
const SIZES = [
  [320, 568],
  [390, 844],
  [820, 1180],
] as const;

/** The overlay in CSS px: its box, every part inside the window, the text sizes, the button, the phone's animation. */
async function measure(t: PlaytestContext) {
  return t.page.evaluate((sel) => {
    const root = document.querySelector<HTMLElement>(sel)!;
    const rect = (el: Element) => el.getBoundingClientRect();
    const box = rect(root);
    const parts = [...root.children].map(rect);
    const heading = root.querySelector('h2')!;
    const reason = [...root.querySelectorAll('div')].find((d) => d.textContent === 'Im Querformat fährt es sich besser.')!;
    const button = root.querySelector('button')!;
    const canvases = [...root.querySelectorAll('canvas')];
    return {
      box: { x: box.x, y: box.y, w: box.width, h: box.height },
      win: { w: window.innerWidth, h: window.innerHeight },
      inside: parts.every((r) => r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth + 0.5 && r.bottom <= window.innerHeight + 0.5),
      overflow: root.scrollHeight - root.clientHeight,
      headingPx: parseFloat(getComputedStyle(heading).fontSize),
      reasonPx: parseFloat(getComputedStyle(reason).fontSize),
      button: { text: button.textContent, h: rect(button).height },
      pixelated: canvases.length === 3 && canvases.every((c) => getComputedStyle(c).imageRendering === 'pixelated'),
      turning: canvases.some((c) => c.getAnimations().some((a) => a.playState === 'running')),
    };
  }, ROTATE);
}

async function size(t: PlaytestContext, width: number, height: number): Promise<void> {
  await t.page.setViewportSize({ width, height });
  await t.wait(250);
  await t.game.step(3);
}

const visible = (t: PlaytestContext, sel: string) => t.page.locator(sel).isVisible();

export default async function rotateScreen(t: PlaytestContext): Promise<void> {
  const { page } = t;
  if (!t.viewport.touch) {
    await t.log('skipped: needs a touch viewport (phone-portrait)');
    return;
  }
  // tsx keeps function names with a __name helper, which page.evaluate bodies then call.
  await page.context().addInitScript('window.__name = (f) => f;');
  await page.context().addInitScript((url) => void ((window as { __feedbackUrl?: string }).__feedbackUrl = url), FAKE);
  await page.route(`${FAKE}/**`, (route: Route) => route.fulfill({ status: 201, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' }));
  await page.route(`${SCORES_URL}/**`, (route) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
    const method = route.request().method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (method === 'POST') return route.fulfill({ status: 503, headers });
    return route.fulfill({ headers, json: { entries: [] } });
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__game));
  await t.game.pause();
  await adultMode(t);
  await t.game.step(3);

  // The overlay on a small phone, a big phone and a tablet.
  for (const [w, h] of SIZES) {
    await size(t, w, h);
    const m = await measure(t);
    t.check(`${w}x${h}: the rotate screen fills the screen`, (await visible(t, ROTATE)) && m.box.x === 0 && m.box.y === 0 && m.box.w === m.win.w && m.box.h === m.win.h, m);
    t.check(`${w}x${h}: nothing clipped, no scrolling`, m.inside && m.overflow <= 0, m);
    t.check(`${w}x${h}: large title, reason >= 16 CSS px, "Trotzdem weiter" >= 48 CSS px`, m.headingPx >= 28 && m.reasonPx >= 16 && m.button.text === 'Trotzdem weiter' && m.button.h >= 48, m);
    t.check(`${w}x${h}: crisp pixel art (logo, phone, arrow), the phone turns`, m.pixelated && m.turning, m);
    await t.screenshot(`rotate screen ${w}x${h}`);
  }

  // Reduced motion: the phone stands still.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await t.game.step(2);
  t.check('reduced motion: the phone stands still', !(await measure(t)).turning);
  await t.screenshot('rotate screen reduced motion');
  await page.emulateMedia({ reducedMotion: null });
  await t.game.step(2);

  // "Trotzdem weiter": gone, no run started; landscape and back brings it again.
  await page.locator(ROTATE).getByRole('button', { name: 'Trotzdem weiter' }).tap();
  await t.game.step(3);
  t.check('"Trotzdem weiter" dismisses it, no run starts', !(await visible(t, ROTATE)) && (await t.game.state()).mode === 'title');
  await t.screenshot('title after Trotzdem weiter');
  await size(t, 844, 390);
  t.check('landscape: no rotate screen', !(await visible(t, ROTATE)));
  await size(t, 390, 844);
  t.check('portrait again: the rotate screen is back', await visible(t, ROTATE));
  // A tap anywhere dismisses too.
  await t.realTapView(20, 20);
  await t.game.step(3);
  t.check('a tap anywhere dismisses it, no run starts', !(await visible(t, ROTATE)) && (await t.game.state()).mode === 'title');

  // The feedback form: turned to portrait, the sheet at once; closed in portrait, the rotate screen.
  await size(t, 844, 390);
  const layout = () => page.evaluate(() => (window as UiWindow).__ui!.layout());
  const icon = (await layout()).screen?.feedback;
  t.check('title offers feedback', !!icon, (await t.game.state()).mode);
  if (icon) {
    await t.realTapView(...centre(icon));
    await t.game.step(3);
    await size(t, 390, 844);
    t.check('feedback form turned to portrait: the sheet at once, no rotate screen', (await visible(t, FEEDBACK_SHEET)) && !(await visible(t, ROTATE)));
    await t.screenshot('feedback sheet after the turn');
    await page.locator(FEEDBACK_SHEET).getByRole('button', { name: 'Schließen' }).tap();
    await t.game.step(3);
    t.check('feedback closed in portrait: the rotate screen', !(await visible(t, FEEDBACK_SHEET)) && (await visible(t, ROTATE)));
    await t.screenshot('rotate screen after closing feedback');
  }

  // A run turned to portrait pauses under it.
  await size(t, 844, 390);
  await t.game.startRun();
  await t.game.step(20);
  await size(t, 390, 844);
  t.check('a run turned to portrait pauses under the rotate screen', (await visible(t, ROTATE)) && (await t.game.state()).mode === 'paused');
  await t.screenshot('paused run under the rotate screen');
  await size(t, 844, 390);
  t.check('landscape: the pause screen without the rotate screen', !(await visible(t, ROTATE)) && (await t.game.state()).mode === 'paused');
  await page.evaluate(() => window.__game!.resumeGame());
  await t.game.step(2);

  // The name entry: turned to portrait, the sheet at once; closed in portrait, the rotate screen over game over.
  await t.game.setScore(4321);
  await t.game.endRun();
  await t.game.step(60);
  const submit = (await layout()).screen?.submit;
  t.check('game over offers Eintragen', !!submit, (await t.game.state()).mode);
  if (!submit) return;
  await t.realTapView(...centre(submit));
  await t.game.step(3);
  await size(t, 390, 844);
  t.check('name entry turned to portrait: the sheet at once, no rotate screen', (await visible(t, ENTRY_SHEET)) && !(await visible(t, ROTATE)));
  await t.screenshot('entry sheet after the turn');
  await page.locator(ENTRY_SHEET).getByRole('button', { name: 'Abbrechen' }).tap();
  await t.game.step(3);
  t.check('entry closed in portrait: the rotate screen over game over', !(await visible(t, ENTRY_SHEET)) && (await visible(t, ROTATE)) && (await t.game.state()).mode === 'gameover');
  await t.screenshot('rotate screen after closing the entry');
}
