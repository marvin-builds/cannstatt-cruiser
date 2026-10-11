/**
 * Player feedback (ROADMAP 50) end to end against a FAKE endpoint: the base
 * URL is injected (window.__feedbackUrl) and intercepted, nothing reaches the
 * live worker. The title's speech-bubble icon and the pause menu's
 * "Feedback" open the form; text typed into the native textarea never
 * reaches the game (letters like P, E, M, W, S and Space); a bug report
 * with "Fehlerprotokoll mitsenden" sends the log, an idea and an unticked bug
 * report send none; the thank-you, rate-limit and offline states; kid mode
 * offers neither entry. Phone landscape runs at 320 view px wide (640 x 360).
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
