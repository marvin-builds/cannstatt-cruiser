/**
 * NorDIY skatepark (ROADMAP 36): a run in Bad Cannstatt with a park planned
 * right ahead (`window.__gameplay.park()`), shot at the approach, the wooden
 * "NorDIY" sign on a container, the line over the banks, container roofs
 * and crane boom (gap jumps at the middle of their take-off window), the
 * crowd by the crane (adult mode, switched off explicitly since kid mode is
 * the default) and also in kid mode (lemonade, no beer), a high five (the use
 * press: real key E on desktop, `input.use()` on touch) and the "Session!"
 * callout at the end. The banks are kickers: they launch only on a jump
 * press on their ramp (ROADMAP 40), pressed with the viewport's real input
 * (Space on desktop, a one-finger tap on touch). Checks: a park is planned with its pieces, the high
 * fiver takes the use press (`highFive`, no item used), the tricks raise the
 * cheering (`sessionCheer`), the park ends with one `sessionEnd`, and the
 * park never crashes the skater or costs health.
 *
 * Without the park hook (gameplay not in yet) it logs that and rides Bad
 * Cannstatt until the spawner plans a park by itself, failing one clear check
 * if none comes.
 *
 * A run distance d (ParkPlan / ParkPiece) is at screen x
 * `PLAYER_X + d - state.distance`: it reaches the skater when
 * `state.distance` gets to d.
 *   npm run playtest -- --scenario scripts/scenarios/nordiy.ts --viewports desktop,phone-landscape,phone-portrait --name nordiy
 */
import { PLAYER_X } from '../../src/core/config';
import type {} from '../../src/gameplay/debug';
import type {} from '../../src/player/debug';
import type {} from '../../src/world/debug';
import { gapHolds } from '../../src/gameplay/stunt-line';
import { jumpWindow, stepOf, windowMiddle } from '../../src/gameplay/stunt-sim';
import type { Entity, GameEvents, GameState, ParkPiece, ParkPlan } from '../../src/types';
import { START_ZONE, ZONE_LENGTH } from '../../src/world/zones';
import {
  adultMode,
  dismissRotateHint,
  Fingers,
  type JumpInput,
  nextKicker,
  onRamp,
  type PlaytestContext,
  realJumpInput,
  stepWhile,
  tapJump,
} from '../playtest-lib';

/** Pinned speed (mid-run), so the park line is ridden as planned. */
const SPEED = 120;
/** The approach shot: the park's start this far inside the right view edge. */
const APPROACH_INSET = 40;
/** Ticks after the first bank launch before pressing down for an air trick (the skater climbs). */
const AIR_TRICK_PRESS_DELAY = 4;
/** The use press for the high five: when the high fiver's centre is this close ahead of the skater. */
const HIGH_FIVE_AHEAD = 4;
/** Ticks into a grind for its shot. */
const GRIND_SHOT_DELAY = 3;
/** Ticks to wait for `highFive` after the press. */
const HIGH_FIVE_WAIT = 6;
/** Ticks after `sessionEnd` for the callout shot. */
const SESSION_SHOT_DELAY = 10;
/** Riding on after the park's end until `sessionEnd` must have come. */
const END_MARGIN = 200;

/** The park hook gameplay adds in this wave; optional here so the scenario type-checks and runs before it lands. */
interface ParkHook {
  park?(): unknown;
}

/** Screen x of run distance `d` in state `s`. */
const screenX = (s: GameState, d: number) => PLAYER_X + d - s.distance;

const centre = (e: Entity) => e.x + e.w / 2;

async function payloads<K extends keyof GameEvents>(t: PlaytestContext, frame: number, name: K): Promise<GameEvents[K][]> {
  return (await t.game.eventsSince(frame, name)).map((e) => e.payload as GameEvents[K]);
}

/** A fresh frozen run in Bad Cannstatt at the pinned speed, the street cleared. */
async function freshRun(t: PlaytestContext): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'paused') await game.resumeGame();
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(5);
  await game.startRun();
  await game.setSpeed(SPEED);
  await game.setZone(START_ZONE);
  await game.step(20);
  await t.page.evaluate(() => window.__gameplay!.clear());
  await game.step(1);
}

/** Plans the park with the hook, else rides until the spawner plans one (null if none comes). */
async function planPark(t: PlaytestContext): Promise<ParkPlan | null> {
  const hooked = await t.page.evaluate(() => {
    const hook = window.__gameplay as ParkHook | undefined;
    if (typeof hook?.park !== 'function') return false;
    hook.park();
    return true;
  });
  if (!hooked) await t.log('window.__gameplay.park() is missing (gameplay slice not in yet): riding Bad Cannstatt until a park is planned');
  const { maxHealth } = await t.game.state();
  const maxTicks = hooked ? 60 : Math.ceil((ZONE_LENGTH / SPEED) * 60);
  for (let tick = 0; tick < maxTicks; tick += 30) {
    const s = await t.game.step(hooked ? 1 : 30);
    if (s.park) return s.park;
    await t.game.setHealth(maxHealth);
  }
  return null;
}

/** Holds duck for `ticks` ticks of the frozen clock (the air trick in the air). */
async function duckFor(t: PlaytestContext, ticks: number): Promise<void> {
  await t.page.evaluate(() => window.__game!.input.duck.press());
  await t.game.step(ticks);
  await t.page.evaluate(() => window.__game!.input.duck.release());
}

/** The use press for one tick: real key E on desktop, the hook's use (like the item button) on touch. */
async function pressUse(t: PlaytestContext): Promise<void> {
  if (t.viewport.touch) {
    await t.page.evaluate(() => window.__game!.input.use());
    await t.game.step(1);
    return;
  }
  await t.page.keyboard.down('KeyE');
  await t.game.step(1);
  await t.page.keyboard.up('KeyE');
}

/** The park ledge the skater grinds in `s`, and the line's next piece if that is a ledge too (a gap jump onto it). */
function ledgeUnder(s: GameState): { ledge: Entity; next: Entity | undefined } | null {
  const step = (e: Entity) => Number(e.data?.step ?? 0);
  const ledge = s.entities.find((e) => e.kind === 'ledge' && e.data?.park !== undefined && e.y === s.player.y && e.x - 12 <= PLAYER_X && PLAYER_X <= e.x + e.w);
  if (!ledge) return null;
  const next = s.entities.find((e) => e.kind === 'ledge' && e.data?.line === ledge.data?.line && step(e) === step(ledge) + 1);
  return { ledge, next };
}

/**
 * Just landed on a park ledge in `s`: the grind shot `shot` a few ticks in,
 * and, when the line's next piece is a ledge across a gap (container to
 * container or crane), the gap jump at the middle of its take-off window
 * (like gameplay's StuntBot). Without one the skater rolls off (a drop onto
 * the next bank).
 */
async function grindAndJump(t: PlaytestContext, s: GameState, shot: string): Promise<void> {
  const on = ledgeUnder(s);
  const window = on?.next ? jumpWindow(on.ledge, PLAYER_X, stepOf(s.speed), on.next, gapHolds(on.ledge)) : null;
  const wait = window ? windowMiddle(window) : GRIND_SHOT_DELAY;
  const shotAt = Math.min(GRIND_SHOT_DELAY, wait);
  await t.game.step(shotAt);
  await t.canvasShot(shot);
  if (!window) return;
  await t.game.step(wait - shotAt);
  await t.game.press();
  await t.game.step(window.hold);
  await t.game.release();
}

/** The kid-mode look of the crowd by the crane (lemonade instead of beer), then back. */
async function kidModeShot(t: PlaytestContext): Promise<void> {
  await t.page.evaluate(() => window.__player!.kidMode(true));
  await t.game.step(1);
  await t.canvasShot('crowd kid mode');
  await t.page.evaluate(() => window.__player!.kidMode(false));
}

/** What happened while riding the park. */
interface Ride {
  /** Frame and health when the skater reached the park's start (null if he never did). */
  entered: { frame: number; health: number } | null;
  highFiver: number | null;
  pressedAt: number | null;
  highFives: GameEvents['highFive'][];
  /** Most vehicles at once over the park's screen span (vehicles leaving the screen elsewhere don't count). */
  vehiclesInPark: number;
  /** Banks (kickers) the skater pressed jump on. */
  bankPresses: number;
}

/**
 * Rides through the park, one tick at a time: shots of the sign, each
 * container / crane grind and the high five; a jump press on every bank's
 * ramp; an air trick after the first bank launch; the use press at the high
 * fiver.
 */
async function ridePark(t: PlaytestContext, park: ParkPlan, viewWidth: number, input: JumpInput, fingers?: Fingers): Promise<Ride> {
  const start = await t.game.state();
  const ride: Ride = { entered: null, highFiver: null, pressedAt: null, highFives: [], vehiclesInPark: 0, bankPresses: 0 };
  const pressedBanks = new Set<number>();
  const sign = park.pieces.find((p) => p.kind === 'container');
  const shotPieces = new Set<ParkPiece>();
  let signShot = false;
  let airTricked = false;
  let s = start;
  while (s.distance < park.end + END_MARGIN && (await payloads(t, start.frame, 'sessionEnd')).length === 0) {
    if (s.mode !== 'playing') throw new Error(`run stopped (mode ${s.mode}) at frame ${s.frame}`);
    if (!signShot && sign && screenX(s, (sign.from + sign.to) / 2) <= viewWidth / 2) {
      signShot = true;
      await t.canvasShot('sign on the container');
    }
    const bank = nextKicker(s);
    if (bank && !pressedBanks.has(bank.id) && onRamp(s, bank)) {
      pressedBanks.add(bank.id);
      await tapJump(t, input, fingers);
    }
    if (!airTricked && (await payloads(t, start.frame, 'launch')).length > 0) {
      airTricked = true;
      await t.game.step(AIR_TRICK_PRESS_DELAY);
      await duckFor(t, 2);
      await t.canvasShot('bank launch air trick');
    }
    const piece = park.pieces.find((p) => p.kind !== 'bank' && s.distance >= p.from && s.distance < p.to);
    if (piece && s.player.grinding && !shotPieces.has(piece)) {
      shotPieces.add(piece);
      await grindAndJump(t, s, `grind on the ${piece.kind} ${park.pieces.indexOf(piece) + 1}`);
      if (piece.kind === 'crane') await kidModeShot(t);
    }
    const fiver = s.entities.find((e) => e.kind === 'highFiver');
    if (fiver && ride.pressedAt === null && centre(fiver) <= PLAYER_X + HIGH_FIVE_AHEAD) {
      ride.highFiver = fiver.id;
      ride.pressedAt = (await t.game.state()).frame;
      await pressUse(t);
      await t.game.step(HIGH_FIVE_WAIT);
      ride.highFives = await payloads(t, ride.pressedAt, 'highFive');
      await t.canvasShot('high five');
    }
    if (s.distance >= park.start && s.distance < park.end) {
      ride.entered ??= { frame: s.frame, health: s.health };
      const span = { from: screenX(s, park.start), to: screenX(s, park.end) };
      const vehicles = await t.page.evaluate(() => window.__world?.traffic().vehicles ?? []);
      ride.vehiclesInPark = Math.max(ride.vehiclesInPark, vehicles.filter((v) => v.x < span.to && v.x + v.w > span.from).length);
    }
    s = await t.game.step(1);
  }
  ride.bankPresses = pressedBanks.size;
  t.check('the sign container came on screen', signShot, { sign });
  const ledges = park.pieces.filter((p) => p.kind !== 'bank');
  t.check('the line grinds every container and the crane', ledges.every((p) => shotPieces.has(p)), { grinded: [...shotPieces], ledges });
  return ride;
}

export default async function nordiy(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await dismissRotateHint(t);
  await freshRun(t);
  await adultMode(t);
  const input = realJumpInput(t);
  const cdp = input === 'touch' ? await t.page.context().newCDPSession(t.page) : null;
  const { viewWidth } = await t.game.display();
  const park = await planPark(t);
  t.check('a NorDIY park is planned (state.park)', park !== null, 'needs gameplay: window.__gameplay.park() or a park in Bad Cannstatt');
  if (!park) return;
  await t.log('park plan', park);
  t.check('the park has banks, containers and the crane', ['bank', 'container', 'crane'].every((k) => park.pieces.some((p) => p.kind === k)), park.pieces);

  const before = await t.game.state();
  await stepWhile(t, (s) => screenX(s, park.start) > viewWidth - APPROACH_INSET, { max: 60 * 60 });
  await t.canvasShot('approach');

  const ride = await ridePark(t, park, viewWidth, input, cdp ? new Fingers(t, cdp) : undefined);
  const banks = park.pieces.filter((p) => p.kind === 'bank').length;
  const launches = await payloads(t, before.frame, 'launch');
  t.check(`a ${input} press on every bank launches`, ride.bankPresses === banks && launches.length === banks, { banks, presses: ride.bankPresses, launches });
  const ends = await payloads(t, before.frame, 'sessionEnd');
  if (ends.length > 0) {
    await t.game.step(SESSION_SHOT_DELAY);
    await t.canvasShot('session end callout');
  }

  const cheers = await payloads(t, before.frame, 'sessionCheer');
  const crashes = ride.entered ? await payloads(t, ride.entered.frame, 'crash') : [];
  const after = await t.game.state();
  await t.log('park ride', { ride, cheers, ends, audio: await t.page.evaluate(() => [...new Set((window.__audio?.log ?? []).map((l) => l.sound))]) });
  t.check('a high fiver stands at the park', ride.highFiver !== null);
  t.check(
    'the use press at the high fiver gives a high five',
    ride.highFives.length === 1 && ride.highFives[0]!.entityId === ride.highFiver && ride.highFives[0]!.points > 0,
    ride.highFives,
  );
  t.check('the high five uses no item', (await payloads(t, before.frame, 'itemUsed')).length === 0);
  t.check('tricks in the park raise the cheering', cheers.length > 0 && cheers.every((c) => c.level >= 0 && c.level <= 1), cheers);
  t.check('the park ends with one sessionEnd and points', ends.length === 1 && ends[0]!.points > 0, ends);
  t.check('the skater rode into the park', ride.entered !== null);
  t.check('the park never crashes the skater or costs health', crashes.length === 0 && after.health === ride.entered?.health, crashes);
  t.check('no vehicle over the park while riding it', ride.vehiclesInPark === 0, ride.vehiclesInPark);
  await t.game.setSpeed(null);
  await cdp?.detach();
}
