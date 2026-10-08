/**
 * Final playtest, persona: phone player in landscape, touch only.
 * Drives real CDP touches (tap / hold jump, swipe-down duck, HUD buttons,
 * logo long press) on a frozen clock, plus HumanBot rides with real touches.
 *   npm run playtest -- --scenario scripts/scenarios/final-phone-touch.ts --viewports phone-landscape --name final-phone-touch
 */
import type { CDPSession } from 'playwright';
import { PLAYER_X, TICK_DT } from '../../src/core/config';
import { SWIPE_WINDOW } from '../../src/core/input';
import { Rng } from '../../src/core/rng';
import type { PlaceableKind } from '../../src/gameplay/debug';
import { HumanBot, planStomp } from '../../src/gameplay/testing';
import type {} from '../../src/player/debug';
import type { GameState, Rect } from '../../src/types';
import type { UiDebugHook } from '../../src/ui/debug';
import { cssPerViewPixel, dismissRotateHint, holdViewWhile, type PlaytestContext, stepWhile, viewToClient } from '../playtest-lib';

type UiWindow = Window & { __ui?: UiDebugHook };
const layout = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.layout());
const settings = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.settings());
const centre = (r: Rect) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

function place(t: PlaytestContext, kind: PlaceableKind, x: number, variant = 0, prop = 0): Promise<number> {
  return t.page.evaluate(
    ([k, px, v, p]) => window.__gameplay!.place(k as PlaceableKind, px as number, v as number, p as number),
    [kind, x, variant, prop] as const,
  );
}

/** Multi-finger touch driver over CDP, positions in view px. */
class Fingers {
  private readonly active = new Map<number, { x: number; y: number }>();
  constructor(
    private readonly t: PlaytestContext,
    private readonly cdp: CDPSession,
  ) {}
  private points() {
    return [...this.active.entries()].map(([id, p]) => ({ id, ...p }));
  }
  async down(id: number, vx: number, vy: number) {
    this.active.set(id, await viewToClient(this.t.page, vx, vy));
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: this.points() });
  }
  async move(id: number, vx: number, vy: number) {
    this.active.set(id, await viewToClient(this.t.page, vx, vy));
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: this.points() });
  }
  async up(id: number) {
    if (!this.active.has(id)) return;
    this.active.delete(id);
    await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: this.points() });
  }
  async upAll() {
    for (const id of [...this.active.keys()]) await this.up(id);
  }
  /** Tap and step `frames` ticks while the finger is down. */
  async tap(vx: number, vy: number, frames = 3) {
    await this.down(9, vx, vy);
    await this.t.game.step(frames);
    await this.up(9);
    await this.t.game.step(1);
  }
  /** Swipe down with a separate finger (id 2), finger lifted after 3 ticks. */
  async swipeDown(vx: number, vy: number, dy = 12) {
    await this.down(2, vx, vy);
    await this.t.game.step(1);
    await this.move(2, vx + 2, vy + dy / 2);
    await this.move(2, vx + 3, vy + dy);
    await this.t.game.step(1);
    await this.up(2);
  }
}

const PLAY = { x: 150, y: 120 };

/**
 * The street as it will be SWIPE_WINDOW ticks from now (entities scrolled
 * left). A held touch only becomes a jump once the swipe window ran out, so a
 * bot that plans on this state lands its finger early by that lag, like a
 * player who has learnt it.
 */
function ahead(s: GameState): GameState {
  const dx = s.speed * TICK_DT * SWIPE_WINDOW;
  return { ...s, frame: s.frame + SWIPE_WINDOW, entities: s.entities.map((e) => ({ ...e, x: e.x - dx })) };
}

/** HumanBot plays with real touches: finger lands when the bot "presses", lifts on release; swipes to duck. */
async function touchRide(
  t: PlaytestContext,
  f: Fingers,
  label: string,
  seconds: number,
  opts: { keepAlive?: boolean; shotsEvery?: number; seed?: number } = {},
): Promise<{ crashes: number; stomps: number; frames: number; ended: boolean; s: GameState }> {
  const { game } = t;
  const bot = new HumanBot(new Rng(opts.seed ?? 7));
  let s = await game.state();
  const from = s.frame;
  let duckUntil = -1;
  let fingerDown = false;
  for (let i = 0; i < seconds * 60 && s.mode === 'playing'; i++) {
    const move = bot.next(s);
    if (move === 'press') {
      await f.down(1, PLAY.x, PLAY.y);
      fingerDown = true;
    }
    if (move === 'release' && fingerDown) {
      await f.up(1);
      fingerDown = false;
    }
    if (bot.duck(s) && s.frame >= duckUntil && !fingerDown) {
      await f.swipeDown(PLAY.x + 40, 90);
      duckUntil = s.frame + 70;
    }
    if (opts.keepAlive && s.health < 2) await game.setHealth(3);
    s = await game.step(1);
    if (opts.shotsEvery && i > 0 && i % (opts.shotsEvery * 60) === 0) {
      await t.canvasShot(`${label} ${i / 60}s`);
    }
  }
  await f.upAll();
  const crashes = (await game.eventsSince(from, 'crash')).length;
  const stomps = (await game.eventsSince(from, 'stomp')).length;
  const out = { crashes, stomps, frames: s.frame - from, ended: s.mode === 'gameover', s };
  await t.log(`${label} result`, { ...out, s: undefined, zone: s.zoneIndex, score: s.score, distance: s.distance });
  return out;
}

/** Same ride with the hook input (zero latency) for comparison. */
async function hookRide(t: PlaytestContext, seconds: number, seed: number): Promise<number> {
  const { game } = t;
  const bot = new HumanBot(new Rng(seed));
  let s = await game.state();
  const from = s.frame;
  let ducked = false;
  for (let i = 0; i < seconds * 60 && s.mode === 'playing'; i++) {
    const move = bot.next(s);
    if (move === 'press') await game.press();
    if (move === 'release') await game.release();
    const d = bot.duck(s);
    if (d !== ducked) {
      await t.page.evaluate((x) => (x ? window.__game!.input.duck.press() : window.__game!.input.duck.release()), d);
      ducked = d;
    }
    if (s.health < 2) await game.setHealth(3);
    s = await game.step(1);
  }
  await game.release();
  return (await game.eventsSince(from, 'crash')).length;
}

async function freshRun(t: PlaytestContext, zone: number, speed: number | null = 110) {
  const { game } = t;
  const st = await game.state();
  if (st.mode === 'paused') await game.resumeGame();
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(3);
  await game.startRun();
  await game.setSpeed(speed);
  await game.setZone(zone);
  await game.step(20);
  await t.page.evaluate(() => window.__gameplay!.clear());
}


async function probe(t: PlaytestContext, f: Fingers): Promise<void> {
  const { game } = t;
  await game.seed(3);
  await game.startRun();
  await game.setSpeed(110);
  await game.step(20);
  const rows: unknown[] = [];
  for (const hold of [2, 3, 5, 6, 8, 10, 15, 20]) {
    for (const mode of ['touch', 'hook']) {
      await t.page.evaluate(() => window.__gameplay!.clear());
      await stepWhile(t, (x) => !x.player.grounded, { max: 200 });
      await game.step(5);
      let s = await game.state();
      const g = s.player.y;
      let minY = g;
      let air = -1;
      if (mode === 'touch') await f.down(1, PLAY.x, PLAY.y);
      else await game.press();
      for (let i = 0; i < 120; i++) {
        if (i === hold) {
          if (mode === 'touch') await f.up(1);
          else await game.release();
        }
        s = await game.step(1);
        await t.page.evaluate(() => window.__gameplay!.clear());
        if (air < 0 && !s.player.grounded) air = i + 1;
        minY = Math.min(minY, s.player.y);
        if (i > hold && s.player.grounded) break;
      }
      rows.push({ hold, mode, takeoffTick: air, apex: Math.round(g - minY) });
    }
  }
  await t.log('probe apex', rows);
  // tap right under the pause button
  const lay = await layout(t);
  const pc = centre(lay.hud.pause);
  for (const dy of [2, 6, 12]) {
    await stepWhile(t, (x) => !x.player.grounded, { max: 200 });
    const from = (await game.state()).frame;
    await f.tap(pc.x, lay.hud.pause.y + lay.hud.pause.h + dy);
    await game.step(10);
    const st = await game.state();
    await t.log('under pause', { dy, y: lay.hud.pause.y + lay.hud.pause.h + dy, jumps: (await game.eventsSince(from, 'jump')).length, mode: st.mode });
    if (st.mode === 'paused') await game.resumeGame();
  }
}

export default async function finalPhoneTouch(t: PlaytestContext): Promise<void> {
  const { game, page } = t;
  const cdp = await page.context().newCDPSession(page);
  const f = new Fingers(t, cdp);
  await game.pause();
  await game.step(2);
  if (process.env.PROBE) return probe(t, f);
  const css = await cssPerViewPixel(page);
  const disp = await game.display();
  await t.log('display', { css, disp });

  // --- Title, real tap start (in portrait the first tap only dismisses the rotate hint)
  await dismissRotateHint(t);
  await t.screenshot('title page');
  await t.canvasShot('title');
  const L = await layout(t);
  await t.log('layout', L);
  const hudSizes = Object.entries(L.hud).map(([k, r]) => [k, r ? Math.round(r.w * css) : null]);
  await t.log('hud tap sizes css', hudSizes);
  await game.seed(11);
  await f.tap(PLAY.x, PLAY.y);
  let s = await game.step(2);
  t.check('real tap on title starts a run', s.mode === 'playing', { mode: s.mode });
  const startJumps = await game.events('jump');
  t.check('starting tap does not also jump', startJumps.length === 0, startJumps);
  await game.step(30);
  await t.screenshot('run start page');

  // --- Touch latency: tap vs hold apex with real touches
  const y0 = (await game.state()).player.y;
  await t.page.evaluate(() => window.__gameplay!.clear());
  await f.down(1, PLAY.x, PLAY.y);
  let firstAir = -1;
  for (let i = 0; i < 40; i++) {
    s = await game.step(1);
    if (firstAir < 0 && !s.player.grounded) firstAir = i + 1;
    if (i === 30) await f.up(1);
  }
  await t.log('held touch: ticks until airborne', { firstAir });
  await stepWhile(t, (x) => !x.player.grounded, { max: 120 });
  void y0;

  // --- Ride 1: real touches, natural, until game over (max 120 s)
  await game.setSpeed(null);
  const r1 = await touchRide(t, f, 'ride1 touch', 120, { shotsEvery: 20, seed: 7 });
  await t.canvasShot('ride1 end');
  await t.screenshot('ride1 end page');

  // --- Game over: early tap must not restart, later tap restarts
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.step(5);
  await t.screenshot('game over early page');
  await f.tap(PLAY.x, PLAY.y);
  s = await game.step(2);
  t.check('tap right after game over does not restart', s.mode === 'gameover', { mode: s.mode });
  await game.step(60);
  await t.screenshot('game over page');
  await t.canvasShot('game over');
  await f.tap(PLAY.x, PLAY.y);
  s = await game.step(2);
  t.check('tap after delay restarts', s.mode === 'playing', { mode: s.mode });

  // --- Comparison: touch vs hook, same seeds, health kept up, 60 s each
  const compare: Record<string, number>[] = [];
  for (const seed of [1, 2, 3]) {
    if ((await game.state()).mode === 'playing') await game.endRun();
    await game.seed(seed);
    await game.startRun();
    const touch = await touchRide(t, f, `cmp touch seed ${seed}`, 60, { keepAlive: true, seed });
    await game.endRun();
    await game.seed(seed);
    await game.startRun();
    const hook = await hookRide(t, 60, seed);
    compare.push({ seed, touch: touch.crashes, hook });
  }
  await t.log('touch vs hook crashes (60s each)', compare);

  // --- Ride 2: long ride across zones with real touches, health kept
  await game.endRun();
  await game.seed(21);
  await game.startRun();
  const r2 = await touchRide(t, f, 'ride2 zones', 150, { keepAlive: true, shotsEvery: 15, seed: 21 });
  await t.log('ride2 zone', { zone: r2.s.zoneIndex, crashes: r2.crashes, stomps: r2.stomps });

  // --- Zone banners (Am Neckar e glyph)
  for (const z of [1, 2, 0]) {
    await game.setZone(z);
    await game.step(25);
    await t.canvasShot(`zone banner ${z}`);
    await t.screenshot(`zone banner ${z} page`);
  }

  // --- Pause by real tap, mute tap, fullscreen tap, resume by tap
  const lay = await layout(t);
  await f.down(1, PLAY.x, PLAY.y); // finger held (jump) while second finger hits pause
  await game.step(6);
  const pc = centre(lay.hud.pause);
  await f.down(3, pc.x, pc.y);
  await game.step(1);
  await f.up(3);
  await f.up(1);
  s = await game.step(2);
  t.check('second finger on pause pauses while jumping', s.mode === 'paused', { mode: s.mode });
  await t.screenshot('paused page');
  const mc = centre(lay.hud.mute);
  const mutedBefore = s.muted;
  await f.tap(mc.x, mc.y);
  s = await game.step(1);
  t.check('mute tap while paused toggles', s.muted !== mutedBefore, { mutedBefore, now: s.muted });
  t.check('mute tap keeps paused', s.mode === 'paused', { mode: s.mode });
  await t.canvasShot('paused muted');
  if (lay.hud.fullscreen) {
    await game.resume();
    const fc = centre(lay.hud.fullscreen);
    await t.realTapView(fc.x, fc.y);
    await t.wait(500);
    await game.pause();
    const fs = await page.evaluate(() => Boolean(document.fullscreenElement));
    t.check('fullscreen tap enters fullscreen', fs);
    await t.screenshot('fullscreen page');
    s = await game.state();
    await t.log('after fullscreen', { mode: s.mode, display: await game.display() });
    if (fs) await page.evaluate(() => document.exitFullscreen());
    await t.wait(300);
  }
  // Edge taps: just below the pause button, between buttons
  s = await game.state();
  if (s.mode !== 'paused') await game.pauseGame();
  await f.tap(PLAY.x, PLAY.y);
  s = await game.step(2);
  t.check('tap resumes from pause', s.mode === 'playing', { mode: s.mode });
  const resumeJumps = await game.eventsSince(s.frame - 4, 'jump');
  await t.log('resume tap jumps', resumeJumps);
  // tap just under the pause button tap area: jump or nothing?
  const since = s.frame;
  await f.tap(pc.x, lay.hud.pause.y + lay.hud.pause.h + 2);
  s = await game.step(10);
  await t.log('tap under pause btn', { mode: s.mode, jumps: (await game.eventsSince(since, 'jump')).length });

  // --- Stomp with real touch, naive timing (finger lands at the planned tick)
  for (const [kind, zone] of [
    ['vfbFan', 1],
    ['wasenGuest', 2],
  ] as const) {
    await freshRun(t, zone);
    await place(t, kind, PLAYER_X + 130, 1, 0);
    const from = (await game.state()).frame;
    const plan = planStomp(await game.state(), true);
    await t.log(`stomp plan ${kind}`, plan);
    if (!plan) continue;
    await game.step(plan.tick);
    await f.down(1, PLAY.x, PLAY.y);
    await game.step(plan.hold);
    await f.up(1);
    for (let i = 0; i < 90; i++) {
      s = await game.step(1);
      if (i === 14) await t.canvasShot(`stomp ${kind} touch`);
      if (i === 14) await t.screenshot(`stomp ${kind} touch page`);
    }
    const st = await game.eventsSince(from, 'stomp');
    const cr = await game.eventsSince(from, 'crash');
    await t.log(`stomp ${kind} touch naive`, { stomps: st.length, crashes: cr.length, carried: s.carriedItem });
    const caught = await game.eventsSince(from, 'itemCaught');
    if (caught.length) await t.screenshot(`catch ${kind} page`);
  }
  // compensated stomp to see the catch popup at real size
  await freshRun(t, 2);
  await place(t, 'wasenGuest', PLAYER_X + 130, 1, 0);
  {
    const from = (await game.state()).frame;
    const plan = planStomp(await game.state(), true)!;
    await game.step(plan.tick);
    await game.press();
    await game.step(plan.hold);
    await game.release();
    for (let i = 0; i < 80; i++) {
      s = await game.step(1);
      const c = await game.eventsSince(from, 'itemCaught');
      if (c.length && c[0]!.frame === s.frame - 1) {
        await game.step(3);
        await t.screenshot('catch popup page');
        await t.canvasShot('catch popup');
      }
      if (i === 16) await t.canvasShot('stomp moment hook');
    }
  }

  // --- Joint pickup + chill via natural ride over it
  await freshRun(t, 0);
  await place(t, 'joint', PLAYER_X + 60);
  await game.step(40);
  s = await game.step(10);
  await t.screenshot('chill page');
  await t.canvasShot('chill');
  await t.log('chill', { chillTimer: s.chillTimer });

  // --- Bench grind and rail grind with touch
  await freshRun(t, 0);
  await place(t, 'bench', PLAYER_X + 90);
  const bot = new HumanBot(new Rng(3), true);
  let grinded = false;
  let fd = false;
  for (let i = 0; i < 200; i++) {
    s = await game.state();
    const mv = bot.next(ahead(s));
    if (mv === 'press') {
      await f.down(1, PLAY.x, PLAY.y);
      fd = true;
    }
    if (mv === 'release' && fd) {
      await f.up(1);
      fd = false;
    }
    s = await game.step(1);
    if (s.player.grinding && !grinded) {
      grinded = true;
      await game.step(4);
      await t.screenshot('bench grind page');
    }
  }
  await f.upAll();
  t.check('touch: bench grind happens', grinded);

  // --- Duck under overhead via real swipe in all zones
  for (const zone of [0, 1, 2]) {
    await freshRun(t, zone);
    await place(t, 'banner' as PlaceableKind, PLAYER_X + 70);
    const from = (await game.state()).frame;
    await f.swipeDown(PLAY.x + 40, 80);
    for (let i = 0; i < 40; i++) {
      s = await game.step(1);
      if (i === 15) await t.canvasShot(`swipe duck zone ${zone}`);
    }
    const cr = await game.eventsSince(from, 'crash');
    const j = await game.eventsSince(from, 'jump');
    t.check(`swipe duck clears overhead in zone ${zone}`, cr.length === 0 && j.length === 0, { cr, j });
  }
  // short vertical swipe of only 6 css px (3 view px): what happens?
  await freshRun(t, 0);
  {
    const from = (await game.state()).frame;
    await f.down(2, PLAY.x, 90);
    await game.step(1);
    await f.move(2, PLAY.x, 93);
    await game.step(1);
    await f.up(2);
    await game.step(20);
    await t.log('tiny swipe 3 view px', { jumps: (await game.eventsSince(from, 'jump')).length, duck: (await game.state()).player.state });
  }

  // --- Kid mode via the hidden long press on the logo
  await game.endRun();
  await game.step(60);
  // back to title: gameover -> title via ? (touch has no Esc). Check what a touch user sees.
  await t.canvasShot('gameover before kid');
  await page.evaluate(() => {
    const g = window.__game! as unknown as { toTitle?: () => void };
    void g;
  });
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__game));
  await game.pause();
  await game.step(2);
  await dismissRotateHint(t);
  const logo = centre((await layout(t)).logo);
  await holdViewWhile(t, logo.x, logo.y, async () => {
    await game.step(90);
    await t.screenshot('logo long press progress page');
    await game.step(95);
  });
  await game.step(2);
  await t.screenshot('settings menu page');
  const lay2 = await layout(t);
  await f.tap(centre(lay2.menu.toggle).x, centre(lay2.menu.toggle).y);
  await game.step(2);
  await t.screenshot('settings kid on page');
  await f.tap(centre(lay2.menu.back).x, centre(lay2.menu.back).y);
  await game.step(2);
  await t.screenshot('title kid page');
  await game.seed(5);
  await f.tap(PLAY.x, PLAY.y);
  await game.step(2);
  await game.setSpeed(110);
  await game.setZone(2);
  await game.step(20);
  await t.page.evaluate(() => window.__gameplay!.clear());
  await place(t, 'wasenGuest', PLAYER_X + 130, 0, 0);
  await place(t, 'joint', PLAYER_X + 60);
  await game.step(40);
  await t.screenshot('kid run page');
  await t.canvasShot('kid run');
  await game.setSpeed(null);
  const r3 = await touchRide(t, f, 'kid ride', 40, { keepAlive: true, seed: 5 });
  void r3;
  await game.endRun();
  await game.step(60);
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__game));
  await game.pause();
  await game.step(2);
  await dismissRotateHint(t);
  const logo2 = centre((await layout(t)).logo);
  await holdViewWhile(t, logo2.x, logo2.y, async () => {
    await game.step(185);
  });
  await game.step(2);
  const lay3 = await layout(t);
  await f.tap(centre(lay3.menu.toggle).x, centre(lay3.menu.toggle).y);
  await game.step(2);
  await t.screenshot('parent check page');
  await t.canvasShot('parent check');
  const q = await settings(t);
  await t.log('parent check', q);
  if (q.question) {
    const a = lay3.menu.answers[q.question.correct]!;
    await f.tap(centre(a).x, centre(a).y);
    await game.step(2);
    await t.screenshot('after parent answer page');
  }
  await t.log('summary', { r1: { crashes: r1.crashes, ended: r1.ended, frames: r1.frames }, compare });
  await cdp.detach();
}
