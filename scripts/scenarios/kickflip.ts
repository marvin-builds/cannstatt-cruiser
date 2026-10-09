/**
 * Street kickflip (ROADMAP 37): the air trick (player.airTrick, scored as
 * `airTrick` on the landing) from a plain jump on an empty street, no kicker,
 * with real input:
 * - keyboard: Space held for a full jump, ArrowDown tapped at the apex;
 * - touch (touch viewports only): one finger held for a full jump, then the
 *   same finger dragged down at the apex (no second finger, no lift).
 * Checks per input: the kickflip starts in the air, exactly one jump, the
 * landing scores one `airTrick` with points, no crash. Shots: the board spin
 * mid-trick and the "Kickflip!" callout after the landing.
 *   npm run playtest -- --scenario scripts/scenarios/kickflip.ts --viewports desktop,phone-landscape,phone-portrait --name kickflip
 */
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
/** Ticks after the landing for the callout shots. */
const CALLOUT_SHOTS = [4, 16];
/** Ticks ridden after the run starts: the zone banner (2.4 s) is gone and cannot cover the callout. */
const BANNER_GONE_TICKS = 160;
/** Upper bound for one jump (rise and fall). */
const MAX_FLIGHT = 240;

interface TrickInput {
  label: string;
  /** Starts holding the jump. */
  jumpDown(): Promise<void>;
  /** The trick gesture at the apex; returns the state a tick later. */
  trick(): Promise<GameState>;
  jumpUp(): Promise<void>;
}

async function freshRun(t: PlaytestContext): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'paused') await game.resumeGame();
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(4);
  await game.startRun();
  await game.setSpeed(SPEED);
  // An empty street throughout: clear what spawns before it reaches the skater.
  for (let n = 0; n < BANNER_GONE_TICKS; n += 20) {
    await t.page.evaluate(() => window.__gameplay!.clear());
    await game.step(20);
  }
  await t.page.evaluate(() => window.__gameplay!.clear());
  await stepWhile(t, (s) => !s.player.grounded, { max: MAX_FLIGHT });
}

/** A full jump with `input`, the trick at the apex, then the landing and its callout. */
async function streetKickflip(t: PlaytestContext, input: TrickInput): Promise<void> {
  const { game } = t;
  const label = input.label;
  await freshRun(t);
  const start = await game.state();
  await input.jumpDown();
  await stepWhile(t, (s) => s.player.grounded, { max: 30 });
  const apex = await stepWhile(t, (s) => s.player.vy < 0, { max: MAX_FLIGHT });
  await t.log(`${label}: apex`, { height: start.player.y - apex.player.y });
  const tricking = await input.trick();
  t.check(`${label}: the gesture at the apex starts the kickflip (player.airTrick)`, tricking.player.airTrick && !tricking.player.grounded, tricking.player);
  await game.step(SPIN_SHOT_DELAY);
  await t.canvasShot(`${label} board spin`);
  const landed = await stepWhile(t, (s) => !s.player.grounded, { max: MAX_FLIGHT });
  await input.jumpUp();
  let shotAt = 0;
  for (const at of CALLOUT_SHOTS) {
    await game.step(at - shotAt);
    shotAt = at;
    await t.canvasShot(`${label} kickflip callout +${at}`);
  }
  if (t.viewport.touch) await t.screenshot(`${label} kickflip callout page`);
  const events = async <K extends keyof GameEvents>(k: K) => (await game.eventsSince(start.frame, k)).map((e) => e.payload as GameEvents[K]);
  const tricks = await events('airTrick');
  const jumps = await events('jump');
  const crashes = await events('crash');
  t.check(`${label}: the landing scores one airTrick`, tricks.length === 1 && tricks[0]!.points > 0, tricks);
  t.check(`${label}: exactly one jump`, jumps.length === 1, jumps);
  t.check(`${label}: lands without a crash`, crashes.length === 0 && landed.player.state !== 'crash', { crashes, player: landed.player });
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
  await streetKickflip(t, keyboardInput(t));
  if (t.viewport.touch) {
    const cdp = await page.context().newCDPSession(page);
    await streetKickflip(t, touchInput(t, new Fingers(t, cdp)));
    await cdp.detach();
  }
  await game.setSpeed(null);
}
