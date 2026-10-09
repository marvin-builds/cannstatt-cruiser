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
 *    'bail', one heart lost, no `airTrick`) with the "Zu spät" callout;
 * 5./6. drunk (adult mode, Maßkrug timer) and chilled (joint timer), ROADMAP
 *    42: a kickflip started just too late for its longer turn (tipsyAirLeft),
 *    early enough that a sober flip would land, bails with the
 *    "Zu wacklig!" / "Zu entspannt!" callout and one heart lost. While drunk
 *    every input edge is made with the drunk timer at 0 for that instant, so
 *    core's random input delay cannot move the flip; the flip itself starts
 *    drunk, and down is held through the touchdown (ArrowDown kept down, on
 *    touch a second finger's swipe down), as core's delayed release nearly
 *    always does: no duck landing while drunk, it still bails.
 * Every flight: the trick starts in the air, exactly one jump.
 * Shots: the board spin (sober and the wobbling drunk one), the full popup,
 * the reduced popup and the three bail callouts.
 *   npm run playtest -- --scenario scripts/scenarios/kickflip.ts --viewports desktop,phone-landscape,phone-portrait --name kickflip
 */
import { MAX_HEALTH, TICK_DT } from '../../src/core/config';
import { SWIPE_DUCK_TICKS } from '../../src/core/input';
import { STREET_AIR_TRICK_POINTS } from '../../src/gameplay/air-trick';
import { KICKFLIP_BAIL_GRACE_TICKS } from '../../src/gameplay/bail';
import { airTicksLeft, airTrickTicks, type FlipMood } from '../../src/player/air-trick';
import { STREET_AIR_TRICK_TICKS } from '../../src/player/tuning';
import type { GameEvents, GameState } from '../../src/types';
import { type BailCause, bailCause } from '../../src/ui/popup-feed';
import { dismissRotateHint, Fingers, type PlaytestContext, stepWhile } from '../playtest-lib';

/** Pinned speed (a mid-run speed). */
const SPEED = 120;
/** Where the jump finger lands (view px): open street, away from the HUD buttons. */
const FINGER = { x: 150, y: 120 };
/** Where the second finger swipes down to hold duck (drunk step, touch): open street, right of the first. */
const SWIPE_FINGER = { x: 210, y: 110 };
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
/** Seconds on the drunk / chill timer during a tipsy flight: still running on the touchdown. */
const TIPSY_SECONDS = 6;
/** Upper bound for riding out a crash and its invulnerability. */
const MAX_RECOVER = 600;

/** A state that makes the street kickflip turn longer (ROADMAP 42) and the callout its bail shows. */
interface Tipsy {
  name: Exclude<FlipMood, 'sober'>;
  /** The ui's bail cause while it runs, and the callout that shows. */
  cause: BailCause;
  callout: string;
  /** Sets the effect's timer (0 ends it) through the player's debug hook. */
  set(t: PlaytestContext, seconds: number): Promise<void>;
  /** Core delays input edges while it runs (drunk only). */
  delaysInput: boolean;
}

const DRUNK: Tipsy = {
  name: 'drunk',
  cause: 'wobbly',
  callout: 'Zu wacklig!',
  set: (t, s) => t.page.evaluate((v) => window.__player!.drunk(v), s),
  delaysInput: true,
};
const CHILL: Tipsy = {
  name: 'chill',
  cause: 'relaxed',
  callout: 'Zu entspannt!',
  set: (t, s) => t.page.evaluate((v) => window.__player!.chill(v), s),
  delaysInput: false,
};

interface TrickInput {
  label: string;
  /** Starts holding the jump. */
  jumpDown(): Promise<void>;
  /** The trick gesture; returns the state the tick it starts the kickflip. */
  trick(): Promise<GameState>;
  jumpUp(): Promise<void>;
}

/** The raw edges of one input device's trick gesture. */
interface TrickGesture {
  /** Presses duck (no tick). */
  down(): Promise<void>;
  /** Ends the gesture after its first tick (no tick). */
  up(): Promise<void>;
}

/** Down held from right after the trick until after the touchdown (the drunk step). */
interface DownHold {
  /** Presses and holds duck (no tick). */
  press(): Promise<void>;
  /** Lets go again (no tick). */
  release(): Promise<void>;
  /** Ticks the hold lasts by itself at most (the touch swipe ends on its own). */
  maxTicks: number;
}

/** A device's input plus its raw trick gesture and down hold (for the drunk wrapper). */
type DeviceInput = TrickInput & { gesture: TrickGesture; hold: DownHold };

/** When the trick gesture comes: at the apex, or with this many ticks of air left before the touchdown. */
type TrickTime = 'apex' | number;

interface Flight {
  /** Frame before the jump (for eventsSince). */
  from: number;
  landed: GameState;
  /** Ticks from the trick start to the touchdown. */
  airTicks: number;
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
async function flipFlight(t: PlaytestContext, input: TrickInput, when: TrickTime, name: string, spinShot?: string): Promise<Flight> {
  const label = `${input.label} ${name}`;
  const from = (await t.game.state()).frame;
  await input.jumpDown();
  await stepWhile(t, (s) => s.player.grounded, { max: 30 });
  const apex = await stepWhile(t, (s) => s.player.vy < 0, { max: MAX_FLIGHT });
  // The press lands on the next tick, after its physics: one tick more air left now.
  if (when !== 'apex') await stepWhile(t, (s) => airTicksLeft(s.player.y, s.player.vy) > when + 1, { max: MAX_FLIGHT });
  const pressAt = await t.game.state();
  const tricking = await input.trick();
  t.check(`${label}: the gesture starts the kickflip in the air (player.airTrick)`, tricking.player.airTrick && !tricking.player.grounded, {
    apexY: apex.player.y,
    airLeftAtPress: airTicksLeft(pressAt.player.y, pressAt.player.vy),
    player: tricking.player,
  });
  if (spinShot) {
    await t.game.step(SPIN_SHOT_DELAY);
    await t.canvasShot(`${input.label} ${spinShot}`);
  }
  const landed = await stepWhile(t, (s) => !s.player.grounded, { max: MAX_FLIGHT });
  await input.jumpUp();
  const jumps = await payloads(t, from, 'jump');
  t.check(`${label}: exactly one jump`, jumps.length === 1, jumps);
  return { from, landed, airTicks: landed.frame - tricking.frame };
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
  const { from, landed } = await flipFlight(t, input, 'apex', 'over obstacle', 'board spin');
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
  const { from } = await flipFlight(t, input, LATE_AIR_LEFT, 'late flip');
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

/** Rides out the last crash and its invulnerability on an empty street, then refills the hearts. */
async function recover(t: PlaytestContext): Promise<void> {
  for (let n = 0; n < MAX_RECOVER; n += 20) {
    const s = await t.game.state();
    if (s.player.grounded && s.player.state !== 'crash' && s.player.invulnerableTimer <= 0) break;
    await clearStreet(t);
    await t.game.step(20);
  }
  await t.game.setHealth(MAX_HEALTH);
}

/**
 * Ticks of air left when the drunk / chilled flip starts: one tick too few for
 * its shortest length (drunk without jitter) to land within the grace.
 */
function tipsyAirLeft(tipsy: Tipsy): number {
  return airTrickTicks(false, tipsy.name) - KICKFLIP_BAIL_GRACE_TICKS - 1;
}

/**
 * Steps 5 / 6: drunk or chilled, a flip started tipsyAirLeft ticks before
 * the touchdown, where a sober one would land, bails with the effect's callout.
 */
async function tipsyBail(t: PlaytestContext, input: DeviceInput, tipsy: Tipsy): Promise<void> {
  const label = `${input.label} ${tipsy.name} flip`;
  await recover(t);
  await t.page.evaluate(() => window.__player!.kidMode(false));
  await clearStreet(t);
  await tipsy.set(t, TIPSY_SECONDS);
  const before = await t.game.state();
  const ride = tipsy.delaysInput ? drunkDownHeld(t, input) : input;
  const spin = tipsy.name === 'drunk' ? 'drunk board spin' : undefined;
  const airLeft = tipsyAirLeft(tipsy);
  t.check(
    `${label}: a sober flip started with ${airLeft} ticks of air would land (${STREET_AIR_TRICK_TICKS} ticks, grace ${KICKFLIP_BAIL_GRACE_TICKS})`,
    STREET_AIR_TRICK_TICKS - airLeft <= KICKFLIP_BAIL_GRACE_TICKS,
    { airLeft, sober: STREET_AIR_TRICK_TICKS, tipsy: airTrickTicks(false, tipsy.name) },
  );
  const { from, landed, airTicks } = await flipFlight(t, ride, airLeft, `${tipsy.name} flip`, spin);
  if (tipsy.delaysInput) {
    t.check(`${label}: down is still held on the touchdown (${airTicks} ticks after the trick, hold lasts ${input.hold.maxTicks})`, airTicks < input.hold.maxTicks, {
      airTicks,
    });
  }
  await shotsAfterLanding(t, `${input.label} ${tipsy.name} bail`);
  const lands = await payloads(t, from, 'land');
  const crashes = await payloads(t, from, 'crash');
  const tricks = await payloads(t, from, 'airTrick');
  const after = await t.game.state();
  t.check(
    `${label}: the effect still runs on the touchdown`,
    (tipsy.name === 'drunk' ? landed.drunkTimer : landed.chillTimer) > 0,
    { drunkTimer: landed.drunkTimer, chillTimer: landed.chillTimer },
  );
  t.check(
    `${label}: it still turns more than ${KICKFLIP_BAIL_GRACE_TICKS} ticks on the touchdown`,
    (lands[0]?.flipLeft ?? 0) > KICKFLIP_BAIL_GRACE_TICKS,
    lands,
  );
  t.check(`${label}: a bail crash (entityId -1, kind 'bail')`, crashes.length === 1 && crashes[0]!.kind === 'bail' && crashes[0]!.entityId === -1, crashes);
  t.check(`${label}: one heart lost`, after.health === before.health - 1, { before: before.health, after: after.health });
  t.check(`${label}: the bailed trick scores nothing`, tricks.length === 0, tricks);
  // The ui picks the callout from the state on the bail (the shots show the text).
  t.check(`${label}: the ui blames the ${tipsy.name} ("${tipsy.callout}")`, bailCause(landed) === tipsy.cause, bailCause(landed));
  await tipsy.set(t, 0);
}

async function kickflipRules(t: PlaytestContext, input: DeviceInput): Promise<void> {
  await freshRun(t);
  const toApex = await apexTicks(t, input);
  await t.log(`${input.label}: ticks to the apex`, { toApex });
  const fullPoints = await fullFlip(t, input, toApex);
  await emptyChain(t, input, fullPoints);
  await lateBail(t, input);
  await tipsyBail(t, input, DRUNK);
  await tipsyBail(t, input, CHILL);
}

/** Sober: the gesture, its start tick and the tick after it. */
function plainTrick(t: PlaytestContext, g: TrickGesture): () => Promise<GameState> {
  return async () => {
    await g.down();
    const started = await t.game.step(1);
    await g.up();
    await t.game.step(1);
    return started;
  };
}

function keyboardInput(t: PlaytestContext): DeviceInput {
  const kb = t.page.keyboard;
  const gesture: TrickGesture = { down: () => kb.down('ArrowDown'), up: () => kb.up('ArrowDown') };
  // ArrowDown stays down from the trick press on (the gesture's up is left out).
  const hold: DownHold = { press: async () => {}, release: gesture.up, maxTicks: Infinity };
  return { label: 'keyboard', jumpDown: () => kb.down('Space'), trick: plainTrick(t, gesture), jumpUp: () => kb.up('Space'), gesture, hold };
}

function touchInput(t: PlaytestContext, f: Fingers): DeviceInput {
  const gesture: TrickGesture = {
    down: async () => {
      await f.move(1, FINGER.x + 1, FINGER.y + DRAG / 2);
      await f.move(1, FINGER.x + 2, FINGER.y + DRAG);
    },
    up: async () => {},
  };
  // The drag only taps down: a second finger's swipe down holds it (SWIPE_DUCK_TICKS, or until the next jump).
  const hold: DownHold = {
    press: async () => {
      await f.down(2, SWIPE_FINGER.x, SWIPE_FINGER.y);
      await f.move(2, SWIPE_FINGER.x, SWIPE_FINGER.y + DRAG);
      await f.up(2);
    },
    release: async () => {},
    maxTicks: SWIPE_DUCK_TICKS,
  };
  return { label: 'touch', jumpDown: () => f.down(1, FINGER.x, FINGER.y), trick: plainTrick(t, gesture), jumpUp: () => f.up(1), gesture, hold };
}

/**
 * The same input with every edge made sober (the drunk timer at 0 for that
 * instant, so core delivers it at once) while the ticks run drunk: the flip
 * starts drunk, and down is held from the trick until after the touchdown.
 */
function drunkDownHeld(t: PlaytestContext, input: DeviceInput): TrickInput {
  const sober = async (edge: () => Promise<void>) => {
    await DRUNK.set(t, 0);
    await edge();
    await DRUNK.set(t, TIPSY_SECONDS);
  };
  const g = input.gesture;
  return {
    label: input.label,
    jumpDown: () => sober(input.jumpDown),
    jumpUp: () =>
      sober(async () => {
        await input.jumpUp();
        await input.hold.release();
      }),
    trick: async () => {
      await sober(g.down);
      const started = await t.game.step(1);
      await sober(input.hold.press);
      return started;
    },
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
