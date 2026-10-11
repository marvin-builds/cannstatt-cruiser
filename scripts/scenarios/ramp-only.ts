/**
 * Ledges and the park only via the ramp (ROADMAP 61) and the shorter NorDIY
 * crane (ROADMAP 62), with the viewport's real input (Space on desktop, a
 * finger on touch):
 *
 * 1. A ledge placed over the skater on an empty street: a full street jump
 *    rises past its deck and comes down in front of it (shot at the apex and
 *    on the way down): no `grindStart` on a ledge, the skater lands below
 *    the deck (the street, or a bench on it), no crash.
 * 2. A designed stunt line (`window.__gameplay.stuntLine`) with a press on
 *    each kicker's ramp: the launch gets the skater up and the ledges are
 *    ground (shots of the launch and the grind).
 * 3. A NorDIY park (`window.__gameplay.park`): a full street jump under the
 *    first container (its bank ridden over without a press) passes in front
 *    of it; the crane boom is half of the old 120 px and its ledge lies
 *    exactly on the drawn boom (the ParkPiece the world draws by), shot while
 *    the crane is on screen.
 *
 *   npm run playtest -- --scenario scripts/scenarios/ramp-only.ts --viewports desktop,phone-landscape --name ramp-only
 */
import { GROUND_Y, PLAYER_X } from '../../src/core/config';
import type {} from '../../src/gameplay/debug';
import { CRANE_LENGTH } from '../../src/gameplay/park-line';
import { DEFAULT_LEDGE_HEIGHT } from '../../src/gameplay/stunts';
import type { Entity, GameEvents, GameState } from '../../src/types';
import { START_ZONE } from '../../src/world/zones';
import { dismissRotateHint, Fingers, nextKicker, onRamp, type PlaytestContext, realJumpInput, stepWhile, tapJump, type JumpInput } from '../playtest-lib';

/** Pinned speed (mid-run). */
const SPEED = 120;
/** Ticks the full street jump holds jump (a high jump; on touch counted from the touch decision). */
const FULL_HOLD = 24;
/** The placed ledge starts this far behind the skater (it reaches over him and ahead). */
const LEDGE_BEHIND = 10;
/** Riding on after the line's first kicker until its end. */
const LINE_TICKS = 900;

interface Rider {
  input: JumpInput;
  fingers?: Fingers;
}

async function payloads<K extends keyof GameEvents>(t: PlaytestContext, frame: number, name: K): Promise<GameEvents[K][]> {
  return (await t.game.eventsSince(frame, name)).map((e) => e.payload as GameEvents[K]);
}

/** A fresh frozen run in `zone` on an empty street at the pinned speed. */
async function freshRun(t: PlaytestContext, zone: number): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'paused') await game.resumeGame();
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(3);
  await game.startRun();
  await game.setSpeed(SPEED);
  await game.setZone(zone);
  await game.step(20);
  await t.page.evaluate(() => window.__gameplay!.clear());
  await game.step(1);
}

/** Presses jump with the real input and holds it FULL_HOLD ticks. */
async function fullJump(t: PlaytestContext, rider: Rider): Promise<void> {
  if (rider.fingers) {
    const { viewWidth } = await t.game.display();
    await rider.fingers.down(9, Math.floor(viewWidth / 2), 100);
    await t.game.step(FULL_HOLD);
    await rider.fingers.up(9);
    return;
  }
  await t.page.keyboard.down('Space');
  await t.game.step(FULL_HOLD);
  await t.page.keyboard.up('Space');
}

/**
 * A full jump from the street under `deckY` (screen y of a ledge deck): the
 * skater rises past the deck, comes down in front of it and lands on the
 * street. Shots at the apex and on the way down past the deck.
 */
async function jumpInFront(t: PlaytestContext, rider: Rider, deckY: number, label: string): Promise<void> {
  const start = await t.game.state();
  await fullJump(t, rider);
  const apex = await stepWhile(t, (s) => s.player.vy < 0, { max: 60 });
  await t.canvasShot(`${label} street jump apex`);
  t.check(`${label}: the full street jump rises past the deck`, apex.player.y < deckY, { feet: apex.player.y, deckY });
  await stepWhile(t, (s) => s.player.y < deckY + 6 && !s.player.grounded && !s.player.grinding, { max: 60 });
  await t.canvasShot(`${label} passing in front of the deck`);
  // Down on the street, or on a bench there (the park puts low obstacles under its containers): never up on a ledge.
  const down = await stepWhile(t, (s) => !s.player.grounded && !s.player.grinding, { max: 120 });
  const ledges = new Set(down.entities.filter((e) => e.kind === 'ledge').map((e) => e.id));
  const onLedges = (await payloads(t, start.frame, 'grindStart')).filter((g) => ledges.has(g.entityId));
  const crashes = await payloads(t, start.frame, 'crash');
  t.check(`${label}: no landing on a ledge from the street, back down below the deck`, onLedges.length === 0 && down.player.y > deckY + 6, { onLedges, player: down.player });
  t.check(`${label}: no crash`, crashes.length === 0, crashes);
}

/** 1. A placed ledge over the skater: a street jump passes in front of it. */
async function placedLedge(t: PlaytestContext, rider: Rider): Promise<void> {
  await freshRun(t, 0);
  const id = await t.page.evaluate((x) => window.__gameplay!.place('ledge', x), PLAYER_X - LEDGE_BEHIND);
  await t.game.step(1);
  await t.canvasShot('ledge over the skater');
  await jumpInFront(t, rider, GROUND_Y - DEFAULT_LEDGE_HEIGHT, 'stunt ledge');
  t.check('the placed ledge is still there', (await t.game.state()).entities.some((e) => e.id === id));
}

/** 2. A designed line ridden with a press on every kicker: launched up, the ledges are ground. */
async function launchedLine(t: PlaytestContext, rider: Rider): Promise<void> {
  await freshRun(t, 1);
  const start = await t.game.state();
  await t.page.evaluate((x) => window.__gameplay!.stuntLine(x, 4), PLAYER_X + 60);
  const pressed = new Set<number>();
  let launchShot = false;
  let grindShot = false;
  let s = await t.game.step(1);
  for (let i = 0; i < LINE_TICKS && (await payloads(t, start.frame, 'stuntEnd')).length === 0; i++) {
    const kicker = nextKicker(s);
    if (kicker && !pressed.has(kicker.id) && onRamp(s, kicker)) {
      pressed.add(kicker.id);
      await tapJump(t, rider.input, rider.fingers);
    }
    if (!launchShot && (await payloads(t, start.frame, 'launch')).length > 0 && GROUND_Y - s.player.y > 30) {
      launchShot = true;
      await t.canvasShot('line launched off the kicker');
    }
    if (!grindShot && s.player.grinding) {
      grindShot = true;
      await t.game.step(3);
      await t.canvasShot('line grinding the ledge');
    }
    s = await t.game.step(1);
  }
  const launches = await payloads(t, start.frame, 'launch');
  const grinds = await payloads(t, start.frame, 'grindStart');
  const ledgeIds = new Set(s.entities.filter((e) => e.kind === 'ledge').map((e) => e.id));
  t.check('the launched line gets the skater onto its ledges', launches.length > 0 && grinds.length > 0, { launches, grinds, stillOnScreen: [...ledgeIds] });
  t.check('no crash on the line', (await payloads(t, start.frame, 'crash')).length === 0);
}

/** 3. The NorDIY park: a street jump in front of a container, the shorter crane drawn on its ledge. */
async function park(t: PlaytestContext, rider: Rider): Promise<void> {
  await freshRun(t, START_ZONE);
  const plan = await t.page.evaluate(() => window.__gameplay!.park(40));
  const start = await t.game.state();
  const crane = plan.pieces.find((p) => p.kind === 'crane')!;
  const length = crane.to - crane.from;
  t.check(`the crane boom is ${CRANE_LENGTH.join('-')} px (half the old 120 px)`, length >= CRANE_LENGTH[0] && length <= CRANE_LENGTH[1], { length });
  const ledgeOf = (s: GameState): Entity | undefined => s.entities.find((e) => e.kind === 'ledge' && e.data?.park === 'crane');
  const screen = (s: GameState, d: number) => PLAYER_X + d - s.distance;
  const first = plan.pieces.find((p) => p.kind === 'container')!;
  // Ride over the first bank without a press, to the middle of the first container.
  await stepWhile(t, (x) => x.distance < first.from + 10, { max: 60 * 30 });
  await jumpInFront(t, rider, GROUND_Y - first.height, 'park container');
  // The crane on screen: its ledge lies exactly on the drawn boom.
  const s = await stepWhile(t, (x) => screen(x, crane.to) > PLAYER_X + 200, { max: 60 * 30 });
  const ledge = ledgeOf(s);
  t.check(
    'the crane ledge lies on the drawn boom (same span and height)',
    ledge !== undefined && Math.abs(ledge.x - screen(s, crane.from)) <= 1 && ledge.w === length && ledge.y === GROUND_Y - crane.height,
    { ledge, from: screen(s, crane.from), length, height: crane.height },
  );
  await t.canvasShot('shorter crane in the NorDIY park');
  t.check('no launch without a bank press', (await payloads(t, start.frame, 'launch')).length === 0);
}

export default async function rampOnly(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await dismissRotateHint(t);
  const input = realJumpInput(t);
  const cdp = input === 'touch' ? await t.page.context().newCDPSession(t.page) : null;
  const rider: Rider = { input, fingers: cdp ? new Fingers(t, cdp) : undefined };
  await placedLedge(t, rider);
  await launchedLine(t, rider);
  await park(t, rider);
  await t.game.setSpeed(null);
  await cdp?.detach();
}
