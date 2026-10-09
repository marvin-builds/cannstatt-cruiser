/**
 * People showcase and fairness check: human-bot run stats (computed in Node:
 * 20 seeds x 3 min, take-off +-4 ticks, three hold lengths, jittered ducking;
 * no person-related crash allowed), what people carry (VfB fan with a football,
 * Wasen visitors with a Maßkrug or a Brezel, in kid mode a Lebkuchenherz), a
 * real stomp (tumble, item mid-air with spilled foam, the catch with its
 * popup, dazed and laughing) and a 60 s human-bot ride in the browser.
 *   npm run playtest -- --scenario scripts/scenarios/people.ts --viewports desktop,phone-landscape --name people
 */
import { PLAYER_X } from '../../src/core/config';
import { Rng } from '../../src/core/rng';
import type { PlaceableKind } from '../../src/gameplay/debug';
import { type HumanRun, rideHuman } from '../../src/gameplay/human-run';
import { HumanBot, planStomp } from '../../src/gameplay/testing';
import type {} from '../../src/player/debug'; // window.__player
import { adultMode, dismissRotateHint, type PlaytestContext, stepWhile } from '../playtest-lib';

const SEEDS = 20;
const SECONDS = 180;

/** Computed once per playtest run (it does not depend on the viewport). */
let stats: HumanRun[] | null = null;

function place(t: PlaytestContext, kind: PlaceableKind, x: number, variant = 0, prop = 0): Promise<number> {
  return t.page.evaluate(
    ([k, px, v, p]) => window.__gameplay!.place(k as PlaceableKind, px as number, v as number, p as number),
    [kind, x, variant, prop] as const,
  );
}

function setKidMode(t: PlaytestContext, on: boolean): Promise<void> {
  return t.page.evaluate((v) => window.__player!.kidMode(v), on);
}

/** Fresh frozen run on an empty street in `zone` at a pinned speed. */
async function freshRun(t: PlaytestContext, zone: number, speed = 110): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(3);
  await game.startRun();
  await game.setSpeed(speed);
  await game.setZone(zone);
  await game.step(20);
  await t.page.evaluate(() => window.__gameplay!.clear());
}

async function humanStats(t: PlaytestContext): Promise<void> {
  stats ??= Array.from({ length: SEEDS }, (_, i) => rideHuman(i + 1, SECONDS));
  const crashes = stats.flatMap((r) => r.crashes);
  const personal = crashes.filter((c) => c.personRelated);
  const summary = {
    seeds: SEEDS,
    seconds: SECONDS,
    crashes: crashes.length,
    personRelated: personal.length,
    stomps: stats.reduce((n, r) => n + r.stomps, 0),
    perSeed: stats.map((r) => ({ seed: r.seed, crashes: r.crashes.length, stomps: r.stomps, score: r.score })),
  };
  await t.log('human bot stats', summary);
  t.check(`human bot: no person-related crash in ${SEEDS} seeds x ${SECONDS / 60} min`, personal.length === 0, personal);
}

async function carriedItems(t: PlaytestContext): Promise<void> {
  await freshRun(t, 1);
  await setKidMode(t, false);
  await place(t, 'vfbFan', PLAYER_X + 120);
  await place(t, 'vfbFan', PLAYER_X + 190);
  await t.game.step(8);
  await t.canvasShot('fan with football');

  await freshRun(t, 2);
  await place(t, 'wasenGuest', PLAYER_X + 110, 0, 0);
  await place(t, 'wasenGuest', PLAYER_X + 170, 1, 0);
  await place(t, 'wasenGuest', PLAYER_X + 230, 0, 1);
  await t.game.step(8);
  await t.canvasShot('visitors with masskrug and brezel');

  await setKidMode(t, true);
  await t.game.step(1);
  await t.canvasShot('kid mode visitors with lebkuchenherz and brezel');
  await setKidMode(t, false);
}

/** Lands on a person ahead with a real jump (planned by planStomp) and photographs the whole reaction. */
async function stomp(t: PlaytestContext, kind: 'vfbFan' | 'wasenGuest', zone: number, kidMode: boolean, label: string): Promise<void> {
  await freshRun(t, zone);
  await setKidMode(t, kidMode);
  await place(t, kind, PLAYER_X + 130, 1, 0);
  const since = (await t.game.state()).frame;
  const plan = planStomp(await t.game.state(), true);
  t.check(`${label}: a stomp jump exists`, plan !== null);
  if (!plan) return;
  await t.game.step(plan.tick);
  await t.game.press();
  await t.game.step(plan.hold);
  await t.game.release();
  await stepWhile(t, (x) => !x.entities.some((e) => typeof e.data?.stompedAt === 'number'), { max: 120 });
  const stompFrame = (await t.game.state()).frame - 1;
  const scored = await t.game.eventsSince(stompFrame, 'obstacleCleared');
  t.check(`${label}: the stomp scores at impact (obstacleCleared -> +points popup and clear sound)`, scored.some((e) => { const p = e.payload as { kind: string; points: number }; return p.kind === kind && p.points > 0; }), scored);
  // Slow the street so the person stays in view for the dazed and laughing shots.
  await t.game.setSpeed(20);
  await t.game.step(3);
  await t.canvasShot(`${label} stomp tumble`);
  await t.game.step(9);
  await t.canvasShot(`${label} item mid-air`);
  await stepWhile(t, (x) => x.carriedItem === null, { max: 60 });
  const s = await t.game.step(4);
  await t.canvasShot(`${label} item caught`);
  const caught = await t.game.eventsSince(since, 'itemCaught');
  t.check(`${label}: stomp, no crash, item caught and carried`, caught.length === 1 && s.carriedItem !== null && (await t.game.eventsSince(since, 'crash')).length === 0, {
    caught,
    carried: s.carriedItem,
  });
  if (kidMode) t.check(`${label}: kid mode never carries beer`, s.carriedItem !== 'beer', s.carriedItem);
  await t.game.step(20);
  await t.canvasShot(`${label} person dazed`);
  await t.game.step(70);
  await t.canvasShot(`${label} person laughing`);
  await setKidMode(t, false);
}

/** The human bot rides 60 s of seed 1 in the browser (real difficulty speed). */
async function humanRide(t: PlaytestContext): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.setSpeed(null);
  await game.seed(1);
  await game.startRun();
  const bot = new HumanBot(new Rng(1));
  let s = await game.state();
  const from = s.frame;
  let ducked = false;
  for (let i = 0; i < 60 * 60 && s.mode === 'playing'; i++) {
    const move = bot.next(s);
    if (move === 'press') await game.press();
    if (move === 'release') await game.release();
    const duck = bot.duck(s);
    if (duck !== ducked) {
      await t.page.evaluate((d) => (d ? window.__game!.input.duck.press() : window.__game!.input.duck.release()), duck);
      ducked = duck;
    }
    s = await game.step(1);
    if (i === 30 * 60) await game.setZone(1);
    if (i === 45 * 60) await game.setZone(2);
    if (i % (15 * 60) === 0 && i > 0) await t.canvasShot(`human ride ${i / 60}s`);
  }
  if (ducked) await t.page.evaluate(() => window.__game!.input.duck.release());
  const crashes = await game.eventsSince(from, 'crash');
  const people = crashes.filter((c) => ['vfbFan', 'wasenGuest'].includes((c.payload as { kind: string }).kind));
  await t.log('human ride', { crashes: crashes.length, people: people.length, stomps: (await game.eventsSince(from, 'stomp')).length });
  t.check('human ride: never crashes into a person', people.length === 0, people);
}

export default async function peopleScenario(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await dismissRotateHint(t);
  await adultMode(t); // adult content below; kid mode is the default
  await humanStats(t);
  await carriedItems(t);
  await stomp(t, 'vfbFan', 1, false, 'fan');
  await stomp(t, 'wasenGuest', 2, false, 'visitor');
  await stomp(t, 'wasenGuest', 2, true, 'kid visitor');
  await humanRide(t);
  await t.game.setSpeed(null);
}
