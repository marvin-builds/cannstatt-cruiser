/**
 * Item use in gameplay: throwing the football at a Wasen visitor (hit, tumble,
 * points), a missed throw that ricochets back and knocks the skater off,
 * eating a Brezel (+1 health) and drinking a Maßkrug on a live street (drunk
 * for DRUNK_DURATION, only easy patterns while drunk: no people, nothing
 * overhead, no rails).
 *   npm run playtest -- --scenario scripts/scenarios/items.ts --viewports desktop,phone-landscape,phone-portrait --name items
 */
import { PLAYER_X } from '../../src/core/config';
import { isOverhead, isPerson, isRail } from '../../src/gameplay/catalogue';
import type { PlaceableKind } from '../../src/gameplay/debug';
import { SolverBot } from '../../src/gameplay/testing';
import { DRUNK_DURATION } from '../../src/gameplay/use';
import type {} from '../../src/player/debug'; // window.__player
import type { CarriedItem, EntityKind, GameEvents, GameState } from '../../src/types';
import { adultMode, dismissRotateHint, type PlaytestContext } from '../playtest-lib';

function place(t: PlaytestContext, kind: PlaceableKind, x: number, variant = 0, prop = 0): Promise<number> {
  return t.page.evaluate(
    ([k, px, v, p]) => window.__gameplay!.place(k as PlaceableKind, px as number, v as number, p as number),
    [kind, x, variant, prop] as const,
  );
}

const carry = (t: PlaytestContext, item: CarriedItem) => t.page.evaluate((i) => window.__player!.carry(i), item);
const use = (t: PlaytestContext) => t.page.evaluate(() => window.__game!.input.use());

/** A fresh frozen run in `zone` at a pinned speed; `clear` empties the street. */
async function freshRun(t: PlaytestContext, zone: number, seed = 3, clear = true): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(seed);
  await game.startRun();
  await game.setSpeed(110);
  await game.setZone(zone);
  await game.step(20);
  if (clear) await t.page.evaluate(() => window.__gameplay!.clear());
}

/** Steps until event `name` is emitted, at most `max` ticks; true if it was. */
async function until(t: PlaytestContext, name: keyof GameEvents, max = 200): Promise<boolean> {
  const from = (await t.game.state()).frame;
  for (let i = 0; i < max; i++) {
    await t.game.step(1);
    if ((await t.game.eventsSince(from, name)).length > 0) return true;
  }
  return false;
}

export default async function items(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await dismissRotateHint(t);
  await adultMode(t); // adult content below; kid mode is the default
  await throwAndHit(t);
  await ricochet(t);
  await eat(t);
  await drink(t);
  await t.game.setSpeed(null);
}

async function throwAndHit(t: PlaytestContext): Promise<void> {
  await freshRun(t, 2);
  await place(t, 'wasenGuest', PLAYER_X + 130, 1, 0);
  await carry(t, 'football');
  await t.game.step(2);
  await t.canvasShot('carrying the football');
  await use(t);
  await t.game.step(6);
  await t.canvasShot('ball in flight');
  t.check('thrown ball hits the visitor', await until(t, 'ballHit', 60));
  await t.canvasShot('ball hits visitor');
  await t.game.step(30);
  await t.canvasShot('visitor tumbled, ball lies');
}

/** A miss on an empty street: the first seed whose rng lets it ricochet back. */
async function ricochet(t: PlaytestContext): Promise<void> {
  let back = false;
  for (let seed = 1; seed <= 12 && !back; seed++) {
    await freshRun(t, 1, seed);
    await carry(t, 'football');
    await t.game.step(1);
    await use(t);
    back = await until(t, 'ballBack', 90);
  }
  t.check('a missed ball ricochets back on some seed', back);
  await t.canvasShot('ricochet starts');
  await t.game.step(12);
  await t.canvasShot('ricochet bouncing towards the skater');
  t.check('the ricochet knocks the skater off when he stays on the ground', await until(t, 'crash', 120));
  await t.game.step(4);
  await t.canvasShot('knocked off by the ball');
}

async function eat(t: PlaytestContext): Promise<void> {
  await freshRun(t, 2);
  await t.game.setHealth(3);
  await carry(t, 'pretzel');
  await t.game.step(1);
  await use(t);
  await t.game.step(1);
  const health = (await t.game.state()).health;
  t.check('eating the Brezel gives one health', health === 4, health);
  await t.game.step(10);
  await t.canvasShot('after eating');
}

/** The solver bot rides `ticks` ticks (speed pinned); `note` sees every state. */
async function ride(t: PlaytestContext, bot: SolverBot, ticks: number, note: (s: GameState) => void): Promise<GameState> {
  const { game } = t;
  let s = await game.state();
  let ducked = false;
  for (let i = 0; i < ticks && s.mode === 'playing'; i++) {
    const move = bot.next(s);
    if (move === 'press') await game.press();
    if (move === 'release') await game.release();
    const duck = bot.duck(s);
    if (duck !== ducked) {
      await t.page.evaluate((d) => (d ? window.__game!.input.duck.press() : window.__game!.input.duck.release()), duck);
      ducked = duck;
    }
    s = await game.step(1);
    note(s);
  }
  await game.release();
  if (ducked) await t.page.evaluate(() => window.__game!.input.duck.release());
  return s;
}

/**
 * Drinks on a live street while the solver bot rides. A Maßkrug in hand
 * already counts as drunk for the spawner, so everything that comes onto the
 * street from the catch on must be an easy pattern.
 */
async function drink(t: PlaytestContext): Promise<void> {
  await freshRun(t, 2, 5, false);
  // Fast enough that several patterns come during the drunk seconds on every view width.
  await t.game.setSpeed(150);
  const bot = new SolverBot(true);
  const sober = Math.max(0, ...(await ride(t, bot, 120, () => {})).entities.map((e) => e.id));
  await carry(t, 'beer');
  const seen = new Map<number, EntityKind>();
  const note = (s: GameState) => s.entities.forEach((e) => e.id > sober && seen.set(e.id, e.kind));
  const carried = await ride(t, bot, 120, note);
  t.check('the Maßkrug is still in hand', carried.carriedItem === 'beer', carried.carriedItem);
  await use(t);
  const drinking = await ride(t, bot, 60, note);
  t.check('drinking makes the skater drunk', drinking.drunkTimer > DRUNK_DURATION - 1.5 && drinking.drunkTimer < DRUNK_DURATION, {
    drunk: drinking.drunkTimer,
    DRUNK_DURATION,
  });
  await t.canvasShot('drunk with easy street');
  await ride(t, bot, 180, note);
  await t.canvasShot('drunk later');
  const kinds = [...seen.values()];
  t.check('new patterns come while drunk', kinds.length > 0, kinds);
  t.check('no people, overhead obstacles or rails come while drunk', !kinds.some((k) => isPerson(k) || isOverhead(k) || isRail(k)), kinds);
  await t.log('after drunk scenario');
}
