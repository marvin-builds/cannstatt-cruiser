/**
 * Head jump (ROADMAP 60): a jump press shortly before or during a stomp turns
 * the fixed bounce into a real jump off the person's head, as high as the
 * press is long. Compares the plain bounce, a tap and a full hold off the
 * same head (apex heights in the log), photographs the high arc at its apex,
 * and does a buffered head jump with this viewport's real input (Space on
 * desktop, a touch tap on phones).
 *   npm run playtest -- --scenario scripts/scenarios/head-jump.ts --viewports desktop,phone-landscape --name head-jump
 */
import { GROUND_Y, PLAYER_X } from '../../src/core/config';
import type { PlaceableKind } from '../../src/gameplay/debug';
import { planStomp } from '../../src/gameplay/testing';
import type {} from '../../src/player/debug'; // window.__player
import { adultMode, dismissRotateHint, Fingers, type PlaytestContext, stepWhile } from '../playtest-lib';

const SPEED = 110;

/** How the jump goes down around the stomp: none, the test hook in the take-off tick, or real input a few ticks before. */
type Press = { kind: 'none' } | { kind: 'hook'; hold: number } | { kind: 'real'; before: number };

/** Fresh frozen run on an empty street at a pinned speed with a VfB fan ahead; returns the frame it starts at. */
async function freshScene(t: PlaytestContext): Promise<number> {
  const { game } = t;
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(3);
  await game.startRun();
  await game.setSpeed(SPEED);
  await game.setZone(1);
  await game.step(20);
  await t.page.evaluate(() => window.__gameplay!.clear());
  await t.page.evaluate(([k, x]) => window.__gameplay!.place(k as PlaceableKind, x as number, 1, 0), ['vfbFan', PLAYER_X + 130] as const);
  return (await game.state()).frame;
}

/**
 * Jumps onto the fan's head (planStomp's jump) and presses as `press` says.
 * `stompAfter` (ticks from the planned take-off to the stomp, from an earlier
 * try) times a real press; returns that count, the apex height above the
 * street and whether the run crashed. `shot` photographs the apex.
 */
async function stompAndJump(t: PlaytestContext, press: Press, label: string, stompAfter = 0, fingers?: Fingers): Promise<{ stompAfter: number; apex: number; crashed: boolean }> {
  const { game } = t;
  const since = await freshScene(t);
  const plan = planStomp(await game.state(), true);
  t.check(`${label}: a stomp jump exists`, plan !== null);
  if (!plan) return { stompAfter: 0, apex: 0, crashed: true };
  await game.step(plan.tick);
  await game.press();
  await game.step(plan.hold);
  await game.release();
  let ticks = plan.hold;
  const realAt = press.kind === 'real' ? stompAfter - press.before : -1;
  let realDown = false;
  let s = await game.state();
  while (!s.entities.some((e) => typeof e.data?.stompedAt === 'number')) {
    if (ticks > 200) throw new Error(`${label}: no stomp`);
    if (ticks === realAt) {
      realDown = true;
      if (fingers) await fingers.tap(100, 100, 2);
      else await t.page.keyboard.down('Space');
    }
    s = await game.step(1);
    ticks++;
  }
  // The stomp came in the last tick; the take-off is the next one.
  if (press.kind === 'hook') await game.press();
  let minY = s.player.y;
  let apexShot = false;
  for (let i = 0; i < 120; i++) {
    if (press.kind === 'hook' && i === press.hold) await game.release();
    if (realDown && !fingers && i === 20) await t.page.keyboard.up('Space');
    const next = await game.step(1);
    if (!apexShot && next.player.vy >= 0 && i > 2) {
      apexShot = true;
      await t.canvasShot(`${label} apex`);
    }
    minY = Math.min(minY, next.player.y);
    s = next;
    if (s.player.grounded) break;
  }
  if (press.kind === 'hook') await game.release();
  if (realDown && !fingers) await t.page.keyboard.up('Space');
  const crashed = (await game.eventsSince(since, 'crash')).length > 0;
  return { stompAfter: ticks, apex: GROUND_Y - minY, crashed };
}

export default async function headJumpScenario(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await dismissRotateHint(t);
  await adultMode(t);
  const bounce = await stompAndJump(t, { kind: 'none' }, 'plain bounce');
  const tap = await stompAndJump(t, { kind: 'hook', hold: 1 }, 'head jump tap');
  const full = await stompAndJump(t, { kind: 'hook', hold: 20 }, 'head jump full hold');
  await t.log('head jump apexes (px above the street)', { bounce: bounce.apex, tap: tap.apex, full: full.apex });
  t.check('no crash on any of them', !bounce.crashed && !tap.crashed && !full.crashed, { bounce, tap, full });
  t.check('a tap off the head flies higher than the plain bounce', tap.apex > bounce.apex + 3, { bounce: bounce.apex, tap: tap.apex });
  t.check('a full hold off the head flies a full jump higher (~52 px above the head)', full.apex > tap.apex + 30, { tap: tap.apex, full: full.apex });

  // Real input inside the jump buffer: Space goes down 3 ticks before the stomp; a touch tap presses when the finger lifts, 2 ticks after it lands.
  const fingers = t.viewport.touch ? new Fingers(t, await t.page.context().newCDPSession(t.page)) : undefined;
  const real = await stompAndJump(t, { kind: 'real', before: fingers ? 5 : 3 }, `real ${fingers ? 'touch tap' : 'Space held'} buffered`, bounce.stompAfter, fingers);
  await t.log('real input head jump apex', real);
  t.check('a real press just before the stomp is buffered into a head jump', !real.crashed && real.apex > bounce.apex + 3, { bounce: bounce.apex, real: real.apex });
  await t.game.setSpeed(null);
}
