import { describe, expect, it } from 'vitest';
import { GROUND_Y, PLAYER_X } from '../core/config';
import { tick } from '../player/testing';
import { HITBOX_W } from '../player/tuning';
import type { Game } from '../core/game';
import type { Entity } from '../types';
import { hitBox, isGrindable, isObstacle, OBSTACLES, railRect } from './catalogue';
import { buildCourse } from './course';
import { TOP_SPEED } from './difficulty';
import { overlaps } from './rules';
import { Solver } from './solver';
import { obstacle, place, playBot, quietGame, record } from './test-kit';

interface Landing {
  crashed: boolean;
  grinded: boolean;
  /** The feet crossed the top edge from above this many px after its start (null: never). */
  crossedAt: number | null;
  /** On the crash tick: the feet were already below the top before it (side or front impact). */
  sideHit: boolean;
  /** The body passed within 1 px of the box's side while below the top (the solver's safety margin calls that a crash). */
  brushed: boolean;
}

/** Jumps from the ground at once (holding `hold` ticks) towards `target` and rides on for 2 s. */
function jumpAt(game: Game, target: Entity, hold: number): Landing {
  const crashes = record(game, 'crash');
  const grinds = record(game, 'grindStart');
  const result: Landing = { crashed: false, grinded: false, crossedAt: null, sideHit: false, brushed: false };
  game.buttons.action.press('test');
  for (let i = 0; i < 120 && crashes.length === 0; i++) {
    if (i === hold) game.buttons.action.release('test');
    const before = game.state.player.y;
    tick(game, 1);
    const p = game.state.player;
    if (result.crossedAt === null && before <= target.y && p.y >= target.y && p.y > before) result.crossedAt = p.x - target.x;
    if (crashes.length > 0) result.sideHit = before > target.y && p.x <= target.x + target.w;
    const near = { x: p.hitbox.x - 1, y: p.hitbox.y - 1, w: p.hitbox.w + 2, h: p.hitbox.h + 2 };
    const box = isObstacle(target.kind) ? hitBox({ ...target, kind: target.kind }) : null;
    if (box && !p.grinding && p.y > target.y && p.x <= target.x + target.w && overlaps(near, box)) result.brushed = true;
  }
  game.buttons.action.release('test');
  result.crashed = crashes.length > 0;
  result.grinded = grinds.length > 0;
  return result;
}

const SWEEP_SPEEDS = [90, 120, TOP_SPEED];
const SWEEP_HOLDS = [1, 3, 6, 10, 14, 20];

describe('grindable bench', () => {
  it('is grindable, the other ground obstacles are not', () => {
    expect(isGrindable('bench')).toBe(true);
    expect(isGrindable('handrail')).toBe(true);
    for (const kind of ['bin', 'barrier', 'planter', 'curbGap', 'vfbFan', 'banner'] as const) expect(isGrindable(kind)).toBe(false);
  });

  for (const speed of [90, TOP_SPEED]) {
    it(`landing on the bench top from above grinds it like a rail at ${speed} px/s`, () => {
      const game = quietGame(speed);
      const grinds = record(game, 'grindStart');
      const crashes = record(game, 'crash');
      const clears = record(game, 'obstacleCleared');
      const bench = obstacle(game, 'bench', PLAYER_X + 70);
      playBot(game, 300, () => grinds.length > 0);
      expect(grinds).toEqual([{ entityId: bench.id }]);
      tick(game, 1);
      expect(game.state.player.grinding).toBe(true);
      expect(game.state.player.y).toBe(bench.y);
      expect(bench.y).toBe(GROUND_Y - OBSTACLES.bench.h);
      playBot(game, 120);
      expect(crashes).toEqual([]);
      // Grind landing = trick 1, the bench passed = trick 2.
      expect(clears).toEqual([{ entityId: bench.id, kind: 'bench', points: OBSTACLES.bench.points * 2 }]);
    });
  }

  it('landing from above on any part of the top (front corner to rear end) grinds or lands, never crashes', () => {
    const bad: string[] = [];
    let rear = 0;
    for (const speed of SWEEP_SPEEDS) {
      for (const hold of SWEEP_HOLDS) {
        for (let dx = 0; dx < 100; dx++) {
          const game = quietGame(speed);
          const bench = obstacle(game, 'bench', PLAYER_X + dx);
          const r = jumpAt(game, bench, hold);
          if (r.crossedAt !== null && r.crossedAt > bench.w - 4) rear++;
          if (r.crashed && !r.sideHit) bad.push(`${speed} px/s hold ${hold} dx ${dx}: feet crossed the top at ${r.crossedAt?.toFixed(1)}`);
        }
      }
    }
    expect(bad).toEqual([]);
    expect(rear).toBeGreaterThan(10);
  });

  it('the solver agrees with the live game on every bench landing', () => {
    const disagree: string[] = [];
    for (const speed of SWEEP_SPEEDS) {
      for (const hold of SWEEP_HOLDS) {
        for (let dx = 0; dx < 100; dx++) {
          const game = quietGame(speed);
          const bench = obstacle(game, 'bench', PLAYER_X + dx);
          const course = buildCourse([{ kind: 'bench', x: bench.x, y: bench.y, w: bench.w, h: bench.h }], PLAYER_X, (g) => g + 400);
          const solverPasses = new Solver(course, speed).jumpWorks(0, hold);
          const r = jumpAt(game, bench, hold);
          // Only jumps that come down at the bench (the solver may take a second jump after landing in front of it).
          const atBench = !r.brushed && r.crossedAt !== null && r.crossedAt >= -HITBOX_W / 2 && r.crossedAt <= bench.w + HITBOX_W / 2;
          if (atBench && solverPasses === r.crashed) disagree.push(`${speed}/${hold}/${dx}: came down at ${r.crossedAt!.toFixed(1)}, live ${r.crashed ? 'crashed' : 'passed'}, solver ${solverPasses ? 'passes' : 'crashes'}`);
        }
      }
    }
    expect(disagree).toEqual([]);
  }, 30_000);

  it('rails and pipes: coming down at either end grinds or lands on the street, never crashes', () => {
    for (const kind of ['handrail', 'pipe'] as const) {
      for (const hold of SWEEP_HOLDS) {
        for (let dx = 0; dx < 100; dx += 2) {
          const game = quietGame(120);
          const rail = place(game, kind, railRect(PLAYER_X + dx, kind === 'pipe' ? 10 : 20, 48));
          expect(jumpAt(game, rail, hold).crashed, `${kind} hold ${hold} dx ${dx}`).toBe(false);
        }
      }
    }
  });

  it('riding into the bench front on the ground crashes', () => {
    const game = quietGame();
    const crashes = record(game, 'crash');
    const grinds = record(game, 'grindStart');
    const bench = obstacle(game, 'bench', PLAYER_X + 20);
    tick(game, 40);
    expect(grinds).toEqual([]);
    expect(crashes).toEqual([expect.objectContaining({ entityId: bench.id, kind: 'bench' })]);
  });

  it('a low hop into the bench side crashes instead of grinding', () => {
    const game = quietGame();
    const crashes = record(game, 'crash');
    const grinds = record(game, 'grindStart');
    obstacle(game, 'bench', PLAYER_X + 8);
    game.buttons.action.press('test');
    tick(game, 1);
    game.buttons.action.release('test');
    tick(game, 40);
    expect(grinds).toEqual([]);
    expect(crashes).toHaveLength(1);
  });
});
