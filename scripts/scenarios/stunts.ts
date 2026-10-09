/**
 * Stunt lines (ROADMAP 27, Stunt Wave A): kicker ramps, the upper level
 * (ledges) and combo lines. Kickers launch only on a jump press on the ramp
 * (ROADMAP 40), pressed here with the viewport's real input (Space on
 * desktop, a one-finger tap on touch). First a kicker ridden over without a
 * press: no launch, no crash, the skater just rolls over it. Then a kicker
 * without a ledge: the skater just lands on the street, the line ends,
 * nothing is lost; that ride also measures where he comes down to ledge
 * height. Then per zone (Bad Cannstatt, Neckar, Mitte) a kicker and a ledge
 * there are placed together as one line on an empty street: the press on the
 * kicker launches the skater (`launch`),
 * the ledge is ground (`grindStart` on the ledge), and the line reports its
 * pieces (`stuntStep`: the first piece starts the line quietly, so the ledge
 * is step 2 at x2) and its end (`stuntEnd`), never with a crash or lost
 * health. An air trick (Stunt Wave B): down pressed in the air after a
 * kicker launch sets `player.airTrick` and scores `airTrick` on the street
 * landing. On desktop a 100 s ride, with no input but the press on each
 * kicker's ramp, checks that the spawner brings stunt lines by itself (about
 * one per 30-45 s of riding) and that no stunt piece ever crashes the skater.
 *
 * Uses `window.__gameplay.place('kicker' | 'ledge', x)` (src/gameplay/debug.ts):
 * a kicker starts a line, a ledge joins it, a ledge's `y` is its grind surface.
 *   npm run playtest -- --scenario scripts/scenarios/stunts.ts --viewports desktop,phone-landscape,phone-portrait --name stunts
 */
import { GROUND_Y, PLAYER_X } from '../../src/core/config';
import { DEFAULT_LEDGE_HEIGHT } from '../../src/gameplay/stunts';
import type { Entity, EntityKind, GameEvents, GameState, StuntKind } from '../../src/types';
import { ZoneRoute } from '../../src/world/zones';
import {
  dismissRotateHint,
  Fingers,
  jumpOnRamp,
  type JumpInput,
  nextKicker,
  onRamp,
  type PlaytestContext,
  realJumpInput,
  stepWhile,
  tapJump,
} from '../playtest-lib';

/** The jump input of this viewport (Space or a touch tap) and its touch driver. */
interface Rider {
  input: JumpInput;
  fingers?: Fingers;
}

/** Pinned speed for the placed lines (a mid-run speed). */
const SPEED = 120;
/** The kicker's left edge ahead of the skater. */
const KICKER_AHEAD = 50;
/** The ledge starts this far behind the skater where he comes down to its height (he lands on the deck, not its corner). */
const LEDGE_FRONT_ROOM = 12;
/** Riding without input: long enough for two or more lines at one per 30-45 s. */
const RIDE_SECONDS = 100;
const STUNT_KINDS: readonly EntityKind[] = ['kicker', 'ledge'] satisfies StuntKind[];

/** Places a stunt piece; null if the hook could not place it. */
function placeStunt(t: PlaytestContext, kind: StuntKind, x: number): Promise<number | null> {
  return t.page.evaluate(
    ([k, px]) => {
      try {
        const id = window.__gameplay!.place(k as StuntKind, px as number);
        return window.__game!.state().entities.some((e) => e.id === id && e.kind === k) ? id : null;
      } catch {
        return null;
      }
    },
    [kind, x] as const,
  );
}

const entity = (s: GameState, id: number): Entity | undefined => s.entities.find((e) => e.id === id);

/** Payloads of event `name` since `frame`. */
async function payloads<K extends keyof GameEvents>(t: PlaytestContext, frame: number, name: K): Promise<GameEvents[K][]> {
  return (await t.game.eventsSince(frame, name)).map((e) => e.payload as GameEvents[K]);
}

/** Steps until event `name` is emitted (at most `max` ticks); its payloads since `frame`. */
async function until<K extends keyof GameEvents>(t: PlaytestContext, frame: number, name: K, max: number): Promise<GameEvents[K][]> {
  for (let i = 0; i < max; i++) {
    const seen = await payloads(t, frame, name);
    if (seen.length > 0) return seen;
    await t.game.step(1);
  }
  return payloads(t, frame, name);
}

/** A fresh frozen run in `zone` on an empty street at the pinned speed. */
async function freshRun(t: PlaytestContext, zone: number, seed = 7): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'paused') await game.resumeGame();
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(seed);
  await game.startRun();
  await game.setSpeed(SPEED);
  await game.setZone(zone);
  await game.step(20);
  await t.page.evaluate(() => window.__gameplay!.clear());
  await game.step(1);
}

/** No crash into a stunt piece and no health lost since `frame`. */
async function noStuntHarm(t: PlaytestContext, frame: number, health: number): Promise<{ ok: boolean; crashes: GameEvents['crash'][] }> {
  const crashes = await payloads(t, frame, 'crash');
  return { ok: crashes.length === 0 && (await t.game.state()).health === health, crashes };
}

/**
 * A kicker with no ledge: the skater lands back on the street, the line ends,
 * nothing is lost. Returns where a ledge must start relative to the kicker
 * so the skater comes down onto it (null if the kicker could not be placed).
 */
async function missedLedge(t: PlaytestContext, rider: Rider): Promise<number | null> {
  await freshRun(t, 2);
  const start = await t.game.state();
  const kicker = await placeStunt(t, 'kicker', PLAYER_X + KICKER_AHEAD);
  t.check('hook places a kicker', kicker !== null);
  if (kicker === null) return null;
  const pressed = await jumpOnRamp(t, kicker, rider.input, rider.fingers);
  const launches = await until(t, start.frame, 'launch', 30);
  t.check(`a ${rider.input} press on the ramp launches`, pressed !== null && launches.length === 1 && launches[0]!.entityId === kicker, { pressed, launches });
  await t.game.step(6);
  await t.canvasShot('missed ledge launched');
  const ledgeTop = GROUND_Y - DEFAULT_LEDGE_HEIGHT;
  const down = await stepWhile(t, (s) => s.player.vy <= 0 || s.player.y < ledgeTop, { max: 240 });
  t.check('the launch carries the skater above ledge height', down.player.y >= ledgeTop && !down.player.grounded, down.player);
  const ledgeOffset = PLAYER_X - LEDGE_FRONT_ROOM - entity(down, kicker)!.x;
  const landed = await stepWhile(t, (s) => !s.player.grounded, { max: 240 });
  await t.canvasShot('missed ledge landed on the street');
  const ends = await until(t, start.frame, 'stuntEnd', 600);
  t.check('missing the ledge: the skater lands on the street', landed.player.grounded && landed.player.state !== 'crash', landed.player);
  t.check('missing the ledge: the line ends incomplete', ends.length === 1 && !ends[0]!.completed, ends);
  const harm = await noStuntHarm(t, start.frame, start.health);
  t.check('missing the ledge: no crash, no health lost', harm.ok, harm.crashes);
  return ledgeOffset;
}

/** Holds duck (like ArrowDown / a swipe down) for `ticks` ticks of the frozen clock; the state after it. */
async function duckFor(t: PlaytestContext, ticks: number): Promise<GameState> {
  await t.page.evaluate(() => window.__game!.input.duck.press());
  const s = await t.game.step(ticks);
  await t.page.evaluate(() => window.__game!.input.duck.release());
  return s;
}

/** Ticks after `launch` before pressing down: the skater has left the kicker and climbs. */
const AIR_TRICK_PRESS_DELAY = 4;

/** A kicker alone, down pressed in the air: the kickflip runs (player.airTrick) and scores `airTrick` on the landing. */
async function airTrick(t: PlaytestContext, rider: Rider): Promise<void> {
  await freshRun(t, 2);
  const start = await t.game.state();
  const kicker = await placeStunt(t, 'kicker', PLAYER_X + KICKER_AHEAD);
  t.check('air trick: hook places a kicker', kicker !== null);
  if (kicker === null) return;
  await jumpOnRamp(t, kicker, rider.input, rider.fingers);
  await until(t, start.frame, 'launch', 30);
  await t.game.step(AIR_TRICK_PRESS_DELAY);
  const tricking = await duckFor(t, 2);
  t.check('air trick: down in the air starts the kickflip (player.airTrick)', tricking.player.airTrick && !tricking.player.grounded, tricking.player);
  await t.game.step(6);
  await t.canvasShot('air trick kickflip');
  const tricks = await until(t, start.frame, 'airTrick', 240);
  t.check('air trick: the landing scores one airTrick', tricks.length === 1 && tricks[0]!.ticks > 0 && tricks[0]!.points > 0, tricks);
  await t.game.step(4);
  await t.canvasShot('air trick popup');
  const harm = await noStuntHarm(t, start.frame, start.health);
  t.check('air trick: no crash, no health lost', harm.ok, harm.crashes);
}

/** A kicker and its ledge `ledgeOffset` px after it, placed as one line: launch, ledge grind, stuntStep, stuntEnd. */
async function placedLine(t: PlaytestContext, rider: Rider, zone: number, ledgeOffset: number): Promise<void> {
  const label = `zone ${zone}`;
  await freshRun(t, zone);
  const start = await t.game.state();
  const kickerX = PLAYER_X + KICKER_AHEAD;
  const kicker = await placeStunt(t, 'kicker', kickerX);
  const ledge = await placeStunt(t, 'ledge', kickerX + ledgeOffset);
  t.check(`${label}: hook places kicker and ledge`, kicker !== null && ledge !== null, { kicker, ledge });
  if (kicker === null || ledge === null) return;
  await t.game.step(10);
  await t.canvasShot(`${label} kicker ahead`);

  await jumpOnRamp(t, kicker, rider.input, rider.fingers);
  const launches = await until(t, start.frame, 'launch', 30);
  t.check(`${label}: jumping on the kicker launches`, launches.length === 1 && launches[0]!.entityId === kicker && launches[0]!.velocity > 0, launches);
  await t.game.step(6);
  await t.canvasShot(`${label} launched`);

  const grinds = await until(t, start.frame, 'grindStart', 120);
  t.check(`${label}: coming down onto the ledge grinds it`, grinds.some((g) => g.entityId === ledge), grinds);
  await t.game.step(4);
  await t.canvasShot(`${label} ledge grind`);
  await t.game.step(16);
  await t.canvasShot(`${label} combo popup`);

  const ends = await until(t, start.frame, 'stuntEnd', 600);
  const steps = await payloads(t, start.frame, 'stuntStep');
  // The first piece made starts the line quietly (no "Combo x1!"); the ledge grind is step 2 at x2.
  t.check(
    `${label}: one stuntStep for the ledge grind (step 2 of 2, x2)`,
    steps.length === 1 && steps[0]!.step === 2 && steps[0]!.steps === 2 && steps[0]!.multiplier === 2 && steps[0]!.points > 0,
    steps,
  );
  t.check(`${label}: stuntEnd reports the completed line`, ends.length === 1 && ends[0]!.made === 2 && ends[0]!.completed && ends[0]!.points > 0, ends);
  const harm = await noStuntHarm(t, start.frame, start.health);
  t.check(`${label}: no crash and no health lost on the line`, harm.ok, harm.crashes);
  await t.canvasShot(`${label} line end`);
}

/** Ticks stepped at once on the spawned ride while no kicker is near. */
const RIDE_CHUNK = 30;
/** A kicker this close ahead of the feet: step tick by tick to press on its ramp. */
const KICKER_NEAR = 120;

/**
 * Rides with the real spawner and no input but a Space press on each kicker's
 * ramp: lines come by themselves and never crash the skater.
 */
async function spawnedLines(t: PlaytestContext): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.setSpeed(null);
  await game.seed(11);
  await game.startRun();
  const start = await game.state();
  const pressed = new Set<number>();
  let shot = false;
  let s = start;
  for (let tick = 0; tick < RIDE_SECONDS * 60; ) {
    await game.setHealth(start.maxHealth);
    const kicker = nextKicker(s);
    const near = kicker !== undefined && !pressed.has(kicker.id) && kicker.x - PLAYER_X < KICKER_NEAR;
    if (near && onRamp(s, kicker)) {
      pressed.add(kicker.id);
      await tapJump(t, 'key');
    }
    const frames = near ? 1 : RIDE_CHUNK;
    s = await game.step(frames);
    tick += frames;
    if (!shot && s.entities.some((e) => STUNT_KINDS.includes(e.kind) && e.x < 300)) {
      shot = true;
      await t.canvasShot(`spawned line zone ${s.zoneIndex}`);
    }
  }
  await t.canvasShot('spawned ride end');
  const launches = await payloads(t, start.frame, 'launch');
  const ends = await payloads(t, start.frame, 'stuntEnd');
  const stuntCrashes = (await payloads(t, start.frame, 'crash')).filter((c) => STUNT_KINDS.includes(c.kind));
  await t.log('spawned lines', { presses: pressed.size, launches: launches.length, ends });
  t.check(`spawner: stunt lines come by themselves (>= 2 in ${RIDE_SECONDS} s)`, launches.length >= 2 && ends.length >= 2, {
    launches: launches.length,
    ends: ends.length,
  });
  t.check('spawner: no stunt piece ever crashes the skater', stuntCrashes.length === 0, stuntCrashes);
  await game.endRun();
}

/** The roll-over check rides on until the kicker's rear end is this far behind the feet. */
const ROLL_OVER_AFTER = 40;

/**
 * A kicker ridden over without a press (ROADMAP 40): no launch, no crash, no
 * health lost; the skater stays on the street and rides on.
 */
async function rollOver(t: PlaytestContext): Promise<void> {
  await freshRun(t, 2);
  const start = await t.game.state();
  const kicker = await placeStunt(t, 'kicker', PLAYER_X + KICKER_AHEAD);
  t.check('roll over: hook places a kicker', kicker !== null);
  if (kicker === null) return;
  let highest = start.player.y;
  /** Rides until the kicker's rear end is `behind` px behind the feet, noting the highest feet. */
  const behindBy = (behind: number) => (s: GameState) => {
    highest = Math.min(highest, s.player.y);
    const e = entity(s, kicker);
    return e !== undefined && e.x + e.w >= PLAYER_X - behind;
  };
  await stepWhile(t, behindBy(0), { max: 240 });
  await t.canvasShot('rolling over the kicker without a press');
  const passed = await stepWhile(t, behindBy(ROLL_OVER_AFTER), { max: 240 });
  const launches = await payloads(t, start.frame, 'launch');
  t.check('roll over: no press, no launch', launches.length === 0, launches);
  t.check('roll over: the skater stays near the street (no flight)', GROUND_Y - highest < DEFAULT_LEDGE_HEIGHT / 2, { highest, GROUND_Y });
  t.check('roll over: still riding', passed.mode === 'playing' && passed.player.state !== 'crash', passed.player);
  const harm = await noStuntHarm(t, start.frame, start.health);
  t.check('roll over: no crash, no health lost', harm.ok, harm.crashes);
}

export default async function stunts(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await dismissRotateHint(t);
  const input = realJumpInput(t);
  const cdp = input === 'touch' ? await t.page.context().newCDPSession(t.page) : null;
  const rider: Rider = { input, fingers: cdp ? new Fingers(t, cdp) : undefined };
  // Every zone once, in route order from the start zone.
  const route = new ZoneRoute();
  const zones = [route.zoneOf(0), route.zoneOf(1), route.zoneOf(2)];
  await rollOver(t);
  const ledgeOffset = await missedLedge(t, rider);
  await airTrick(t, rider);
  if (ledgeOffset !== null) for (const zone of zones) await placedLine(t, rider, zone, ledgeOffset);
  if (!t.viewport.touch) await spawnedLines(t);
  await t.game.setSpeed(null);
  await cdp?.detach();
}
