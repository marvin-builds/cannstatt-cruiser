/**
 * Quiet time (ROADMAP 52, Phase 1): a 3 min run ridden by the careful solver
 * bot on the street path (it jumps and ducks, but never presses a kicker on
 * purpose, so it skips stunt lines and the park line), with real keys
 * (Space jump, ArrowDown duck) on the frozen clock. Every tick feeds the
 * quiet-time meter (src/gameplay/quiet-time.ts): the longest and mean stretch
 * of sober street without something to react to, per minute, logged at the
 * end. Shots: every minute, a stunt line with its low street obstacles under
 * the ledges (on approach and while the bot jumps one), and the NorDIY park
 * with its own. Checks: from 20 s on no quiet stretch over 2.5 s, a line and
 * a park with street obstacles were met, and none of those obstacles crashed
 * the bot. The highscore worker is never reached (the harness blocks it).
 *   npm run playtest -- --scenario scripts/scenarios/quiet-time.ts --viewports desktop --name quiet-time
 */
import { PLAYER_X } from '../../src/core/config';
import { LINE_STREET_KINDS } from '../../src/gameplay/line-street';
import { QuietMeter, soberAt, threatAtSkater } from '../../src/gameplay/quiet-time';
import { SolverBot } from '../../src/gameplay/testing';
import type { Entity, GameState, ObstacleKind } from '../../src/types';
import { dismissRotateHint, type PlaytestContext } from '../playtest-lib';

const SEED = 4;
const SECONDS = 180;
/** The quiet cap counts from here (seconds of the run)... */
const FROM = 20;
/** ...and allows this much (seconds). */
const QUIET_CAP = 2.5;

/** The ledge above street obstacle `o` in `s` (a line's or the park's), or undefined. */
function ledgeOver(s: GameState, o: Entity): Entity | undefined {
  if (!LINE_STREET_KINDS.includes(o.kind as ObstacleKind)) return undefined;
  return s.entities.find((l) => l.kind === 'ledge' && l.x <= o.x && o.x + o.w <= l.x + l.w);
}

/** Street obstacles under a ledge (the park's when `park`, else a stunt line's). */
function underLedges(s: GameState, park: boolean): Entity[] {
  return s.entities.filter((o) => {
    const ledge = ledgeOver(s, o);
    return ledge !== undefined && (ledge.data?.park !== undefined) === park;
  });
}

export default async function quietTime(t: PlaytestContext): Promise<void> {
  const { game } = t;
  const kb = t.page.keyboard;
  await dismissRotateHint(t);
  await game.pause();
  await game.seed(SEED);
  await game.startRun();
  const { viewWidth } = await game.display();
  const meter = new QuietMeter(FROM);
  const bot = new SolverBot();
  const shots = { line: 0, lineJump: 0, park: 0, parkJump: 0 };
  const lineCrashes: unknown[] = [];
  let s = await game.state();
  let stars = s.stars;
  let health = s.health;
  let ducking = false;
  for (let tick = 0; tick < SECONDS * 60 && s.mode === 'playing'; tick++) {
    const move = bot.next(s);
    if (move === 'press') await kb.down('Space');
    if (move === 'release') await kb.up('Space');
    const duck = bot.duck(s);
    if (duck !== ducking) await (duck ? kb.down('ArrowDown') : kb.up('ArrowDown'));
    ducking = duck;
    s = await game.step(1);
    meter.add(s.time, s.stars > stars || threatAtSkater(s.entities), soberAt(s));
    stars = s.stars;
    if (s.health < health) {
      const near = s.entities.filter((e) => Math.abs(e.x - PLAYER_X) < 30 && ledgeOver(s, e));
      if (near.length > 0) lineCrashes.push({ t: s.time, kinds: near.map((e) => e.kind) });
      // Keep riding: the measure needs the whole run.
      await game.setHealth(s.maxHealth);
    }
    health = s.health;
    for (const park of [false, true]) {
      const under = underLedges(s, park);
      const key = park ? 'park' : 'line';
      if (shots[key] < 1 && under.some((o) => o.x > PLAYER_X && o.x < viewWidth * 0.75)) {
        shots[key]++;
        await t.canvasShot(`${key} street obstacles under the ledges t${Math.round(s.time)}`);
      }
      const jumpKey = park ? 'parkJump' : 'lineJump';
      if (shots[jumpKey] < 1 && !s.player.grounded && under.some((o) => Math.abs(o.x + o.w / 2 - PLAYER_X) < 6)) {
        shots[jumpKey]++;
        await t.canvasShot(`${key} street obstacle jumped from the street t${Math.round(s.time)}`);
      }
    }
    if (tick % 3600 === 3599) await t.canvasShot(`minute ${Math.round(s.time / 60)}`);
  }
  await kb.up('Space');
  await kb.up('ArrowDown');
  const report = meter.report();
  await t.log('quiet time', {
    seed: SEED,
    from: FROM,
    longest: { start: +report.longest.start.toFixed(1), seconds: +report.longest.seconds.toFixed(2) },
    minutes: report.minutes.map((m) => ({ minute: m.minute + 1, longest: +m.longest.toFixed(2), mean: +m.mean.toFixed(2), stretches: m.stretches })),
    shots,
  });
  t.check(`from ${FROM} s on no quiet stretch over ${QUIET_CAP} s`, report.longest.seconds <= QUIET_CAP, report.longest);
  t.check('met a stunt line with street obstacles under it', shots.line > 0, shots);
  t.check('met the NorDIY park with street obstacles under it', shots.park > 0, shots);
  t.check('no street obstacle under a line crashed the careful bot', lineCrashes.length === 0, lineCrashes);
}
