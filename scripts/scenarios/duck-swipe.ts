/**
 * Duck chains within one swipe (ROADMAP 66, src/gameplay/duck-span.ts): the
 * sign combinations (mixes.ts) are laid right ahead on an empty street with
 * `window.__gameplay.pattern(name, x, seed)` at the start speed and at top
 * speed, shot as an overview, and ridden by the touch human bot
 * (HUMAN_TOUCH_STYLE: every duck is a swipe that lasts SWIPE_DUCK_TICKS, a
 * jump ends it, and it stands a moment before it swipes again). A shot is
 * taken whenever it is ducked under two signs in one go. Checks per layout:
 * at most two signs in one go, and the touch bot rides it without a crash.
 *   npm run playtest -- --scenario scripts/scenarios/duck-swipe.ts --viewports phone-landscape,desktop --name duck-swipe
 */
import { BASE_SPEED } from '../../src/core/config';
import { Rng } from '../../src/core/rng';
import { TOP_SPEED } from '../../src/gameplay/difficulty';
import { duckGroups, MAX_ONE_GO_SIGNS } from '../../src/gameplay/duck-span';
import { HUMAN_TOUCH_STYLE, HumanBot } from '../../src/gameplay/testing';
import type { Entity, GameState } from '../../src/types';
import { dismissRotateHint, type PlaytestContext } from '../playtest-lib';

const TEMPLATES = ['mixedFour', 'duckJumpDuck', 'mixedFive'];
const SEEDS = [1, 2, 3, 4];
/** Ticks ridden after a layout is placed: past its end at the start speed. */
const RIDE_TICKS = 600;
/** Pairs ducked in one go shot per speed. */
const PAIR_SHOTS = 2;

const isSign = (e: Pick<Entity, 'kind'>) => e.kind === 'banner' || e.kind === 'stopSign';

async function freshRun(t: PlaytestContext, speed: number): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'paused') await game.resumeGame();
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(3);
  await game.startRun();
  await game.setSpeed(speed);
  await game.setZone(1);
  await game.step(20);
  await t.page.evaluate(() => window.__gameplay!.clear());
  await game.step(1);
}

/** Two signs over the skater at once, or one over him and the next close behind (ducked in one go). */
function underPair(s: GameState): boolean {
  const signs = s.entities.filter((e) => isSign(e) && !e.done).sort((a, b) => a.x - b.x);
  const over = signs.findIndex((e) => e.x <= s.player.x + 8 && e.x + e.w >= s.player.x - 8);
  return over >= 0 && s.player.state === 'duck' && !!signs[over + 1] && signs[over + 1]!.x - (signs[over]!.x + signs[over]!.w) < s.speed * 0.5;
}

async function rideLayout(t: PlaytestContext, name: string, seed: number, speed: number, shots: { left: number }): Promise<void> {
  const { game } = t;
  await freshRun(t, speed);
  const ids = await t.page.evaluate(([n, sd]) => window.__gameplay!.pattern(n as string, undefined, sd as number), [name, seed] as const);
  let s = await game.step(1);
  const start = s.frame;
  const signs = s.entities.filter((e) => ids.includes(e.id) && isSign(e));
  const most = Math.max(0, ...duckGroups(signs, speed).map((g) => g.signs));
  t.check(`${name} seed ${seed} at ${speed}: at most ${MAX_ONE_GO_SIGNS} signs in one go`, most <= MAX_ONE_GO_SIGNS, { most });
  if (seed === SEEDS[0]) await t.canvasShot(`${name} at ${speed} overview`);
  const bot = new HumanBot(new Rng(seed * 31 + speed), true, HUMAN_TOUCH_STYLE);
  let ducking = false;
  let shotThisRide = false;
  for (let i = 0; i < RIDE_TICKS && s.mode === 'playing'; i++) {
    const move = bot.next(s);
    if (move === 'press') await game.press();
    if (move === 'release') await game.release();
    const duck = bot.duck(s);
    if (duck !== ducking) await t.page.evaluate((d) => (d ? window.__game!.input.duck.press() : window.__game!.input.duck.release()), duck);
    ducking = duck;
    s = await game.step(1);
    if (!shotThisRide && shots.left > 0 && underPair(s)) {
      shotThisRide = true;
      shots.left--;
      await t.canvasShot(`${name} seed ${seed} at ${speed}: two signs in one swipe`);
    }
    if (!s.entities.some((e) => ids.includes(e.id) && !e.done)) break;
  }
  await t.page.evaluate(() => window.__game!.input.duck.release());
  await game.release();
  const crashes = await game.eventsSince(start, 'crash');
  t.check(`${name} seed ${seed} at ${speed}: the touch bot ducks it without a crash`, crashes.length === 0, crashes.map((c) => c.payload));
}

export default async function duckSwipe(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await dismissRotateHint(t);
  for (const speed of [BASE_SPEED, TOP_SPEED]) {
    const shots = { left: PAIR_SHOTS };
    for (const name of TEMPLATES) for (const seed of SEEDS) await rideLayout(t, name, seed, speed, shots);
  }
  await t.game.setSpeed(null);
}
