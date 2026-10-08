/**
 * Gameplay showcase: a bot that jumps by the solver's plan (real jump arcs)
 * and ducks under overhead obstacles rides 60 s on seed 1 through all three
 * zones, checks that nothing spawns inside the view, grinds a rail, then a run
 * without input must end in game over. Finally the same at the widest view
 * (427 px). On phone-portrait it taps the rotate hint away first.
 *   npm run playtest -- --scenario scripts/scenarios/gameplay.ts --viewports desktop,phone-landscape --name gameplay
 */
import { PLAYER_X } from '../../src/core/config';
import { TOP_SPEED } from '../../src/gameplay/difficulty';
import { SolverBot } from '../../src/gameplay/testing';
import type { GameState } from '../../src/types';
import { dismissRotateHint, type PlaytestContext } from '../playtest-lib';

const SECONDS = 60;

interface RideStats {
  crashes: number;
  popIns: { id: number; kind: string; x: number; viewWidth: number }[];
  grindShot: boolean;
  state: GameState;
}

/** Bot ride for `ticks` ticks with zone changes and screenshots at the given seconds. */
async function botRide(t: PlaytestContext, label: string, ticks: number, shotsAt: number[]): Promise<RideStats> {
  const { game } = t;
  const bot = new SolverBot();
  const seen = new Set<number>();
  /** Kinds already photographed on their first full appearance. */
  const shotKinds = new Set<string>();
  const stats: RideStats = { crashes: 0, popIns: [], grindShot: false, state: await game.state() };
  for (const e of stats.state.entities) seen.add(e.id);
  let ducked = false;
  /** One tick with the bot's input (every tick goes through here, so the bot never loses count). */
  const drive = async () => {
    const move = bot.next(stats.state);
    if (move === 'press') await game.press();
    if (move === 'release') await game.release();
    const wantDuck = bot.duck(stats.state);
    if (wantDuck !== ducked) {
      await t.page.evaluate((d) => (d ? window.__game!.input.duck.press() : window.__game!.input.duck.release()), wantDuck);
      ducked = wantDuck;
    }
    const health = stats.state.health;
    stats.state = await game.step(1);
    if (stats.state.health < health) {
      stats.crashes++;
      const near = stats.state.entities.filter((e) => e.kind !== 'star' && Math.abs(e.x - PLAYER_X) < 120).map((e) => `${e.kind}@${Math.round(e.x - PLAYER_X)}`);
      await t.log(`${label} crash`, { time: stats.state.time, near, player: stats.state.player });
    }
  };
  for (let i = 0; i < ticks && stats.state.mode === 'playing'; i++) {
    await drive();
    const { viewWidth } = await game.display();
    for (const e of stats.state.entities) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      if (e.x < viewWidth) stats.popIns.push({ id: e.id, kind: e.kind, x: e.x, viewWidth });
    }
    const arrived = stats.state.entities.find((e) => !shotKinds.has(e.kind) && e.x + e.w < viewWidth - 8);
    if (arrived) {
      shotKinds.add(arrived.kind);
      await t.canvasShot(`${label} first ${arrived.kind} zone ${stats.state.zoneIndex}`);
    }
    const second = i / 60;
    if (i === 20 * 60) await game.setZone(1);
    if (i === 40 * 60) await game.setZone(2);
    if (shotsAt.includes(second)) await t.canvasShot(`${label} ${second}s zone ${stats.state.zoneIndex}`);
    if (!stats.grindShot && stats.state.player.state === 'grind') {
      const before = stats.state.score;
      for (let k = 0; k < 12; k++) await drive();
      await t.canvasShot(`${label} grind`);
      t.check(`${label}: grind ticks points`, stats.state.score > before, { before, after: stats.state.score });
      stats.grindShot = true;
    }
  }
  if (ducked) await t.page.evaluate(() => window.__game!.input.duck.release());
  return stats;
}

export default async function gameplay(t: PlaytestContext): Promise<void> {
  const { game, page } = t;
  await game.pause();
  await dismissRotateHint(t);
  await game.setSpeed(null);
  await game.seed(1);
  await game.startRun();

  const ride = await botRide(t, 'bot', SECONDS * 60, [6, 15, 25, 35, 45, 55]);
  await t.log('bot ride', { crashes: ride.crashes, score: ride.state.score, stars: ride.state.stars });
  t.check('bot survives 60 s on seed 1', ride.state.mode === 'playing' && ride.state.health > 0, {
    mode: ride.state.mode,
    health: ride.state.health,
    crashes: ride.crashes,
  });
  t.check('bot scores points', ride.state.score > 0, { score: ride.state.score });
  t.check('bot grinds a rail (player.state grind)', ride.grindShot);
  t.check('nothing spawns inside the view', ride.popIns.length === 0, ride.popIns);

  await game.setSpeed(TOP_SPEED);
  await game.step(240);
  await t.canvasShot('max speed');
  await game.setSpeed(null);

  // Doing nothing: obstacles hit until the health is gone.
  await game.endRun();
  await game.seed(1);
  await game.startRun();
  let idle = await game.state();
  for (let i = 0; i < 60 && idle.mode === 'playing'; i++) {
    idle = await game.step(60);
    if (i === 5) await t.canvasShot('idle crash course');
  }
  await t.log('idle run', { mode: idle.mode, time: idle.time });
  t.check('doing nothing ends the run', idle.mode === 'gameover', { mode: idle.mode, health: idle.health, time: idle.time });

  // Widest view: 427 px (1708x720 at scale 4) must not show spawns popping in either.
  const size = page.viewportSize()!;
  await page.setViewportSize({ width: 1708, height: 720 });
  await t.wait(200);
  await game.seed(1);
  await game.startRun();
  const wide = await botRide(t, 'wide', 20 * 60, [8, 18]);
  t.check('427 px: view is 427 wide', (await game.display()).viewWidth === 427);
  t.check('427 px: nothing spawns inside the view', wide.popIns.length === 0, wide.popIns);
  t.check('427 px: bot survives', wide.state.mode === 'playing' && wide.crashes === 0, { crashes: wide.crashes });
  await page.setViewportSize(size);
  await t.wait(200);
}
