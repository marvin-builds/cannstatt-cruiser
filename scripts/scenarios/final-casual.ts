/**
 * Final playtest, persona "casual first-timer" (never played a runner).
 *   npm run playtest -- --scenario scripts/scenarios/final-casual.ts --viewports desktop,phone-landscape --name final-casual
 */
import { PLAYER_X } from '../../src/core/config';
import { Rng } from '../../src/core/rng';
import { ZoneRoute } from '../../src/world/zones';
import type { PlaceableKind } from '../../src/gameplay/debug';
import { HumanBot, HUMAN_STYLE, planStomp, SolverBot } from '../../src/gameplay/testing';
import type {} from '../../src/player/debug';
import type { GameState } from '../../src/types';
import type { UiDebugHook } from '../../src/ui/debug';
import { dismissRotateHint, holdViewWhile, type PlaytestContext, stepWhile } from '../playtest-lib';

type UiWindow = Window & { __ui?: UiDebugHook };
const layout = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.layout());
const settings = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.settings());

function place(t: PlaytestContext, kind: PlaceableKind, x: number, variant = 0, prop = 0): Promise<number> {
  return t.page.evaluate(([k, px, v, p]) => window.__gameplay!.place(k as PlaceableKind, px as number, v as number, p as number), [kind, x, variant, prop] as const);
}

async function duckSet(t: PlaytestContext, on: boolean): Promise<void> {
  await t.page.evaluate((d) => (d ? window.__game!.input.duck.press() : window.__game!.input.duck.release()), on);
}

/** Plays with a (sloppy) bot for `ticks`; shots every `shotEvery` ticks and on zone changes. */
async function ride(
  t: PlaytestContext,
  bot: { next(s: GameState): 'press' | 'release' | null; duck(s: GameState): boolean },
  ticks: number,
  label: string,
  opts: { shotEvery?: number; immortal?: boolean } = {},
): Promise<GameState> {
  const { game } = t;
  let s = await game.state();
  let ducked = false;
  let zone = s.zoneIndex;
  let shotAt = -1;
  for (let i = 0; i < ticks && s.mode === 'playing'; i++) {
    const move = bot.next(s);
    if (move === 'press') await game.press();
    if (move === 'release') await game.release();
    const d = bot.duck(s);
    if (d !== ducked) {
      await duckSet(t, d);
      ducked = d;
    }
    s = await game.step(1);
    if (opts.immortal && s.health < 2) await game.setHealth(3);
    if (opts.shotEvery && i % opts.shotEvery === 0 && i > 0) await t.canvasShot(`${label} ${Math.round(s.time)}s`);
    if (s.zoneIndex !== zone) {
      zone = s.zoneIndex;
      shotAt = i + 30;
      await t.canvasShot(`${label} zone ${zone} change`);
      await t.log(`${label} zone ${zone}`, { time: s.time });
    }
    if (i === shotAt) await t.canvasShot(`${label} zone ${zone} banner`);
  }
  if (ducked) await duckSet(t, false);
  await game.release();
  return s;
}

async function title(t: PlaytestContext): Promise<void> {
  await t.game.step(30);
  await t.screenshot('title page');
  await t.canvasShot('title');
  await t.game.step(90);
  await t.canvasShot('title later');
}

/** First 30 s: a novice who jumps late/early (bigger jitter) at the real start speed. */
async function firstRun(t: PlaytestContext): Promise<void> {
  const { game } = t;
  await game.seed(11);
  const from = (await game.state()).frame;
  await t.realPress(80);
  await game.step(2);
  t.check('real press on title starts the run', (await game.state()).mode === 'playing');
  await t.canvasShot('first frame');
  const novice = new HumanBot(new Rng(5), false, { ...HUMAN_STYLE, takeoffJitter: 7, duckJitter: 8 });
  const s = await ride(t, novice, 30 * 60, 'first run', { shotEvery: 5 * 60 });
  const crashes = await game.eventsSince(from, 'crash');
  const firstObs = await game.eventsSince(from, 'obstacleCleared');
  await t.log('first 30s novice', {
    crashes: crashes.map((c) => ({ f: c.frame - from, k: (c.payload as { kind: string }).kind })),
    firstCleared: firstObs[0] ? (firstObs[0].frame - from) / 60 : null,
    health: s.health,
    mode: s.mode,
    speed: s.speed,
  });
}

/** Do nothing: what does a crash look like, then the game over and the restart. */
async function crashToGameOver(t: PlaytestContext): Promise<void> {
  const { game } = t;
  const from = (await game.state()).frame;
  let lastCrashes = 0;
  let s = await game.state();
  for (let i = 0; i < 60 * 60 && s.mode === 'playing'; i++) {
    s = await game.step(1);
    const crashes = await game.eventsSince(from, 'crash');
    if (crashes.length > lastCrashes) {
      lastCrashes = crashes.length;
      await game.step(4);
      await t.canvasShot(`idle crash ${lastCrashes}`);
      await game.step(20);
      await t.canvasShot(`idle crash ${lastCrashes} after`);
      s = await game.state();
    }
  }
  await t.log('idle to game over', { crashes: lastCrashes, mode: s.mode, time: s.time });
  await t.canvasShot('game over just now');
  await game.step(30);
  await t.canvasShot('game over 0.5s');
  await game.step(90);
  await t.screenshot('game over page');
  await t.canvasShot('game over 2s');
  await t.realPress(80);
  await game.step(2);
  t.check('real press restarts after game over', (await game.state()).mode === 'playing', (await game.state()).mode);
  await t.canvasShot('restarted');
}

async function pauseAndMute(t: PlaytestContext): Promise<void> {
  const { game } = t;
  const l = await layout(t);
  const c = (r: { x: number; y: number; w: number; h: number }) => [r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2)] as const;
  await game.step(30);
  await t.canvasShot('hud buttons');
  await t.realTapView(...c(l.hud.mute));
  await game.step(2);
  t.check('mute tap mutes', (await game.state()).muted);
  await t.canvasShot('muted icon');
  await t.realTapView(...c(l.hud.mute));
  await game.step(2);
  await t.realTapView(...c(l.hud.pause));
  await game.step(2);
  t.check('pause tap pauses', (await game.state()).mode === 'paused');
  await t.screenshot('pause page');
  await t.canvasShot('pause');
  await t.realPress(80);
  await game.step(2);
  t.check('press resumes from pause', (await game.state()).mode === 'playing', (await game.state()).mode);
  // and a real Escape / P on desktop
  if (!t.viewport.touch) {
    await t.page.keyboard.press('KeyP');
    await game.step(2);
    t.check('P pauses', (await game.state()).mode === 'paused');
    await t.page.keyboard.press('KeyP');
    await game.step(2);
  }
}

/** Long natural ride to see the zones change by themselves (Cannstatt -> Neckar -> Mitte, see ZoneRoute). */
async function longRide(t: PlaytestContext): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(4);
  await game.startRun();
  const from = (await game.state()).frame;
  const bot = new HumanBot(new Rng(9));
  const s = await ride(t, bot, 150 * 60, 'long ride', { shotEvery: 20 * 60, immortal: true });
  const ev = await game.eventsSince(from);
  const count = (n: string) => ev.filter((e) => e.name === n).length;
  await t.log('long ride', {
    time: s.time,
    zone: s.zoneIndex,
    score: s.score,
    speed: s.speed,
    crashes: count('crash'),
    stomps: count('stomp'),
    grinds: count('grindStart'),
    stars: count('starCollected'),
    chill: count('chillStart'),
    kinds: [...new Set(ev.filter((e) => e.name === 'crash').map((e) => (e.payload as { kind: string }).kind))],
  });
  const route = new ZoneRoute();
  const zones = ev.filter((e) => e.name === 'zoneChanged').map((e) => (e.payload as { index: number }).index);
  const expected = zones.map((_, k) => route.zoneOf(k + 1));
  t.check(
    'long ride leaves Bad Cannstatt and follows the route',
    zones.length > 0 && zones.every((z, k) => z === expected[k]),
    { zones, expected },
  );
}

async function freshRun(t: PlaytestContext, zone: number, speed: number | null = 110): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(3);
  await game.startRun();
  await game.setSpeed(speed);
  await game.setZone(zone);
  await game.step(20);
  await t.page.evaluate(() => window.__gameplay!.clear());
}

async function tricks(t: PlaytestContext): Promise<void> {
  const { game } = t;
  // Stomp a fan
  await freshRun(t, 1);
  await place(t, 'vfbFan', PLAYER_X + 130, 0, 0);
  const plan = planStomp(await game.state(), true);
  if (plan) {
    await game.step(plan.tick);
    await game.press();
    await game.step(plan.hold);
    await game.release();
    await stepWhile(t, (x) => !x.entities.some((e) => typeof e.data?.stompedAt === 'number'), { max: 120 });
    await t.canvasShot('stomp moment');
    await game.step(6);
    await t.canvasShot('stomp +6');
    await stepWhile(t, (x) => x.carriedItem === null, { max: 60 });
    await game.step(2);
    await t.canvasShot('stomp catch popup');
  }
  t.check('stomp plan exists', plan !== null);
  // Bench grind with a real-ish player
  await freshRun(t, 0);
  await place(t, 'bench', PLAYER_X + 90);
  const sb = new SolverBot(true);
  let s = await game.state();
  for (let i = 0; i < 300 && !s.player.grinding; i++) {
    const m = sb.next(s);
    if (m === 'press') await game.press();
    if (m === 'release') await game.release();
    s = await game.step(1);
  }
  await game.release();
  await game.step(3);
  await t.canvasShot('bench grind');
  // Duck under overhead in zone 0
  await freshRun(t, 0);
  await place(t, 'banner', PLAYER_X + 80);
  await game.step(4);
  await t.canvasShot('overhead ahead');
  await duckSet(t, true);
  await game.step(30);
  await t.canvasShot('ducking under');
  await duckSet(t, false);
  // Joint pickup
  await freshRun(t, 2, null);
  await place(t, 'joint', PLAYER_X + 70);
  await game.step(8);
  await t.canvasShot('joint ahead');
  await stepWhile(t, (x) => x.chillTimer <= 0, { max: 240 });
  await game.step(3);
  await t.canvasShot('joint pickup');
  await game.step(90);
  await t.canvasShot('chill active');
}

async function kidMode(t: PlaytestContext): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'playing') {
    await game.endRun();
    await game.step(2);
    await t.page.keyboard.press('Escape');
    await game.step(2);
  }
  if ((await game.state()).mode !== 'title') await t.page.reload();
  await t.page.waitForFunction(() => Boolean(window.__game));
  await game.pause();
  await dismissRotateHint(t);
  const l = await layout(t);
  const logo = { x: l.logo.x + Math.floor(l.logo.w / 2), y: l.logo.y + Math.floor(l.logo.h / 2) };
  await holdViewWhile(t, logo.x, logo.y, async () => {
    await game.step(100);
    await t.canvasShot('logo hold progress');
    await game.step(85);
  });
  await game.step(1);
  t.check('settings opened', (await settings(t)).screen === 'menu');
  await t.screenshot('settings page');
  const m = l.menu.toggle;
  await t.realTapView(m.x + Math.floor(m.w / 2), m.y + Math.floor(m.h / 2));
  await game.step(1);
  await t.canvasShot('kid mode on');
  // Close with Zurück: kid mode stays on for the kid run.
  const back = l.menu.back;
  await t.realTapView(back.x + Math.floor(back.w / 2), back.y + Math.floor(back.h / 2));
  await game.step(2);
  t.check('kid mode still on', (await game.state()).kidMode);
  await game.seed(7);
  await t.realPress(80);
  await game.step(2);
  const from = (await game.state()).frame;
  await game.step(30);
  await t.canvasShot('kid run start');
  await place(t, 'joint', PLAYER_X + 70);
  await place(t, 'wasenGuest', PLAYER_X + 220, 1, 0);
  await game.setZone(2);
  await game.step(10);
  await t.canvasShot('kid gum and visitor');
  const bot = new HumanBot(new Rng(3));
  await ride(t, bot, 40 * 60, 'kid ride', { shotEvery: 10 * 60, immortal: true });
  await t.log('kid ride', { crashes: (await game.eventsSince(from, 'crash')).length });
}

export default async function finalCasual(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await dismissRotateHint(t);
  await title(t);
  await firstRun(t);
  await crashToGameOver(t);
  await pauseAndMute(t);
  await longRide(t);
  await tricks(t);
  await kidMode(t);
  await t.game.setSpeed(null);
}
