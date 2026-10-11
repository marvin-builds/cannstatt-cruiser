/**
 * Waves and moving local hazards (ROADMAP 52 Phase 2, points 6 and 7;
 * src/gameplay/waves.ts, hazards.ts, pigeons.ts, hazard-art.ts,
 * src/audio/hazards.ts). Each is laid right ahead on an empty street with
 * `window.__gameplay.pattern(name)` at a pinned speed, in adult and in kid
 * mode, shot while it approaches and ridden by the careful solver bot with
 * real keys (Space jump, ArrowDown duck) on the frozen clock:
 * - the e-scooter rider coming in faster than the street (shots far and
 *   close), then passed without a crash; and once stomped with a real jump
 *   (planStomp): the rider tumbles off and sits dazed beside his scooter;
 * - the pigeons pecking, taking off as the skater nears (shots before and
 *   while flying); the bot ducks past them for their points, then jumps the
 *   low obstacle after them;
 * - a wave of 3-4 single obstacles in a steady rhythm (overview shot, a shot
 *   in the breather after it), ridden without a crash.
 * Checks: no crash, the pigeon points paid, the scooter whirr and the pigeon
 * flapping heard (`window.__audio.log`). The highscore worker is never
 * reached (the harness blocks it).
 *   npm run playtest -- --scenario scripts/scenarios/hazards.ts --viewports desktop,phone-landscape --name hazards
 */
import { PLAYER_X } from '../../src/core/config';
import { isPigeons, isScooter } from '../../src/gameplay/hazards';
import { planStomp, SolverBot } from '../../src/gameplay/testing';
import type { Entity, GameEvents, GameState } from '../../src/types';
import type {} from '../../src/audio/debug'; // window.__audio
import type {} from '../../src/player/debug'; // window.__player
import { adultMode, dismissRotateHint, type PlaytestContext, stepWhile } from '../playtest-lib';

const SPEED = 140;
/** Ticks the bot rides after a pattern was laid: past its end at SPEED. */
const RIDE_TICKS = 420;

async function freshRun(t: PlaytestContext, zone: number, kid: boolean): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'paused') await game.resumeGame();
  if ((await game.state()).mode === 'playing') await game.endRun();
  await t.page.evaluate((on) => window.__player!.kidMode(on), kid);
  await game.seed(9);
  await game.startRun();
  await game.setSpeed(SPEED);
  await game.setZone(zone);
  await game.step(20);
  await t.page.evaluate(() => window.__gameplay!.clear());
  await game.step(1);
}

async function lay(t: PlaytestContext, name: string, x: number): Promise<number[]> {
  return t.page.evaluate(([n, px]) => window.__gameplay!.pattern(n as string, px as number), [name, x] as const);
}

const find = (s: GameState, test: (e: Entity) => boolean) => s.entities.find(test);

/**
 * Rides `ticks` with the careful solver bot and real keys; `duckAlso(s)`
 * holds down on top of the bot's own ducking; `shots` take a canvas shot the
 * first tick their test holds. Returns the crashes since the start.
 */
async function ride(
  t: PlaytestContext,
  ticks: number,
  shots: { label: string; when: (s: GameState) => boolean }[] = [],
  duckAlso: (s: GameState) => boolean = () => false,
): Promise<GameEvents['crash'][]> {
  const { game } = t;
  const kb = t.page.keyboard;
  const bot = new SolverBot(true);
  let s = await game.state();
  const start = s.frame;
  let ducking = false;
  const pending = [...shots];
  for (let i = 0; i < ticks && s.mode === 'playing'; i++) {
    const move = bot.next(s);
    if (move === 'press') await kb.down('Space');
    if (move === 'release') await kb.up('Space');
    const duck = bot.duck(s) || duckAlso(s);
    if (duck !== ducking) await (duck ? kb.down('ArrowDown') : kb.up('ArrowDown'));
    ducking = duck;
    s = await game.step(1);
    const due = pending.findIndex((p) => p.when(s));
    if (due >= 0) await t.canvasShot(pending.splice(due, 1)[0]!.label);
  }
  await kb.up('Space');
  await kb.up('ArrowDown');
  return (await game.eventsSince(start, 'crash')).map((e) => e.payload as GameEvents['crash']);
}

async function heard(t: PlaytestContext, sound: string): Promise<boolean> {
  return t.page.evaluate((name) => window.__audio!.log.some((l) => l.sound === name), sound);
}

async function scooter(t: PlaytestContext, kid: boolean): Promise<void> {
  const mode = kid ? 'kid' : 'adult';
  await freshRun(t, kid ? 1 : 0, kid);
  await lay(t, 'scooter', PLAYER_X + 140);
  let s = await t.game.step(1);
  const rider = find(s, isScooter);
  t.check(`scooter (${mode}): laid`, rider !== undefined);
  if (!rider) return;
  const view = (await t.game.display()).viewWidth;
  // Approaching: first fully on screen, then close.
  while (find(s, isScooter)!.x > view - 40 && s.mode === 'playing') s = await t.game.step(1);
  await t.canvasShot(`scooter ${mode} approaching`);
  const crashes = await ride(t, RIDE_TICKS, [{ label: `scooter ${mode} close`, when: (x) => (find(x, isScooter)?.x ?? 0) - PLAYER_X < 70 }]);
  t.check(`scooter (${mode}): passed without a crash`, crashes.length === 0, crashes);
  t.check(`scooter (${mode}): its whirr was heard`, await heard(t, 'scooter'));
}

/** Lands on the rider with a real jump and photographs him tumbling off and sitting dazed by his scooter. */
async function stompScooter(t: PlaytestContext): Promise<void> {
  await freshRun(t, 0, false);
  await lay(t, 'scooter', PLAYER_X + 60);
  await t.game.step(1);
  const plan = planStomp(await t.game.state(), true);
  t.check('scooter: a stomp jump exists', plan !== null);
  if (!plan) return;
  const since = (await t.game.state()).frame;
  await t.game.step(plan.tick);
  await t.game.press();
  await t.game.step(plan.hold);
  await t.game.release();
  await stepWhile(t, (x) => !x.entities.some((e) => isScooter(e) && typeof e.data?.stompedAt === 'number'), { max: 120 });
  const stomps = await t.game.eventsSince(since, 'stomp');
  t.check('scooter: the rider can be stomped like a person', stomps.length === 1, stomps);
  await t.game.setSpeed(20);
  await t.game.step(3);
  await t.canvasShot('scooter stomp tumble');
  await t.game.step(40);
  await t.canvasShot('scooter stomp dazed');
}

async function pigeons(t: PlaytestContext, kid: boolean): Promise<void> {
  const mode = kid ? 'kid' : 'adult';
  await freshRun(t, 2, kid);
  const ids = await lay(t, 'pigeons', PLAYER_X + 120);
  let s = await t.game.step(1);
  const flock = find(s, isPigeons);
  t.check(`pigeons (${mode}): laid`, flock !== undefined);
  if (!flock) return;
  const start = s.frame;
  await t.canvasShot(`pigeons ${mode} on the street`);
  const flushed = (x: GameState) => typeof find(x, (e) => e.id === flock.id)?.data?.flushedAt === 'number';
  let since = -1;
  const crashes = await ride(
    t,
    RIDE_TICKS,
    [{ label: `pigeons ${mode} taking off`, when: (x) => flushed(x) && ++since >= 6 }],
    // Duck past the flock (it pays), the bot does the rest.
    (x) => {
      const f = find(x, (e) => e.id === flock.id);
      return !!f && !f.done && f.x - PLAYER_X < 40;
    },
  );
  const cleared = (await t.game.eventsSince(start, 'obstacleCleared')).map((e) => e.payload as GameEvents['obstacleCleared']);
  t.check(`pigeons (${mode}): no crash`, crashes.length === 0, crashes);
  t.check(`pigeons (${mode}): ducking past them paid`, cleared.some((c) => c.entityId === flock.id && c.points > 0), cleared);
  t.check(`pigeons (${mode}): the flapping was heard`, await heard(t, 'pigeons'));
  await t.log(`pigeons ${mode}`, { ids });
}

async function wave(t: PlaytestContext, kid: boolean): Promise<void> {
  const mode = kid ? 'kid' : 'adult';
  await freshRun(t, 1, kid);
  const ids = await lay(t, 'wave', PLAYER_X + 20);
  const s = await t.game.step(1);
  const pieces = s.entities.filter((e) => ids.includes(e.id) && e.kind !== 'star');
  t.check(`wave (${mode}): 3-4 single obstacles`, pieces.length >= 3 && pieces.length <= 4, pieces.map((e) => e.kind));
  await t.canvasShot(`wave ${mode} overview`);
  const last = Math.max(...pieces.map((e) => e.id));
  const crashes = await ride(t, RIDE_TICKS + 120, [{ label: `wave ${mode} breather`, when: (x) => (find(x, (e) => e.id === last)?.x ?? Infinity) < PLAYER_X - 60 }]);
  t.check(`wave (${mode}): ridden without a crash`, crashes.length === 0, crashes);
}

export default async function hazards(t: PlaytestContext): Promise<void> {
  await dismissRotateHint(t);
  await t.game.pause();
  await adultMode(t);
  await stompScooter(t);
  for (const kid of [false, true]) {
    await scooter(t, kid);
    await pigeons(t, kid);
    await wave(t, kid);
  }
  await t.screenshot('hazards end');
}
