/**
 * Wave showcase: grinding a bench, walking VfB fans at the Neckar (zone 1),
 * swaying Wasen visitors in Bad Cannstatt (zone 2) and their friendly crash
 * reactions, the joint pickup with the chill effect (slower street, lower
 * jump, warm tint, HUD timer) and the game over with German number format.
 * Runs on every viewport (the rotate hint is tapped away on phone-portrait).
 *   npm run playtest -- --scenario scripts/scenarios/chill.ts --viewports desktop,phone-landscape --name chill
 */
import { PLAYER_X } from '../../src/core/config';
import type { PlaceableKind } from '../../src/gameplay/debug';
import { SolverBot } from '../../src/gameplay/testing';
import type { GameState } from '../../src/types';
import { dismissRotateHint, type PlaytestContext, stepWhile } from '../playtest-lib';

function place(t: PlaytestContext, kind: PlaceableKind, x: number, variant = 0): Promise<number> {
  return t.page.evaluate(([k, px, v]) => window.__gameplay!.place(k as PlaceableKind, px as number, v as number), [kind, x, variant] as const);
}

/** Fresh frozen run on an empty street in `zone`; `speed` null = the real difficulty speed. */
async function freshRun(t: PlaytestContext, zone: number, speed: number | null = 110): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(3);
  await game.startRun();
  await game.setSpeed(speed);
  await game.setZone(zone);
  await game.step(20);
  await t.page.evaluate(() => window.__gameplay!.clear());
}

/** Lets the solver bot play until `done` (or `max` ticks); `pinned`: the speed is held by setSpeed. */
async function botUntil(t: PlaytestContext, done: (s: GameState) => boolean, pinned: boolean, max = 600): Promise<GameState> {
  const bot = new SolverBot(pinned);
  let s = await t.game.state();
  for (let i = 0; i < max && !done(s) && s.mode === 'playing'; i++) {
    const move = bot.next(s);
    if (move === 'press') await t.game.press();
    if (move === 'release') await t.game.release();
    s = await t.game.step(1);
  }
  await t.game.release();
  return s;
}

const entity = (s: GameState, id: number) => s.entities.find((e) => e.id === id);

async function benchGrind(t: PlaytestContext): Promise<void> {
  await freshRun(t, 0);
  const since = (await t.game.state()).frame;
  const bench = await place(t, 'bench', PLAYER_X + 90);
  const s = await botUntil(t, (x) => x.player.grinding, true);
  await t.game.step(4);
  await t.canvasShot('bench grind');
  const grinds = await t.game.eventsSince(since, 'grindStart');
  t.check('bench: landing on top grinds it', s.player.grinding && grinds.some((e) => (e.payload as { entityId: number }).entityId === bench), grinds);
  t.check('bench: no crash', (await t.game.eventsSince(since, 'crash')).length === 0);
}

async function people(t: PlaytestContext): Promise<void> {
  await freshRun(t, 1);
  const { viewWidth } = await t.game.display();
  await place(t, 'vfbFan', PLAYER_X + 150);
  await place(t, 'vfbFan', PLAYER_X + 200);
  await t.game.step(10);
  await t.canvasShot('vfb fans zone 1');
  const fan = await place(t, 'vfbFan', viewWidth - 40);
  await t.game.step(30);
  await t.canvasShot('vfb fans walking');
  // Crash into one: no input.
  const crashFrom = (await t.game.state()).frame;
  await t.page.evaluate(() => window.__gameplay!.clear());
  await place(t, 'vfbFan', PLAYER_X + 40);
  await stepWhile(t, (s) => s.player.state !== 'crash', { max: 240 });
  await t.game.step(10);
  await t.canvasShot('vfb fan cheers after a bump');
  t.check('fan: riding into a fan crashes', (await t.game.eventsSince(crashFrom, 'crash')).length === 1, { fan });

  await freshRun(t, 2);
  await place(t, 'wasenGuest', PLAYER_X + 110, 0);
  await place(t, 'wasenGuest', PLAYER_X + 170, 1);
  await t.game.step(6);
  await t.canvasShot('wasen visitors zone 2');
  await t.game.step(14);
  await t.canvasShot('wasen visitors swaying');
  await t.page.evaluate(() => window.__gameplay!.clear());
  const guestFrom = (await t.game.state()).frame;
  await place(t, 'wasenGuest', PLAYER_X + 40, 1);
  await stepWhile(t, (s) => s.player.state !== 'crash', { max: 240 });
  await t.game.step(8);
  await t.canvasShot('wasen visitor spills beer');
  t.check('guest: riding into a visitor crashes', (await t.game.eventsSince(guestFrom, 'crash')).length === 1);

  // The bot jumps people at the real difficulty speed.
  await freshRun(t, 1, null);
  const botFrom = (await t.game.state()).frame;
  const a = await place(t, 'vfbFan', PLAYER_X + 160);
  await place(t, 'wasenGuest', PLAYER_X + 330, 0);
  const s = await botUntil(t, (x) => !x.entities.length, false);
  await t.log('bot over people', { done: entity(s, a)?.done });
  t.check('bot jumps a fan and a visitor without a crash', (await t.game.eventsSince(botFrom, 'crash')).length === 0);
}

async function chill(t: PlaytestContext): Promise<void> {
  await freshRun(t, 2, null);
  const normalApex = await t.game.jumpApex(30);
  await t.game.step(40);
  const before = await t.game.state();
  const since = before.frame;
  await place(t, 'joint', PLAYER_X + 70);
  await t.game.step(10);
  await t.canvasShot('joint ahead');
  await stepWhile(t, (s) => s.chillTimer <= 0, { max: 240 });
  await t.game.step(3);
  await t.canvasShot('joint pickup');
  const starts = await t.game.eventsSince(since, 'chillStart');
  t.check('joint: pickup emits chillStart', starts.length === 1, starts);
  const chilled = await t.game.step(60);
  await t.canvasShot('chill active tint and timer');
  t.check('chill: street slows to ~60 %', chilled.speed < before.speed * 0.65, { before: before.speed, now: chilled.speed });
  const chillApex = await t.game.jumpApex(30);
  t.check('chill: the full jump is lower', chillApex < normalApex * 0.8, { normalApex, chillApex });
  await t.game.step(30);
  await t.canvasShot('chill late');
  const after = await stepWhile(t, (s) => s.chillTimer > 0, { max: 600 });
  await t.game.step(2);
  await t.canvasShot('chill over');
  t.check('chill: ends and the speed is back', after.chillTimer === 0 && (await t.game.state()).speed > chilled.speed * 1.5);
}

async function gameOver(t: PlaytestContext): Promise<void> {
  await freshRun(t, 0);
  await t.game.setScore(61_234);
  await t.game.step(1);
  await t.canvasShot('hud with thousands dot');
  await t.game.endRun();
  await t.game.step(70);
  await t.canvasShot('game over german numbers');
}

export default async function chillScenario(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await dismissRotateHint(t);
  await benchGrind(t);
  await people(t);
  await chill(t);
  await gameOver(t);
  await t.game.setSpeed(null);
}
