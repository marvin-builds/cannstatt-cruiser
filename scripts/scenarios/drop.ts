/**
 * Dropped items (ROADMAP 19): the thrown football hits a Wasen visitor, the
 * visitor's item falls in a short arc onto the street ahead and lies there;
 * riding on picks it up like a caught item (itemCaught, carriedItem) without
 * any input. Also: kid mode drops a Lebkuchenherz instead of the Maßkrug, a
 * picked-up Maßkrug starts the auto-drink clock, a pickup replaces what the
 * skater carries, and a low jump through the item collects it mid-air.
 * Checked through events and state, and through window.__gameplay.drops()
 * (the falling / lying items, which are no entities).
 *   npm run playtest -- --scenario scripts/scenarios/drop.ts --viewports desktop,phone-landscape,phone-portrait --name drop
 */
import { GROUND_Y, PLAYER_X, TICK_DT } from '../../src/core/config';
import { BEER_AUTO_DRINK } from '../../src/gameplay/auto-drink';
import type { PlaceableKind } from '../../src/gameplay/debug';
import { DROP_TIME, ITEM_BOX } from '../../src/gameplay/drop';
import type {} from '../../src/player/debug'; // window.__player
import type { CarriedItem, GameEvents } from '../../src/types';
import { adultMode, dismissRotateHint, type PlaytestContext } from '../playtest-lib';

const FALL_TICKS = Math.round(DROP_TIME / TICK_DT);
/** Pinned speed: the item reaches the skater about a second after the hit. */
const SPEED = 110;
/** Wasen visitor props: 0 Maßkrug (kid mode: Lebkuchenherz), 1 Brezel. */
const BEER = 0;
const PRETZEL = 1;

const place = (t: PlaytestContext, kind: PlaceableKind, x: number, variant: number, prop: number) =>
  t.page.evaluate(([k, px, v, p]) => window.__gameplay!.place(k as PlaceableKind, px as number, v as number, p as number), [
    kind,
    x,
    variant,
    prop,
  ] as const);
const carry = (t: PlaytestContext, item: CarriedItem | null) => t.page.evaluate((i) => window.__player!.carry(i), item);
const drops = (t: PlaytestContext) => t.page.evaluate(() => window.__gameplay!.drops());
const kidMode = (t: PlaytestContext, on: boolean) => t.page.evaluate((k) => window.__player!.kidMode(k), on);

export default async function drop(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await dismissRotateHint(t);
  await adultMode(t); // adult content below; kid mode is the default
  await rideOver(t);
  await kidModeNeverBeer(t);
  await beerStartsAutoDrink(t);
  await replacesCarried(t);
  await midAir(t);
  await kidMode(t, false);
  await t.game.setSpeed(null);
}

/** A fresh frozen run in Bad Cannstatt on an empty street, a visitor holding `prop` ahead and the football in hand. */
async function setup(t: PlaytestContext, prop: number, seed = 3): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'paused') await game.resumeGame();
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(seed);
  await game.startRun();
  await game.setSpeed(SPEED);
  await game.setZone(2);
  await game.step(20);
  await t.page.evaluate(() => window.__gameplay!.clear());
  await place(t, 'wasenGuest', PLAYER_X + 110, 1, prop);
  await carry(t, 'football');
  await game.step(1);
}

/** Steps until event `name` is emitted (at most `max` ticks); its payloads. */
async function until<K extends keyof GameEvents>(t: PlaytestContext, name: K, max: number): Promise<GameEvents[K][]> {
  const from = (await t.game.state()).frame;
  for (let i = 0; i < max; i++) {
    await t.game.step(1);
    const seen = await t.game.eventsSince(from, name);
    if (seen.length > 0) return seen.map((e) => e.payload as GameEvents[K]);
  }
  return [];
}

/** Throws the football and steps to the hit; true if the ball hit the visitor. */
async function throwToHit(t: PlaytestContext): Promise<boolean> {
  await t.page.evaluate(() => window.__game!.input.use());
  return (await until(t, 'ballHit', 90)).length === 1;
}

async function rideOver(t: PlaytestContext): Promise<void> {
  const { game } = t;
  await setup(t, PRETZEL);
  t.check('ball hits the visitor', await throwToHit(t));
  await t.canvasShot('ball hits the visitor');
  const start = (await game.state()).frame;
  await game.step(Math.round(FALL_TICKS / 2));
  const falling = await drops(t);
  t.check('drops(): the Brezel is falling', falling.length === 1 && falling[0]!.item === 'pretzel' && !falling[0]!.lying, falling);
  await t.canvasShot('Brezel falling');
  await game.step(FALL_TICKS - Math.round(FALL_TICKS / 2) + 2);
  await t.canvasShot('Brezel lies on the street');
  const lying = await drops(t);
  const d = lying[0];
  t.check(
    'drops(): it lies on the street ahead of the skater',
    lying.length === 1 && !!d && d.lying && d.y + d.h === GROUND_Y && d.w === ITEM_BOX && d.x > PLAYER_X,
    lying,
  );
  let s = await game.state();
  t.check('the item is not caught at once (it falls first)', s.carriedItem === null && (await game.eventsSince(start, 'itemCaught')).length === 0, s.carriedItem);
  const caught = await until(t, 'itemCaught', 180);
  s = await game.state();
  t.check('riding on picks up the Brezel', caught.length === 1 && caught[0]!.item === 'pretzel' && s.carriedItem === 'pretzel', { caught, carried: s.carriedItem });
  t.check('drops(): nothing left on the street after the pickup', (await drops(t)).length === 0);
  t.check('the pickup needs no jump', (await game.eventsSince(start, 'jump')).length === 0 && (await game.eventsSince(start, 'crash')).length === 0);
  await game.step(6);
  await t.canvasShot('Brezel picked up');
}

async function kidModeNeverBeer(t: PlaytestContext): Promise<void> {
  await kidMode(t, true);
  await setup(t, BEER);
  t.check('kid mode: ball hits the visitor', await throwToHit(t));
  await t.game.step(FALL_TICKS + 2);
  await t.canvasShot('kid mode Lebkuchenherz lies on the street');
  const caught = await until(t, 'itemCaught', 180);
  t.check('kid mode drops a Lebkuchenherz, never beer', caught.length === 1 && caught[0]!.item === 'gingerbread', caught);
  await kidMode(t, false);
}

async function beerStartsAutoDrink(t: PlaytestContext): Promise<void> {
  const { game } = t;
  await setup(t, BEER);
  t.check('beer visitor: ball hits', await throwToHit(t));
  const caught = await until(t, 'itemCaught', 240);
  t.check('a Maßkrug is picked up', caught.length === 1 && caught[0]!.item === 'beer', caught);
  const from = (await game.state()).frame;
  // Keep the street empty while waiting: a crash would cost the Maßkrug.
  for (let left = Math.round(BEER_AUTO_DRINK / TICK_DT) - 2; left > 0; left -= 20) {
    await t.page.evaluate(() => window.__gameplay!.clear());
    await game.step(Math.min(20, left));
  }
  const early = await game.eventsSince(from, 'drunkStart');
  const drunk = await until(t, 'drunkStart', 4);
  const crashes = await game.eventsSince(from, 'crash');
  t.check('the auto-drink clock starts at the pickup (drunk after BEER_AUTO_DRINK s)', early.length === 0 && drunk.length === 1, { early, drunk, crashes });
}

async function replacesCarried(t: PlaytestContext): Promise<void> {
  await setup(t, PRETZEL);
  t.check('replace: ball hits', await throwToHit(t));
  await carry(t, 'football');
  const caught = await until(t, 'itemCaught', 240);
  const s = await t.game.state();
  t.check('a pickup replaces what the skater carries (newest wins)', caught.length === 1 && s.carriedItem === 'pretzel', { caught, carried: s.carriedItem });
}

/** Low jumps (one-tick taps) started a little later each time, until one collects the item in the air. */
async function midAir(t: PlaytestContext): Promise<void> {
  const { game } = t;
  for (let wait = 0; wait < 60; wait += 2) {
    await setup(t, PRETZEL);
    if (!(await throwToHit(t))) continue;
    await game.step(wait);
    const from = (await game.state()).frame;
    await game.press();
    for (let i = 0; i < 80; i++) {
      const s = await game.step(1);
      if (i === 0) await game.release();
      if ((await game.eventsSince(from, 'itemCaught')).length === 0) continue;
      if (s.player.grounded) break;
      t.check('a low jump through the item collects it mid-air', true, { wait, y: s.player.y });
      await t.canvasShot('picked up mid-air');
      return;
    }
  }
  t.check('a low jump through the item collects it mid-air', false, 'no wait from 0 to 58 ticks worked');
}
