/**
 * Combo patterns (ROADMAP 33, src/gameplay/combos.ts): each combo is laid
 * right ahead on an empty street with `window.__gameplay.pattern(name)`
 * (src/gameplay/debug.ts), shot as an overview (are the stars a readable
 * line?), then ridden by the human bot (src/gameplay/testing.ts, take-off
 * +-4 ticks, three hold lengths), which follows the line where its window
 * allows: a shot after every grind and at the end. Checks per combo: no
 * crash, at least one grind on its pieces, and most of its stars collected.
 *
 * Then the combinations (ROADMAP 52 6a, src/gameplay/mixes.ts) on a real
 * street: a fresh run started at a tier 2 distance (`__gameplay.startAt`),
 * ridden 3 min by the careful solver bot with real keys (Space jump,
 * ArrowDown duck) on the frozen clock. The spawner's log
 * (`__gameplay.patterns()`) names every template laid; a shot is taken as
 * the skater enters each of the first MIX_SHOTS different combinations.
 * Logged: the templates seen, elements per pattern and crashes (with the
 * pattern ridden). Checks: at least MIX_SHOTS different combinations met,
 * the careful bot never crashed inside one. The highscore worker is never
 * reached (the harness blocks it).
 *   npm run playtest -- --scenario scripts/scenarios/combos.ts --viewports desktop,phone-landscape --name combos
 */
import { Rng } from '../../src/core/rng';
import { COMBO_NAMES } from '../../src/gameplay/combos';
import { MIX_NAMES } from '../../src/gameplay/mixes';
import type { LaidPattern } from '../../src/gameplay/pattern-log';
import { HumanBot, SolverBot } from '../../src/gameplay/testing';
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

/** The mixed street ride: seed, start distance (tier 2, ~50 s into a run), seconds ridden, combinations shot. */
const MIX_SEED = 7;
const MIX_FROM = 5000;
const MIX_SECONDS = 180;
const MIX_SHOTS = 6;
/** Ticks between reads of the spawner's log. */
const LOG_EVERY = 6;

/** The pattern the skater rides at run distance `distance`: the last one laid that starts before it. */
function riddenAt(log: readonly LaidPattern[], distance: number): LaidPattern | undefined {
  return log.filter((p) => p.street <= distance).pop();
}

async function rideMixes(t: PlaytestContext): Promise<void> {
  const { game } = t;
  const kb = t.page.keyboard;
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.setSpeed(null);
  await game.seed(MIX_SEED);
  await game.startRun();
  await t.page.evaluate((d) => window.__gameplay!.startAt(d), MIX_FROM);
  const bot = new SolverBot();
  const shot = new Set<string>();
  const crashes: { t: number; pattern?: string }[] = [];
  let log: LaidPattern[] = [];
  let s = await game.state();
  let health = s.health;
  let ducking = false;
  for (let tick = 0; tick < MIX_SECONDS * 60 && s.mode === 'playing'; tick++) {
    const move = bot.next(s);
    if (move === 'press') await kb.down('Space');
    if (move === 'release') await kb.up('Space');
    const duck = bot.duck(s);
    if (duck !== ducking) await (duck ? kb.down('ArrowDown') : kb.up('ArrowDown'));
    ducking = duck;
    s = await game.step(1);
    if (s.health < health) {
      crashes.push({ t: +s.time.toFixed(1), pattern: riddenAt(log, s.distance)?.name });
      await game.setHealth(s.maxHealth);
    }
    health = s.health;
    if (tick % LOG_EVERY !== 0) continue;
    log = await t.page.evaluate(() => window.__gameplay!.patterns());
    // A combination whose start the skater just passed: it lies ahead on screen.
    const entering = log.find((p) => MIX_NAMES.includes(p.name) && !shot.has(p.name) && p.street <= s.distance && s.distance - p.street < s.speed * 0.15);
    if (entering && shot.size < MIX_SHOTS) {
      shot.add(entering.name);
      await t.canvasShot(`mix ${entering.name} (${entering.elements} elements) t${Math.round(s.time)}`);
    }
  }
  await kb.up('Space');
  await kb.up('ArrowDown');
  const templates = log.filter((p) => p.street >= MIX_FROM);
  const mixes = templates.filter((p) => MIX_NAMES.includes(p.name));
  const inMix = crashes.filter((c) => c.pattern !== undefined && MIX_NAMES.includes(c.pattern));
  await t.log('mixed street', {
    seed: MIX_SEED,
    from: MIX_FROM,
    patterns: templates.map((p) => `${p.name}(${p.elements})`),
    combinations: mixes.length,
    distinct: new Set(templates.map((p) => p.name)).size,
    elementsPerPattern: +(templates.reduce((n, p) => n + p.elements, 0) / Math.max(1, templates.length)).toFixed(2),
    crashes,
    shots: [...shot],
  });
  t.check(`met at least ${MIX_SHOTS} different combinations in ${MIX_SECONDS} s`, shot.size >= MIX_SHOTS, [...shot]);
  t.check('the careful bot never crashed inside a combination', inMix.length === 0, inMix);
}

export default async function combos(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await dismissRotateHint(t);
  for (const [i, name] of COMBO_NAMES.entries()) await rideCombo(t, name, ZONES[i % ZONES.length]!);
  await rideMixes(t);
}
