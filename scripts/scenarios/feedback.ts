/**
 * Player feedback (ROADMAP 50) end to end against a FAKE endpoint: the base
 * URL is injected (window.__feedbackUrl) and intercepted, nothing reaches the
 * live worker. The title's speech-bubble icon and the pause menu's
 * "Feedback" open the form; text typed into the native textarea never
 * reaches the game (letters like P, E, M, W, S and Space); a bug report
 * with "Fehlerprotokoll mitsenden" sends the log, an idea and an unticked bug
 * report send none; the thank-you, rate-limit and offline states; kid mode
 * offers neither entry. On desktop F opens the form on the title and while
 * riding (pausing the run) without typing an 'f' into the field. Phone
 * landscape runs at 320 view px wide (640 x 360). The 2026-10-11.5 phone bug:
 * with text typed, taps beside the open form (the letterbox, the page
 * corners, the form's background) on the title and in pause only blur the
 * field, never start or resume a run; game over and restart work after it.
 *
 *   npm run playtest -- --scenario scripts/scenarios/feedback.ts --viewports desktop,phone-landscape,phone-portrait --name feedback
 */
import type { Route } from 'playwright';
import type {} from '../../src/player/debug';
import type { Rect } from '../../src/types';
import type { FeedbackDebug, UiDebugHook } from '../../src/ui/debug';
import { adultMode, dismissRotateHint, type PlaytestContext } from '../playtest-lib';

const FAKE = 'https://feedback.example.test';
const FIELDS = ['input', 'kind', 'log', 'orientation', 'platform', 'session', 'text', 'version', 'viewWidth'];
type UiWindow = Window & { __ui?: UiDebugHook };

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const mid = (r: Rect) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)] as const;

export default async function feedback(t: PlaytestContext): Promise<void> {
  const { page } = t;
  const bodies: Record<string, unknown>[] = [];
  let answer: number | 'abort' = 201;
  await page.context().addInitScript((url) => ((window as { __feedbackUrl?: string }).__feedbackUrl = url), FAKE);
  await page.route(`${FAKE}/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
    bodies.push({ ...JSON.parse(req.postData() ?? 'null'), __path: new URL(req.url()).pathname, __type: req.headers()['content-type'] });
    if (answer === 'abort') return route.abort('internetdisconnected');
    return route.fulfill({ status: answer, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' });
  });
  if (t.viewport.name === 'phone-landscape') await page.setViewportSize({ width: 640, height: 360 });
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__game));
  await t.game.pause();
  await dismissRotateHint(t);
  await adultMode(t);
  await t.game.step(3);

  const fb = () => page.evaluate(() => (window as UiWindow).__ui!.feedback()) as Promise<FeedbackDebug>;
  const screen = () => page.evaluate(() => (window as UiWindow).__ui!.layout());
  const tap = async (r: Rect) => {
    await t.realTapView(...mid(r));
    await t.game.step(2);
  };
  /** Types into the textarea like a player: a tap into it on touch (the phone keyboard), focused already on desktop. */
  const type = async (s: string) => {
    if (t.viewport.touch) await page.locator('textarea').tap();
    await page.keyboard.type(s, { delay: 5 });
    await t.game.step(2);
  };
  const sendAndWait = async (form: FeedbackDebug['form']) => {
    const before = bodies.length;
    await tap(form.send);
    await page.waitForFunction((n) => (window as UiWindow).__ui!.feedback()!.status !== 'sending', before, { timeout: 8000 }).catch(() => {});
    await t.game.step(2);
  };
  const { viewWidth } = await t.game.display();

  // Title: the icon bottom right, clear of every other button.
  const title = await screen();
  const icon = title.screen?.feedback ?? null;
  t.check('title shows the feedback icon', icon !== null, title.screen);
  if (!icon) return;
  const others = [...Object.entries(title.screen!), ...Object.entries(title.hud)].filter(([k, r]) => k !== 'feedback' && r) as [string, Rect][];
  t.check('icon clear of the other title buttons', others.every(([, r]) => !overlap(icon, r)), { icon, others });
  t.check('icon in the bottom-right corner', icon.x + icon.w >= viewWidth - 4 && icon.y + icon.h >= 176, { icon, viewWidth });
  await t.canvasShot('title with feedback icon');

  // Desktop: F opens the form with an empty field (the opening key types nothing), also on reopen with a kept draft.
  if (!t.viewport.touch) {
    const area = () => page.locator('textarea').inputValue();
    await page.keyboard.press('KeyF');
    await t.game.step(2);
    t.check('F opens the form on the title', (await fb()).open);
    t.check('F types no letter into the field', (await area()) === '' && (await fb()).text === '', await area());
    await page.keyboard.type('ab', { delay: 5 });
    await page.keyboard.press('Escape');
    await t.game.step(2);
    await page.keyboard.press('KeyF');
    await t.game.step(2);
    t.check('reopening with F keeps the draft as it was', (await area()) === 'ab' && (await fb()).text === 'ab', await area());
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
    await t.game.step(2);
    t.check('draft cleared, form closed', !(await fb()).open && (await fb()).text === '');
  }

  // Open from the title; type a bug report with game keys in it.
  await tap(icon);
  let state = await fb();
  t.check('icon opens the form', state.open && state.kind === 'bug' && !state.withLog, state);
  await t.screenshot('feedback form empty');
  const muted = (await t.game.state()).muted;
  await type('Ich bleibe hängen. pause escape wasd e m');
  const after = await t.game.state();
  state = await fb();
  t.check('typed text arrives in the form', state.text === 'Ich bleibe hängen. pause escape wasd e m', state.text);
  t.check('game keys typed into the textarea do nothing in the game', after.mode === 'title' && after.muted === muted, { mode: after.mode, muted: after.muted });
  await tap(state.form.log);
  state = await fb();
  t.check('log box ticked', state.withLog, state);
  await t.screenshot('fehler with log on');
  await t.canvasShot('fehler with log on');
  t.check('nothing sent before Senden', bodies.length === 0, bodies);

  await sendAndWait(state.form);
  state = await fb();
  t.check('one body sent on Senden', bodies.length === 1, bodies);
  const bug = bodies[0] ?? {};
  t.check('bug body: contract fields only, text/plain to /feedback', JSON.stringify(Object.keys(bug).filter((k) => !k.startsWith('__')).sort()) === JSON.stringify(FIELDS) && bug.__path === '/feedback' && String(bug.__type).startsWith('text/plain'), bug);
  const log = bug.log as string[];
  t.check('bug body with the ticked log, its last line the game state', Array.isArray(log) && log.length >= 1 && /^state: mode title, version .+, view \d+x180$/.test(log[log.length - 1] ?? ''), log);
  t.check('bug body values', bug.kind === 'bug' && /^[0-9a-f]{32}$/.test(String(bug.session)) && bug.viewWidth === viewWidth && bug.input === (t.viewport.touch ? 'touch' : 'keys'), bug);
  t.check('thank-you shows', state.status === 'sent' && state.message === 'Danke für dein Feedback!', state);
  await t.screenshot('thank you');
  await tap(state.form.ok);
  t.check('OK closes it, back on the title', !(await fb()).open && (await t.game.state()).mode === 'title');

  // Pause menu entry: an idea, the run stays paused, keys do not move the skater.
  await t.game.startRun();
  await t.game.step(30);
  await t.game.pauseGame();
  await t.game.step(3);
  const pause = await screen();
  t.check('pause menu has the Feedback button', !!pause.screen?.feedback, pause.screen);
  await t.screenshot('pause menu with feedback');
  await t.canvasShot('pause menu with feedback');
  await tap(pause.screen!.feedback!);
  state = await fb();
  t.check('pause button opens the form (fresh after the sent report)', state.open && state.text === '' && !state.withLog, state);
  await tap(state.form.idea);
  const skater = (await t.game.state()).player;
  await type('Mehr Musik und Brezeln bitte! space p e w s');
  const paused = await t.game.state();
  t.check('typing keeps the run paused, the skater still', paused.mode === 'paused' && paused.player.x === skater.x && paused.player.y === skater.y, { mode: paused.mode, before: skater.y, after: paused.player.y });
  state = await fb();
  t.check('idea chosen, no log box', state.kind === 'idea', state);
  await t.screenshot('idee typed');
  await t.canvasShot('idee typed');
  await sendAndWait(state.form);
  const idea = bodies[1] ?? {};
  t.check('idea body has no log', idea.kind === 'idea' && Array.isArray(idea.log) && (idea.log as string[]).length === 0, idea);
  state = await fb();
  await tap(state.form.ok);
  t.check('back on the pause screen', (await t.game.state()).mode === 'paused' && !(await fb()).open);

  // Rate limit: a bug report without the box ticked (no log), the text stays.
  answer = 429;
  await tap((await screen()).screen!.feedback!);
  await type('Noch ein Fehler');
  state = await fb();
  await sendAndWait(state.form);
  state = await fb();
  const unticked = bodies[2] ?? {};
  t.check('unticked bug report sends no log', unticked.kind === 'bug' && Array.isArray(unticked.log) && (unticked.log as string[]).length === 0, unticked);
  t.check('rate limit message, text kept', state.status === 'rate' && state.text === 'Noch ein Fehler' && state.message === 'Heute schon genug Feedback – danke!', state);
  await t.screenshot('rate limit');

  // Offline: the text stays, the message says so.
  answer = 'abort';
  await sendAndWait(state.form);
  state = await fb();
  t.check('offline message, text kept', state.status === 'offline' && state.text === 'Noch ein Fehler', state);
  await t.canvasShot('offline');

  // Esc closes (on touch the cancel button), the run resumes as before.
  if (t.viewport.touch) await tap(state.form.cancel);
  else {
    await page.keyboard.press('Escape');
    await t.game.step(2);
  }
  t.check('closed, still paused', !(await fb()).open && (await t.game.state()).mode === 'paused');
  t.check('the textarea is hidden again', !(await page.locator('textarea').isVisible()));
  await t.game.resumeGame();
  await t.game.step(5);
  t.check('resume works', (await t.game.state()).mode === 'playing');

  // Desktop: F while riding pauses and opens the form (as the title hint says), the kept draft without an extra letter.
  if (!t.viewport.touch) {
    await page.keyboard.press('KeyF');
    await t.game.step(2);
    state = await fb();
    t.check('F while riding pauses and opens the form', (await t.game.state()).mode === 'paused' && state.open, { mode: (await t.game.state()).mode, open: state.open });
    t.check('F while riding types no letter', (await page.locator('textarea').inputValue()) === 'Noch ein Fehler' && state.text === 'Noch ein Fehler', state.text);
    await t.canvasShot('f while riding');
    await page.keyboard.press('Escape');
    await t.game.step(2);
    await t.game.resumeGame();
    await t.game.step(5);
  }

  // The 2026-10-11.5 phone bug: taps beside the open form start or resume nothing, they only blur the field.
  /** Page points beside the form: the page corners, the letterbox bands (portrait) and the form's background. */
  const besideForm = async (): Promise<[number, number][]> => {
    const box = (await page.locator('#game').boundingBox())!;
    const { width, height } = page.viewportSize()!;
    const k = box.height / 180;
    const points: [number, number][] = [
      [3, 3],
      [width - 4, height - 4],
      [box.x + 3 * k, box.y + 3 * k],
    ];
    if (box.y > 8) points.push([width / 2, box.y / 2]);
    if (box.y + box.height < height - 8) points.push([width / 2, (box.y + box.height + height) / 2]);
    if (box.x > 8) points.push([box.x / 2, height / 2]);
    return points;
  };
  const pageTap = async (x: number, y: number) => {
    if (t.viewport.touch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    await t.game.step(3);
  };
  const fieldFocused = () => page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA');
  const tapBeside = async (where: string, mode: string) => {
    await type(' und noch mehr');
    t.check(`${where}: the field has the focus after typing`, await fieldFocused());
    for (const [x, y] of await besideForm()) await pageTap(x, y);
    await t.game.step(10);
    const now = await t.game.state();
    state = await fb();
    t.check(`${where}: taps beside the form start or resume nothing`, now.mode === mode && state.open, { mode: now.mode, open: state.open, points: await besideForm() });
    t.check(`${where}: the field lost the focus, still shown with the text`, !(await fieldFocused()) && (await page.locator('textarea').isVisible()) && state.text.includes('und noch mehr'), state.text);
    await t.screenshot(`${where} after taps beside the form`);
    await tap(state.form.cancel);
    t.check(`${where}: Abbrechen closes the form`, !(await fb()).open && (await t.game.state()).mode === mode);
  };
  await t.game.pauseGame();
  await t.game.step(3);
  await tap((await screen()).screen!.feedback!);
  await tapBeside('pause', 'paused');
  await t.game.resumeGame();
  await t.game.endRun();
  await t.game.step(60);
  await page.keyboard.press('Escape');
  await t.game.step(5);
  t.check('back on the title', (await t.game.state()).mode === 'title', (await t.game.state()).mode);
  await tap((await screen()).screen!.feedback!);
  await tapBeside('title', 'title');
  // A run, game over with its buttons, and a tap restarts.
  await t.game.startRun();
  await t.game.step(20);
  await t.game.endRun();
  await t.game.step(60);
  const over = await screen();
  t.check('game over shows its buttons', (await t.game.state()).mode === 'gameover' && !!over.screen?.toTitle && !(await fb()).open, over.screen);
  t.check('game over: the textarea is hidden', !(await page.locator('textarea').isVisible()));
  await t.canvasShot('game over after the form');
  await t.realTapView(4, 100);
  await t.game.step(5);
  t.check('a tap on game over restarts', (await t.game.state()).mode === 'playing', (await t.game.state()).mode);

  // Kid mode: neither the title icon nor the pause button nor F.
  await page.evaluate(() => {
    localStorage.setItem('cannstatt-cruiser:kidMode', 'true');
    window.__player!.kidMode(true);
  });
  await t.game.pauseGame();
  await t.game.step(3);
  t.check('kid mode: no pause button', !(await screen()).screen?.feedback);
  await t.game.resumeGame();
  await t.game.endRun();
  await t.game.step(60);
  await page.keyboard.press('Escape');
  await t.game.step(5);
  const kid = await screen();
  t.check('kid mode: no title icon', (await t.game.state()).mode === 'title' && !kid.screen?.feedback, kid.screen);
  await page.keyboard.press('KeyF');
  await t.game.step(3);
  t.check('kid mode: F opens nothing', !(await fb()).open);
  await t.canvasShot('kid title without icon');
  await t.log('feedback bodies', { bodies });
  await adultMode(t);
}
