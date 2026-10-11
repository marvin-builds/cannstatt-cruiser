/**
 * Star points (ROADMAP 65, src/gameplay/star-arcs.ts): every star scores
 * STAR_POINTS x multiplier, a whole arc taken in one flight adds
 * STAR_ARC_BONUS x multiplier. Per round a fresh run at a pinned speed, the
 * `stars` pattern (one full-jump arc) laid right ahead with
 * `window.__gameplay.pattern('stars')`, and a full jump taken where the arc
 * starts (its first star is as far ahead as in `jumpArcStars`):
 * 1. adult mode: every star taken, the merged "Stern! +N" popup while the
 *    stars come in, then "Sternenbogen! +N" after the last one;
 * 2. kid mode: the same points and popups;
 * 3. a short hop under the arc: no star taken, no bonus.
 * Checks: star and bonus points from the logged scoreChanged deltas.
 * Shots: mid-arc (merged star popup) and right after the bonus.
 *   npm run playtest -- --scenario scripts/scenarios/star-points.ts --viewports desktop,phone-landscape,phone-portrait --name star-points
 */
import { PLAYER_X } from '../../src/core/config';
import { jumpArcStars } from '../../src/gameplay/patterns';
import { STAR_ARC_BONUS, STAR_POINTS } from '../../src/gameplay/star-arcs';
import type { Entity, GameState } from '../../src/types';
import { dismissRotateHint, type PlaytestContext, stepWhile } from '../playtest-lib';

/** Pinned speed (a mid-run speed). */
const SPEED = 120;
/** Ticks ridden after the run starts: the zone banner (2.4 s) is gone. */
const BANNER_GONE_TICKS = 160;
/** Ticks the action is held for a full jump (the longest hold). */
const FULL_HOLD = 20;
/** Ticks held for a short hop that stays under the arc. */
const HOP_HOLD = 1;
/** Ticks after the last star for the bonus shot. */
const BONUS_SHOT_DELAY = 6;

async function freshRun(t: PlaytestContext, kidMode: boolean): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'paused') await game.resumeGame();
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(7);
  await game.startRun();
  await game.setSpeed(SPEED);
  await t.page.evaluate((on) => window.__player!.kidMode(on), kidMode);
  await game.step(BANNER_GONE_TICKS);
  await t.page.evaluate(() => window.__gameplay!.clear());
  await game.step(1);
}

const starsOf = (s: GameState, ids: number[]): Entity[] => s.entities.filter((e) => ids.includes(e.id) && e.kind === 'star');

/** Lays the arc, jumps into it with `hold` ticks of action, rides past it; returns the score deltas and star count. */
async function rideArc(t: PlaytestContext, label: string, hold: number, shots: boolean): Promise<{ deltas: number[]; stars: number; laid: number }> {
  const { game } = t;
  const ids = await t.page.evaluate(() => window.__gameplay!.pattern('stars'));
  let s = await game.step(1);
  const laid = starsOf(s, ids);
  const ahead = jumpArcStars(0, SPEED)[0]!.x;
  s = await stepWhile(t, (st) => Math.min(...starsOf(st, ids).map((e) => e.x)) > PLAYER_X + ahead, { max: 600 });
  const from = s.frame;
  const startStars = s.stars;
  await game.hold(hold);
  // Half the arc: the star popup merged so far.
  if (shots) {
    await stepWhile(t, (st) => st.stars - startStars < Math.ceil(laid.length / 2) && starsOf(st, ids).length > 0, { max: 120 });
    await t.canvasShot(`${label} merged stars`);
  }
  s = await stepWhile(t, (st) => !st.player.grounded || starsOf(st, ids).some((e) => e.x + e.w >= PLAYER_X - 20), { max: 300 });
  if (shots) {
    const end = (await game.eventsSince(from, 'starCollected')).at(-1);
    const since = end ? s.frame - end.frame : 0;
    if (since < BONUS_SHOT_DELAY) await game.step(BONUS_SHOT_DELAY - since);
    await t.canvasShot(`${label} arc bonus`);
  }
  const deltas = (await game.eventsSince(from, 'scoreChanged')).map((e) => (e.payload as { delta: number }).delta);
  await t.log(label, { deltas, laid: laid.length });
  return { deltas, stars: (await game.state()).stars - startStars, laid: laid.length };
}

export default async function starPoints(t: PlaytestContext): Promise<void> {
  await dismissRotateHint(t);
  for (const kidMode of [false, true]) {
    const label = kidMode ? 'kid mode' : 'adult mode';
    await freshRun(t, kidMode);
    const run = await rideArc(t, label, FULL_HOLD, true);
    t.check(`${label}: every star of the arc taken`, run.stars === run.laid && run.laid >= 3, run);
    const starDeltas = run.deltas.filter((d) => d === STAR_POINTS);
    t.check(`${label}: each star +${STAR_POINTS}`, starDeltas.length === run.stars, run.deltas);
    t.check(`${label}: one arc bonus +${STAR_ARC_BONUS}`, run.deltas.filter((d) => d === STAR_ARC_BONUS).length === 1, run.deltas);
  }
  await freshRun(t, false);
  const hop = await rideArc(t, 'short hop', HOP_HOLD, false);
  t.check('short hop: no arc bonus', !hop.deltas.includes(STAR_ARC_BONUS), hop);
}
