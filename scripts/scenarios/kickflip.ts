/**
 * Street kickflip (ROADMAP 37) and its spam rules (ROADMAP 41): the air trick
 * (player.airTrick, scored as `airTrick` on the landing) from plain jumps, no
 * kicker, with real input:
 * - keyboard: Space held for a full jump, ArrowDown tapped for the trick;
 * - touch (touch viewports only): one finger held for a full jump, then the
 *   same finger dragged down (no second finger, no lift).
 * Per input, in one run at a pinned speed:
 * 1. a plain jump measures the ticks to the apex;
 * 2. a kickflip at the apex over a planter: the flight clears it, the flip
 *    pays its full street base (`airTrick.full`);
 * 3. three kickflips in a row into empty air: each one reduced (`full`
 *    false) and each paying less than the one before (repetition fade);
 * 4. a kickflip started LATE_AIR_LEFT ticks before the touchdown: it still
 *    turns on the touchdown (`land.flipLeft` > 0), a bail (`crash` kind
 *    'bail', one heart lost, no `airTrick`) with the "Zu spät" callout.
 * Every flight: the trick starts in the air, exactly one jump.
 * Shots: the board spin, the full popup, the reduced popup and the bail.
 *   npm run playtest -- --scenario scripts/scenarios/kickflip.ts --viewports desktop,phone-landscape,phone-portrait --name kickflip
 */
import { TICK_DT } from '../../src/core/config';
import { STREET_AIR_TRICK_POINTS } from '../../src/gameplay/air-trick';
import { airTicksLeft } from '../../src/player/air-trick';
import type { GameEvents, GameState } from '../../src/types';
import { dismissRotateHint, Fingers, type PlaytestContext, stepWhile } from '../playtest-lib';

/** Pinned speed (a mid-run speed). */
const SPEED = 120;
/** Where the jump finger lands (view px): open street, away from the HUD buttons. */
const FINGER = { x: 150, y: 120 };
/** How far (view px) the held jump finger is dragged down, in two moves. */
const DRAG = 14;
/** Ticks after the trick press to look at the board spin. */
const SPIN_SHOT_DELAY = 6;
/** Ticks after the landing for the popup / callout shots. */
const CALLOUT_SHOTS = [4, 16];
/** Ticks ridden after the run starts: the zone banner (2.4 s) is gone and cannot cover the callout. */
const BANNER_GONE_TICKS = 160;
/** Upper bound for one jump (rise and fall). */
const MAX_FLIGHT = 240;
/** The obstacle jumped in step 2: low, wide, scored like any clear. */
const OBSTACLE = { kind: 'planter', w: 18 } as const;
/** Empty-air kickflips in a row in step 3. */
const CHAIN = 3;
/** Ticks of air left when the late flip starts (still above AIR_TRICK_HEIGHT on a full jump): it needs more than this. */
const LATE_AIR_LEFT = 5;

interface TrickInput {
  label: string;
  /** Starts holding the jump. */
  jumpDown(): Promise<void>;
  /** The trick gesture; returns the state a tick later. */
  trick(): Promise<GameState>;
  jumpUp(): Promise<void>;
}

/** When the trick gesture comes: at the apex, or LATE_AIR_LEFT ticks before the touchdown. */
type TrickTime = 'apex' | 'late';

interface Flight {
  /** Frame before the jump (for eventsSince). */
  from: number;
  landed: GameState;
}

const clearStreet = (t: PlaytestContext) => t.page.evaluate(() => window.__gameplay!.clear());

async function payloads<K extends keyof GameEvents>(t: PlaytestContext, from: number, name: K): Promise<GameEvents[K][]> {
  return (await t.game.eventsSince(from, name)).map((e) => e.payload as GameEvents[K]);
}

async function freshRun(t: PlaytestContext): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'paused') await game.resumeGame();
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(4);
  await game.startRun();
  await game.setSpeed(SPEED);
  // An empty street: clear what spawns before it reaches the skater.
  for (let n = 0; n < BANNER_GONE_TICKS; n += 20) {
    await clearStreet(t);
    await game.step(20);
  }
  await clearStreet(t);
  await stepWhile(t, (s) => !s.player.grounded, { max: MAX_FLIGHT });
}

/** A plain full jump (no trick): the ticks from the press to the apex. */
async function apexTicks(t: PlaytestContext, input: TrickInput): Promise<number> {
  const start = await t.game.state();
  await input.jumpDown();
  await stepWhile(t, (s) => s.player.grounded, { max: 30 });
  const apex = await stepWhile(t, (s) => s.player.vy < 0, { max: MAX_FLIGHT });
  await stepWhile(t, (s) => !s.player.grounded, { max: MAX_FLIGHT });
  await input.jumpUp();
  await t.game.step(2);
  return apex.frame - start.frame;
}

/** A full jump with `input` and the trick at `when`, up to the landing; checks the trick started and one jump. */
async function flipFlight(t: PlaytestContext, input: TrickInput, when: TrickTime, name: string, spinShot = false): Promise<Flight> {
  const label = `${input.label} ${name}`;
  const from = (await t.game.state()).frame;
  await input.jumpDown();
  await stepWhile(t, (s) => s.player.grounded, { max: 30 });
  const apex = await stepWhile(t, (s) => s.player.vy < 0, { max: MAX_FLIGHT });
  // The press lands on the next tick, after its physics: one tick more air left now.
  if (when === 'late') await stepWhile(t, (s) => airTicksLeft(s.player.y, s.player.vy) > LATE_AIR_LEFT + 1, { max: MAX_FLIGHT });
  const pressAt = await t.game.state();
  const tricking = await input.trick();
  t.check(`${label}: the gesture starts the kickflip in the air (player.airTrick)`, tricking.player.airTrick && !tricking.player.grounded, {
    apexY: apex.player.y,
    airLeftAtPress: airTicksLeft(pressAt.player.y, pressAt.player.vy),
    player: tricking.player,
  });
  if (spinShot) {
    await t.game.step(SPIN_SHOT_DELAY);
    await t.canvasShot(`${input.label} board spin`);
  }
  const landed = await stepWhile(t, (s) => !s.player.grounded, { max: MAX_FLIGHT });
  await input.jumpUp();
  const jumps = await payloads(t, from, 'jump');
  t.check(`${label}: exactly one jump`, jumps.length === 1, jumps);
  return { from, landed };
}

async function shotsAfterLanding(t: PlaytestContext, label: string): Promise<void> {
  let shotAt = 0;
  for (const at of CALLOUT_SHOTS) {
    await t.game.step(at - shotAt);
    shotAt = at;
    await t.canvasShot(`${label} +${at}`);
  }
  if (t.viewport.touch) await t.screenshot(`${label} page`);
}

/** Step 2: a kickflip at the apex over a planter pays full. Returns its points. */
async function fullFlip(t: PlaytestContext, input: TrickInput, toApex: number): Promise<number> {
  const label = `${input.label} over obstacle`;
  await clearStreet(t);
  const s = await t.game.state();
  const body = s.player.hitbox;
  // The planter's middle under the skater's middle at the apex.
  const x = Math.round(body.x + body.w / 2 + s.speed * toApex * TICK_DT - OBSTACLE.w / 2);
  const id = await t.page.evaluate(([kind, at]) => window.__gameplay!.place(kind, at), [OBSTACLE.kind, x] as const);
  const { from, landed } = await flipFlight(t, input, 'apex', 'over obstacle', true);
  await shotsAfterLanding(t, `${input.label} full popup`);
  const cleared = await payloads(t, from, 'obstacleCleared');
  const tricks = await payloads(t, from, 'airTrick');
  const crashes = await payloads(t, from, 'crash');
  t.check(`${label}: the flight clears the planter`, cleared.some((c) => c.entityId === id), cleared);
  t.check(`${label}: no crash`, crashes.length === 0 && landed.player.state !== 'crash', crashes);
  t.check(
    `${label}: one airTrick, full, at least the street base ${STREET_AIR_TRICK_POINTS}`,
    tricks.length === 1 && tricks[0]!.full && tricks[0]!.points >= STREET_AIR_TRICK_POINTS,
    tricks,
  );
  return tricks[0]?.points ?? 0;
}

/** Step 3: kickflips into empty air right after each other are reduced and shrink. */
async function emptyChain(t: PlaytestContext, input: TrickInput, fullPoints: number): Promise<void> {
  const label = `${input.label} empty air`;
  const paid: GameEvents['airTrick'][] = [];
  for (let n = 1; n <= CHAIN; n++) {
    await clearStreet(t);
    const { from } = await flipFlight(t, input, 'apex', `empty air ${n}`);
    if (n === CHAIN) await shotsAfterLanding(t, `${input.label} reduced popup`);
    else await t.game.step(2);
    paid.push(...(await payloads(t, from, 'airTrick')));
  }
  await t.log(`${label}: paid`, paid);
  t.check(`${label}: one airTrick per flip, none full`, paid.length === CHAIN && paid.every((p) => !p.full), paid);
  t.check(
    `${label}: each pays less than the one before, the first less than the full flip (${fullPoints})`,
    paid.length === CHAIN && paid.every((p, i) => p.points < (i === 0 ? fullPoints : paid[i - 1]!.points)),
    paid,
  );
}

/** Step 4: a flip started just before the touchdown still turns on it: a bail. */
async function lateBail(t: PlaytestContext, input: TrickInput): Promise<void> {
  const label = `${input.label} late flip`;
  await clearStreet(t);
  const before = await t.game.state();
  const { from } = await flipFlight(t, input, 'late', 'late flip');
  await shotsAfterLanding(t, `${input.label} bail`);
  const lands = await payloads(t, from, 'land');
  const crashes = await payloads(t, from, 'crash');
  const tricks = await payloads(t, from, 'airTrick');
  const after = await t.game.state();
  // The crash throw lands a second time (flipLeft 0): the touchdown is the first `land`.
  t.check(`${label}: the flip still turns on the touchdown (land.flipLeft > 0)`, (lands[0]?.flipLeft ?? 0) > 0, lands);
  t.check(`${label}: a bail crash (entityId -1, kind 'bail')`, crashes.length === 1 && crashes[0]!.kind === 'bail' && crashes[0]!.entityId === -1, crashes);
  t.check(`${label}: one heart lost`, after.health === before.health - 1, { before: before.health, after: after.health });
  t.check(`${label}: the bailed trick scores nothing`, tricks.length === 0, tricks);
}

async function kickflipRules(t: PlaytestContext, input: TrickInput): Promise<void> {
  await freshRun(t);
  const toApex = await apexTicks(t, input);
  await t.log(`${input.label}: ticks to the apex`, { toApex });
  const fullPoints = await fullFlip(t, input, toApex);
  await emptyChain(t, input, fullPoints);
  await lateBail(t, input);
}

function keyboardInput(t: PlaytestContext): TrickInput {
  const kb = t.page.keyboard;
  return {
    label: 'keyboard',
    jumpDown: () => kb.down('Space'),
    trick: async () => {
      await kb.down('ArrowDown');
      await t.game.step(1);
      await kb.up('ArrowDown');
      return t.game.step(1);
    },
    jumpUp: () => kb.up('Space'),
  };
}

function touchInput(t: PlaytestContext, f: Fingers): TrickInput {
  return {
    label: 'touch',
    jumpDown: () => f.down(1, FINGER.x, FINGER.y),
    trick: async () => {
      await f.move(1, FINGER.x + 1, FINGER.y + DRAG / 2);
      await f.move(1, FINGER.x + 2, FINGER.y + DRAG);
      await t.game.step(1);
      return t.game.step(1);
    },
    jumpUp: () => f.up(1),
  };
}

export default async function kickflip(t: PlaytestContext): Promise<void> {
  const { game, page } = t;
  await game.pause();
  await dismissRotateHint(t);
  await kickflipRules(t, keyboardInput(t));
  if (t.viewport.touch) {
    const cdp = await page.context().newCDPSession(page);
    await kickflipRules(t, touchInput(t, new Fingers(t, cdp)));
    await cdp.detach();
  }
  await game.setSpeed(null);
}
