/**
 * Combo patterns (ROADMAP 33, src/gameplay/combos.ts): each combo is laid
 * right ahead on an empty street with `window.__gameplay.pattern(name)`
 * (src/gameplay/debug.ts), shot as an overview (are the stars a readable
 * line?), then ridden by the human bot (src/gameplay/testing.ts, take-off
 * +-4 ticks, three hold lengths), which follows the line where its window
 * allows: a shot after every grind and at the end. Checks per combo: no
 * crash, at least one grind on its pieces, and most of its stars collected.
 *   npm run playtest -- --scenario scripts/scenarios/combos.ts --viewports desktop,phone-landscape --name combos
 */
import { Rng } from '../../src/core/rng';
import { COMBO_NAMES } from '../../src/gameplay/combos';
import { HumanBot } from '../../src/gameplay/testing';
import type { GameEvents } from '../../src/types';
import { dismissRotateHint, type PlaytestContext } from '../playtest-lib';

/** Pinned speed (a mid-run speed). */
const SPEED = 130;
/** Zone per combo (themes the street behind it). */
const ZONES = [2, 1, 0, 2];
/** Ticks the bot rides after the combo is placed: past its end at SPEED. */
const RIDE_TICKS = 300;
/** Ticks after a grind starts before its shot. */
const GRIND_SHOT_DELAY = 6;

async function freshRun(t: PlaytestContext, zone: number): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'paused') await game.resumeGame();
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(5);
  await game.startRun();
  await game.setSpeed(SPEED);
  await game.setZone(zone);
  await game.step(20);
  await t.page.evaluate(() => window.__gameplay!.clear());
  await game.step(1);
}

async function rideCombo(t: PlaytestContext, name: string, zone: number): Promise<void> {
  const { game } = t;
  await freshRun(t, zone);
  const ids = await t.page.evaluate((n) => window.__gameplay!.pattern(n), name);
  const start = await game.step(2);
  const placed = start.entities.filter((e) => ids.includes(e.id));
  const stars = placed.filter((e) => e.kind === 'star').length;
  const pieces = placed.filter((e) => e.kind !== 'star').map((e) => e.id);
  t.check(`${name}: placed with stars`, pieces.length >= 2 && stars >= 3, placed.map((e) => e.kind));
  await t.canvasShot(`${name} overview`);
  await t.log(`${name} placed`, { ids });

  const bot = new HumanBot(new Rng(3), true);
  let s = start;
  let grinds = 0;
  for (let i = 0; i < RIDE_TICKS && s.mode === 'playing'; i++) {
    const move = bot.next(s);
    if (move === 'press') await game.press();
    if (move === 'release') await game.release();
    s = await game.step(1);
    const started = (await game.eventsSince(start.frame, 'grindStart')).length;
    if (started > grinds) {
      grinds = started;
      // Keep the bot's input going while the shot waits.
      for (let k = 0; k < GRIND_SHOT_DELAY; k++) {
        const m = bot.next(s);
        if (m === 'press') await game.press();
        if (m === 'release') await game.release();
        s = await game.step(1);
      }
      await t.canvasShot(`${name} grind ${grinds}`);
    }
  }
  await game.release();
  await t.canvasShot(`${name} end`);
  const events = async <K extends keyof GameEvents>(k: K) => (await game.eventsSince(start.frame, k)).map((e) => e.payload as GameEvents[K]);
  const crashes = await events('crash');
  const ground = (await events('grindStart')).filter((g) => pieces.includes(g.entityId));
  const collected = (await events('starCollected')).filter((c) => ids.includes(c.entityId)).length;
  t.check(`${name}: the human bot rides it without a crash`, crashes.length === 0, crashes);
  t.check(`${name}: the bot grinds the line`, ground.length >= 1, ground);
  t.check(`${name}: the bot collects most stars (${collected}/${stars})`, collected * 2 >= stars, { collected, stars });
  await t.log(`${name} ridden`, { grinds: ground.length, collected, stars });
}

export default async function combos(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await dismissRotateHint(t);
  for (const [i, name] of COMBO_NAMES.entries()) await rideCombo(t, name, ZONES[i % ZONES.length]!);
}
