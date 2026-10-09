/**
 * Final playtest, persona: phone player holding the phone in portrait, then
 * rotating. Rotate hint, portrait layout, pause on rotation, nothing cut off.
 *   npm run playtest -- --scenario scripts/scenarios/final-phone-rotate.ts --viewports phone-portrait,phone-landscape --name final-phone-rotate
 */
import { PLAYER_X } from '../../src/core/config';
import { Rng } from '../../src/core/rng';
import type { PlaceableKind } from '../../src/gameplay/debug';
import { HumanBot, planStomp } from '../../src/gameplay/testing';
import { SCORES_URL } from '../../src/net/api';
import type {} from '../../src/player/debug';
import type { Rect } from '../../src/types';
import type { UiDebugHook } from '../../src/ui/debug';
import { cssPerViewPixel, freeTapSpot, holdViewWhile, type PlaytestContext, stepWhile } from '../playtest-lib';

type UiWindow = Window & { __ui?: UiDebugHook };
const layout = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.layout());
const settings = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.settings());
const centre = (r: Rect) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

/**
 * Fakes the online list (nothing reaches the live worker): an empty list, so
 * every run qualifies and game over always offers "Eintragen", the case where
 * a restart tap has the least free space. Reloads so the startup GET hits it.
 */
async function fakeEmptyScoreList(t: PlaytestContext): Promise<{ posts: number }> {
  const seen = { posts: 0 };
  await t.page.route(`${SCORES_URL}/**`, (route) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
    const method = route.request().method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (method === 'POST') {
      seen.posts++;
      return route.fulfill({ status: 503, headers });
    }
    return route.fulfill({ headers, json: { entries: [] } });
  });
  await t.page.reload();
  await t.page.waitForFunction(() => Boolean(window.__game));
  return seen;
}

function place(t: PlaytestContext, kind: PlaceableKind, x: number, variant = 0, prop = 0): Promise<number> {
  return t.page.evaluate(
    ([k, px, v, p]) => window.__gameplay!.place(k as PlaceableKind, px as number, v as number, p as number),
    [kind, x, variant, prop] as const,
  );
}

async function pageInfo(t: PlaytestContext) {
  return t.page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('#game')!.getBoundingClientRect();
    const root = document.scrollingElement!;
    return {
      canvas: { left: c.left, top: c.top, width: c.width, height: c.height },
      win: { w: window.innerWidth, h: window.innerHeight },
      scroll: root.scrollWidth > root.clientWidth || root.scrollHeight > root.clientHeight,
      bg: getComputedStyle(document.body).backgroundColor,
    };
  });
}

async function tapRect(t: PlaytestContext, r: Rect): Promise<void> {
  const c = centre(r);
  await t.realTapView(c.x, c.y);
  await t.game.step(2);
}

async function rotate(t: PlaytestContext, label: string): Promise<void> {
  const size = t.page.viewportSize()!;
  await t.page.setViewportSize({ width: size.height, height: size.width });
  await t.wait(250);
  await t.game.step(2);
  const info = await pageInfo(t);
  const d = await t.game.display();
  await t.log(`rotate ${label}`, { info, d });
  t.check(`${label}: canvas inside window`, info.canvas.left >= 0 && info.canvas.top >= 0 && info.canvas.left + info.canvas.width <= info.win.w + 0.5 && info.canvas.top + info.canvas.height <= info.win.h + 0.5 && !info.scroll, info);
}

/** HumanBot ride for `seconds` (stops at game over); screenshots every `every` seconds. */
async function ride(t: PlaytestContext, seed: number, seconds: number, label: string, every = 10, zones = false): Promise<void> {
  const { game } = t;
  const bot = new HumanBot(new Rng(seed));
  let s = await game.state();
  let ducked = false;
  for (let i = 0; i < seconds * 60 && s.mode === 'playing'; i++) {
    const move = bot.next(s);
    if (move === 'press') await game.press();
    if (move === 'release') await game.release();
    const duck = bot.duck(s);
    if (duck !== ducked) {
      await t.page.evaluate((v) => (v ? window.__game!.input.duck.press() : window.__game!.input.duck.release()), duck);
      ducked = duck;
    }
    s = await game.step(1);
    if (zones && i === 15 * 60) await game.setZone(1);
    if (zones && i === 30 * 60) await game.setZone(2);
    if (zones && (i === 15 * 60 + 40 || i === 30 * 60 + 40)) await t.screenshot(`${label} zone banner ${s.zoneIndex}`);
    if (i > 0 && i % (every * 60) === 0) await t.canvasShot(`${label} ${i / 60}s`);
  }
  if (ducked) await t.page.evaluate(() => window.__game!.input.duck.release());
  await game.release();
  await t.log(`${label} end`, { mode: s.mode, score: s.score, health: s.health });
}

async function portraitStart(t: PlaytestContext): Promise<void> {
  const { game } = t;
  await t.screenshot('portrait title with rotate hint');
  const info = await pageInfo(t);
  await t.log('portrait page', info);
  // A tap on the hint dismisses it, must not start the run.
  await t.realTapView(100, 90);
  await game.step(2);
  let s = await game.state();
  t.check('tap on rotate hint does not start a run', s.mode === 'title', s.mode);
  await t.screenshot('portrait title after dismiss');
  await t.canvasShot('portrait title after dismiss');

  // Hidden settings in portrait: long press logo, kid mode (the default) off and on again.
  const logo = centre((await layout(t)).logo);
  await holdViewWhile(t, logo.x, logo.y, () => game.step(185).then(() => undefined));
  await game.step(1);
  await t.screenshot('portrait settings menu');
  const l = await layout(t);
  t.check('kid mode is on by default', (await game.state()).kidMode);
  await tapRect(t, l.menu.toggle);
  await t.screenshot('portrait kid mode off');
  t.check('the toggle turns kid mode off', !(await game.state()).kidMode);
  await tapRect(t, l.menu.toggle);
  await t.screenshot('portrait kid mode on');
  await t.log('after switching back on', { kidMode: (await game.state()).kidMode, settings: await settings(t) });
  await tapRect(t, l.menu.back);

  // Start a run with a real tap in portrait.
  await game.seed(7);
  await t.realTapView(200, 120);
  await game.step(30);
  s = await game.state();
  t.check('real tap starts run in portrait', s.mode === 'playing', s.mode);
  await t.screenshot('portrait running');
  await ride(t, 7, 25, 'portrait ride', 8, true);
  await t.screenshot('portrait after ride');

  // HUD buttons in portrait: mute + pause by real tap.
  if ((await game.state()).mode === 'playing') {
    const hud = (await layout(t)).hud;
    const css = await cssPerViewPixel(t.page);
    await t.log('portrait hud', { hud, css });
    await tapRect(t, hud.mute);
    t.check('portrait mute tap mutes', (await game.state()).muted === true);
    await tapRect(t, hud.pause);
    t.check('portrait pause tap pauses', (await game.state()).mode === 'paused');
    await t.screenshot('portrait paused');
    // Rotate to landscape while paused.
    await rotate(t, 'portrait->landscape paused');
    await t.screenshot('landscape after rotate while paused');
    t.check('still paused after rotating to landscape', (await game.state()).mode === 'paused');
    await t.realTapView(150, 100);
    await game.step(2);
    t.check('tap resumes in landscape', (await game.state()).mode === 'playing', (await game.state()).mode);
    await game.step(60);
    await t.screenshot('landscape running after rotate');
    // Rotate back to portrait while playing: hint must pause.
    await rotate(t, 'landscape->portrait playing');
    s = await game.state();
    t.check('rotating to portrait mid-run pauses', s.mode === 'paused', s.mode);
    await t.screenshot('portrait hint mid-run');
    await t.realTapView(150, 100);
    await game.step(2);
    s = await game.state();
    t.check('dismissing hint mid-run leaves pause screen (no resume from same tap)', s.mode === 'paused', s.mode);
    await t.screenshot('portrait after dismiss mid-run');
    await t.realTapView(150, 100);
    await game.step(2);
    t.check('second tap resumes in portrait', (await game.state()).mode === 'playing');
    await tapRect(t, (await layout(t)).hud.mute);
  }
}

async function features(t: PlaytestContext, tag: string): Promise<void> {
  const { game } = t;
  // Fresh run, chill pickup (the gum: kid mode is on) and stomp at a pinned speed.
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(3);
  await game.startRun();
  await game.setSpeed(110);
  await game.step(20);
  await t.page.evaluate(() => window.__gameplay!.clear());
  await place(t, 'joint', PLAYER_X + 60);
  await game.step(50);
  await t.canvasShot(`${tag} chill`);
  await t.screenshot(`${tag} chill full`);
  await game.step(200);
  await t.page.evaluate(() => window.__gameplay!.clear());
  await game.setZone(2);
  await game.step(5);
  await place(t, 'wasenGuest', PLAYER_X + 130, 1, 0);
  const plan = planStomp(await game.state(), true);
  if (plan) {
    await game.step(plan.tick);
    await game.press();
    await game.step(plan.hold);
    await game.release();
    await stepWhile(t, (x) => x.carriedItem === null, { max: 150 }).catch(() => undefined);
    await game.step(3);
    await t.canvasShot(`${tag} catch popup`);
  }
  await game.step(80);
  await t.page.evaluate(() => window.__gameplay!.clear());
  await place(t, 'bench', PLAYER_X + 80);
  await game.step(4);
  await game.press();
  await game.step(14);
  await game.release();
  await game.step(18);
  await t.canvasShot(`${tag} bench attempt`);
  await game.setSpeed(null);
  // Game over with natural play (health 1) and restart with a real tap.
  await game.setHealth(1);
  await ride(t, 11, 60, `${tag} death ride`, 30);
  let s = await game.state();
  if (s.mode === 'playing') {
    await game.endRun();
  }
  await game.step(30);
  await t.screenshot(`${tag} game over`);
  await game.step(60);
  await t.screenshot(`${tag} game over ready`);
  // A tap beside the buttons ("Eintragen", the corner buttons) restarts; one on them uses the button.
  const buttons = (await layout(t)).screen;
  t.check(`${tag}: game over offers Eintragen (fake empty list)`, !!buttons?.submit, buttons);
  const spot = await freeTapSpot(t);
  await t.log(`${tag} game over tap`, { spot, buttons });
  await t.realTapView(spot.x, spot.y);
  await game.step(5);
  s = await game.state();
  t.check(`${tag}: tap on game over restarts`, s.mode === 'playing', s.mode);
  await t.screenshot(`${tag} restarted`);
}

export default async function finalPhoneRotate(t: PlaytestContext): Promise<void> {
  const scores = await fakeEmptyScoreList(t);
  await t.wait(300);
  await t.game.pause();
  const d = await t.game.display();
  await t.log('display', d);
  if (d.portrait) {
    await portraitStart(t);
    await features(t, 'portrait');
    await rotate(t, 'to landscape for features');
    await features(t, 'landscape');
  } else {
    await t.screenshot('landscape title');
    await t.game.seed(5);
    await t.realTapView(200, 120);
    await t.game.step(10);
    await ride(t, 5, 45, 'landscape ride', 15, true);
    await rotate(t, 'landscape->portrait');
    await t.screenshot('landscape to portrait hint');
    // The rotate hint (and its pause) is for phones only (SPEC: "On phones ..."; portraitHintShown needs touch):
    // a desktop window made tall just rides on.
    const mode = (await t.game.state()).mode;
    if (t.viewport.touch) t.check('landscape->portrait pauses', mode !== 'playing', mode);
    else t.check('landscape->portrait on desktop keeps riding (no rotate hint)', mode === 'playing', mode);
    await rotate(t, 'back to landscape');
    await t.screenshot('back to landscape');
    await features(t, 'landscape');
  }
  // Real-clock auto-pause on visibility change.
  await t.game.resume();
  await t.page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await t.wait(200);
  t.check('blur pauses', (await t.game.state()).mode !== 'playing', (await t.game.state()).mode);
  await t.screenshot('after blur');
  t.check('no score was posted', scores.posts === 0, scores);
}
