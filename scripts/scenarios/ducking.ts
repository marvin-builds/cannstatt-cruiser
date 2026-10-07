/**
 * Ducking showcase: the duck pose, ducking under both overhead obstacles in
 * all three zones, crashing into one when standing, real input (ArrowDown on
 * desktop, a swipe down via CDP touch on touch viewports, which must not jump)
 * and a 60 s bot ride on seed 1 that jumps and ducks.
 *   npm run playtest -- --scenario scripts/scenarios/ducking.ts --viewports desktop,phone-landscape --name ducking
 */
import { PLAYER_X } from '../../src/core/config';
import type {} from '../../src/gameplay/debug'; // window.__gameplay
import { SolverBot } from '../../src/gameplay/testing';
import type { GameState, ObstacleKind } from '../../src/types';
import { type PlaytestContext, viewToClient } from '../playtest-lib';

const duck = {
  press: (t: PlaytestContext) => t.page.evaluate(() => window.__game!.input.duck.press()),
  release: (t: PlaytestContext) => t.page.evaluate(() => window.__game!.input.duck.release()),
};

function place(t: PlaytestContext, kind: ObstacleKind, x: number): Promise<number> {
  return t.page.evaluate(([k, px]) => window.__gameplay!.place(k as ObstacleKind, px as number), [kind, x] as const);
}

async function stepUntil(t: PlaytestContext, done: (s: GameState) => boolean, max = 240): Promise<GameState> {
  let s = await t.game.state();
  for (let i = 0; i < max && !done(s); i++) s = await t.game.step(1);
  return s;
}

/** Fresh frozen run on an empty street at a fixed speed. */
async function freshRun(t: PlaytestContext, zone: number): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(1);
  await game.startRun();
  await game.setSpeed(120);
  await game.setZone(zone);
  await game.step(20);
  await t.page.evaluate(() => window.__gameplay!.clear());
}

/** Ducks under `kind` placed ahead; screenshot while it passes over. Returns whether it was a clean clear. */
async function duckUnder(t: PlaytestContext, kind: ObstacleKind, zone: number): Promise<boolean> {
  await freshRun(t, zone);
  const since = (await t.game.state()).frame;
  const id = await place(t, kind, PLAYER_X + 40);
  await duck.press(t);
  const over = (s: GameState) => {
    const e = s.entities.find((x) => x.id === id);
    return !e || e.x + e.w / 2 <= s.player.x;
  };
  await stepUntil(t, over);
  await t.canvasShot(`duck under ${kind} zone ${zone}`);
  await stepUntil(t, (s) => s.entities.find((x) => x.id === id)?.done !== false);
  await t.game.step(2);
  await duck.release(t);
  const crashes = await t.game.eventsSince(since, 'crash');
  const clears = (await t.game.eventsSince(since, 'obstacleCleared')).filter((e) => (e.payload as { entityId: number }).entityId === id);
  return crashes.length === 0 && clears.length === 1;
}

async function swipeDown(t: PlaytestContext): Promise<void> {
  const cdp = await t.page.context().newCDPSession(t.page);
  const { viewWidth } = await t.game.display();
  const from = await viewToClient(t.page, Math.floor(viewWidth / 2), 70);
  const to = await viewToClient(t.page, Math.floor(viewWidth / 2), 82);
  // No waits in between: each CDP round trip already takes a few ticks.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...to, id: 1 }] });
  await t.wait(30);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

async function realInput(t: PlaytestContext): Promise<void> {
  const { game, page } = t;
  await freshRun(t, 0);
  await game.resume();
  await t.wait(300);
  const since = (await game.state()).frame;
  if (t.viewport.touch) {
    await swipeDown(t);
    await t.wait(150);
    const s = await game.state();
    await t.canvasShot('real swipe down');
    const jumps = await game.eventsSince(since, 'jump');
    t.check('touch: swipe down ducks', s.player.state === 'duck', { state: s.player.state });
    t.check('touch: swipe down does not jump', jumps.length === 0, jumps);
    await t.wait(900);
    t.check('touch: swipe duck ends by itself', (await game.state()).player.state !== 'duck');
    const tapFrom = (await game.state()).frame;
    await t.realPress(40);
    await t.wait(200);
    t.check('touch: a tap still jumps', (await game.eventsSince(tapFrom, 'jump')).length === 1);
  } else {
    await page.keyboard.down('ArrowDown');
    await t.wait(150);
    const s = await game.state();
    await t.canvasShot('real arrow down');
    t.check('keys: ArrowDown ducks', s.player.state === 'duck', { state: s.player.state });
    await page.keyboard.up('ArrowDown');
    await t.wait(150);
    t.check('keys: releasing ArrowDown stands up', (await game.state()).player.state !== 'duck');
    t.check('keys: ducking does not jump', (await game.eventsSince(since, 'jump')).length === 0);
  }
  await game.pause();
}

async function botRide(t: PlaytestContext): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.setSpeed(null);
  await game.seed(1);
  await game.startRun();
  const bot = new SolverBot();
  let s = await game.state();
  const start = s.frame;
  let ducked = false;
  let shots = 0;
  for (let i = 0; i < 60 * 60 && s.mode === 'playing'; i++) {
    const move = bot.next(s);
    if (move === 'press') await game.press();
    if (move === 'release') await game.release();
    const wantDuck = bot.duck(s);
    if (wantDuck !== ducked) await (wantDuck ? duck.press(t) : duck.release(t));
    ducked = wantDuck;
    if (i === 20 * 60) await game.setZone(1);
    if (i === 40 * 60) await game.setZone(2);
    s = await game.step(1);
    if (shots < 3 && s.player.state === 'duck' && s.entities.some((e) => e.x < s.player.x && e.x + e.w > s.player.x && (e.kind === 'banner' || e.kind === 'stopSign'))) {
      await t.canvasShot(`bot ducks zone ${s.zoneIndex}`);
      shots++;
      for (let k = 0; k < 40 && s.mode === 'playing'; k++) {
        const m = bot.next(s);
        if (m === 'press') await game.press();
        if (m === 'release') await game.release();
        s = await game.step(1);
      }
    }
  }
  await duck.release(t);
  const crashes = await game.eventsSince(start, 'crash');
  const ducks = (await game.eventsSince(start, 'obstacleCleared')).filter((e) => ['banner', 'stopSign'].includes((e.payload as { kind: string }).kind));
  t.check('bot survives 60 s on seed 1 with ducking patterns', s.mode === 'playing' && crashes.length === 0, { crashes: crashes.length, mode: s.mode });
  t.check('bot ducked under overhead obstacles', ducks.length > 0, { ducks: ducks.length });
}

export default async function ducking(t: PlaytestContext): Promise<void> {
  const { game } = t;
  await game.pause();
  const { viewWidth, touch, portrait } = await game.display();
  if (touch && portrait) {
    // The rotate hint covers the game until a tap dismisses it (see ui.ts).
    await t.realTapView(Math.floor(viewWidth / 2), 90);
    await game.step(2);
  }
  await t.canvasShot('title with duck hint');

  await freshRun(t, 0);
  await duck.press(t);
  const ducked = await game.step(12);
  await t.canvasShot('duck pose');
  t.check('duck pose: state duck, low hitbox', ducked.player.state === 'duck' && ducked.player.hitbox.h === 20, ducked.player);
  await duck.release(t);

  for (const zone of [0, 1, 2]) {
    for (const kind of ['banner', 'stopSign'] as const) {
      t.check(`ducks cleanly under ${kind} in zone ${zone}`, await duckUnder(t, kind, zone));
    }
  }

  await freshRun(t, 1);
  const since = (await game.state()).frame;
  await place(t, 'banner', PLAYER_X + 40);
  await stepUntil(t, (s) => s.player.state === 'crash');
  await game.step(3);
  await t.canvasShot('crash into banner standing');
  t.check('standing into a banner crashes', (await game.eventsSince(since, 'crash')).length === 1);

  await freshRun(t, 2);
  const jumpSince = (await game.state()).frame;
  await place(t, 'stopSign', PLAYER_X + 30);
  await game.hold(10);
  await stepUntil(t, (s) => s.player.state === 'crash');
  await t.canvasShot('crash into stop sign jumping');
  t.check('jumping into a stop sign crashes', (await game.eventsSince(jumpSince, 'crash')).length === 1);

  await realInput(t);
  await botRide(t);
  await game.setSpeed(null);
}
