/**
 * Grind points (ROADMAP 92, src/gameplay/grind-score.ts): a run that only
 * grinds must visibly score. A fresh run at a pinned speed on a cleared
 * street (kept free of spawned patterns) gets a handrail and then a bench;
 * the grind bot (src/gameplay/grind-bot.ts, jumps found in Node by trying
 * them in a quiet game) jumps onto each and does nothing else: no clears,
 * stomps or tricks. Logged per tick: score, grinding, and the score changes.
 * Checks: the score rises tick by tick during each grind, each grind ends
 * with an obstacleCleared of its entity (the ui's "+N" popup) carrying the
 * grind's total, and the rail grind is the only scoring until the bench.
 * Shots: before the rail, during its grind, its "+N" popup, and the bench's.
 *   npm run playtest -- --scenario scripts/scenarios/grind-points.ts --viewports desktop,phone-landscape --name grind-points
 */
import { PLAYER_X } from '../../src/core/config';
import { obstacleRect, railRect } from '../../src/gameplay/catalogue';
import { bestGrindJump, GrindBot, type GrindJump } from '../../src/gameplay/grind-bot';
import type {} from '../../src/gameplay/debug';
import type { GameEvents, GameState } from '../../src/types';
import { dismissRotateHint, type PlaytestContext } from '../playtest-lib';

/** Pinned speed (a mid-run speed). */
const SPEED = 120;
/** Ticks ridden after the run starts: the zone banner (2.4 s) is gone. */
const BANNER_GONE_TICKS = 160;
const RAIL = { height: 22, length: 120, x: PLAYER_X + 120 };
const BENCH_X = PLAYER_X + 520;
/** Street kept free of spawned patterns from the skater on. */
const FREE = 900;
/** Ticks into a grind for its shot. */
const DURING = 20;
/** Ticks after a grind's end for its popup shot (the popup has risen a little). */
const POPUP_DELAY = 8;
const RIDE_TICKS = 520;

interface Tick {
  frame: number;
  score: number;
  grinding: boolean;
}

export default async function grindPoints(t: PlaytestContext): Promise<void> {
  const { game, page } = t;
  // Found in Node before anything is placed (the trials take a moment).
  const railJump = bestGrindJump('handrail', railRect(0, RAIL.height, RAIL.length), SPEED)!;
  const benchJump = bestGrindJump('bench', obstacleRect('bench', 0), SPEED)!;
  await dismissRotateHint(t);
  // Frozen clock: the street moves only through step.
  await game.pause();
  if ((await game.state()).mode === 'paused') await game.resumeGame();
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(3);
  await game.startRun();
  await game.setSpeed(SPEED);
  await game.step(BANNER_GONE_TICKS);
  const ids = await page.evaluate(
    ({ rail, benchX, free, playerX }) => {
      const g = window.__gameplay!;
      g.clear();
      g.keepFree(playerX, free);
      return { rail: g.rail('handrail', rail.x, rail.height, rail.length), bench: g.place('bench', benchX) };
    },
    { rail: RAIL, benchX: BENCH_X, free: FREE, playerX: PLAYER_X },
  );
  const jumps = new Map<number, GrindJump>([
    [ids.rail, railJump],
    [ids.bench, benchJump],
  ]);
  await t.log('grind jumps', Object.fromEntries(jumps));

  const bot = new GrindBot(jumps);
  let s: GameState = await game.step(1);
  const from = s.frame;
  const startScore = s.score;
  const ticks: Tick[] = [];
  let shotBefore = false;
  let grindTicks = 0;
  let sinceEnd = -1;
  let grindsDone = 0;
  for (let i = 0; i < RIDE_TICKS && s.mode === 'playing'; i++) {
    const move = bot.next(s);
    if (move === 'press' && !shotBefore) {
      shotBefore = true;
      await t.canvasShot('before the rail');
    }
    if (move === 'press') await game.press();
    if (move === 'release') await game.release();
    const was = s.player.grinding;
    s = await game.step(1);
    ticks.push({ frame: s.frame, score: s.score, grinding: s.player.grinding });
    grindTicks = s.player.grinding ? grindTicks + 1 : 0;
    if (grindTicks === DURING && grindsDone === 0) await t.canvasShot('rail grind, score rising');
    if (was && !s.player.grinding) sinceEnd = 0;
    else if (sinceEnd >= 0) sinceEnd++;
    if (sinceEnd === POPUP_DELAY) {
      grindsDone++;
      sinceEnd = -1;
      await t.canvasShot(grindsDone === 1 ? 'rail grind +N popup' : 'bench grind +N popup');
    }
  }

  const events = async <K extends keyof GameEvents>(name: K) => (await game.eventsSince(from, name)).map((e) => ({ frame: e.frame, ...(e.payload as GameEvents[K]) }));
  const starts = await events('grindStart');
  const ends = await events('grindEnd');
  const clears = await events('obstacleCleared');
  const scores = await events('scoreChanged');
  const crashes = await events('crash');
  await t.log('grind ride', { starts, ends, clears, deltas: scores.map((e) => [e.frame, e.delta]), ticks: ticks.filter((k) => k.grinding).map((k) => [k.frame, k.score]) });

  t.check('no crash', crashes.length === 0, crashes);
  t.check('both grinds ridden', starts.map((e) => e.entityId).join() === `${ids.rail},${ids.bench}`, starts);
  for (const [label, id] of [['rail', ids.rail], ['bench', ids.bench]] as const) {
    const start = starts.find((e) => e.entityId === id);
    const end = ends.find((e) => e.entityId === id);
    if (!start || !end) continue;
    // The landing on the start tick and one tick of points per tick on it; the end tick pays nothing (a bench's own clear may come then).
    const paid = scores.filter((e) => e.frame >= start.frame && e.frame < end.frame).reduce((sum, e) => sum + e.delta, 0);
    const during = ticks.filter((k) => k.frame > start.frame && k.frame < end.frame);
    const rising = during.every((k, i) => i === 0 || k.score > during[i - 1]!.score);
    t.check(`${label}: score rises every grind tick`, during.length > 5 && rising, during.length);
    const popup = clears.find((c) => c.entityId === id && c.points === paid);
    t.check(`${label}: +${paid} popup event at the grind's end`, paid > 0 && !!popup && popup.frame === end.frame, { paid, clears });
  }
  const railEnd = ends.find((e) => e.entityId === ids.rail);
  const benchStart = starts.find((e) => e.entityId === ids.bench);
  if (railEnd && benchStart) {
    const railOnly = scores.filter((e) => e.frame < benchStart.frame).reduce((sum, e) => sum + e.delta, 0);
    const railPopup = clears.find((c) => c.entityId === ids.rail);
    t.check('the rail grind is all the score before the bench', railOnly === (railPopup?.points ?? -1) && s.score > startScore, { railOnly, railPopup });
  }
}
