import { describe, expect, it } from 'vitest';
import { BASE_SPEED, TICK_DT } from '../core/config';
import { Game } from '../core/game';
import { Rng } from '../core/rng';
import { isObstacle, isOverhead, isPerson, isRail } from './catalogue';
import { TOP_SPEED } from './difficulty';
import { EARLY_TAKEOFF_WINDOW, humanFair, LATE_TAKEOFF_WINDOW, soberFairness, solversFor } from './fairness';
import { createGameplaySystem } from './index';
import { courseOf, leadFor, mixAt, type Pattern, type Piece, planPattern, TEMPLATE_NAMES } from './patterns';
import { BREATHER_SECONDS, WAVE_KINDS, WAVE_PIECES } from './waves';

const blocking = (p: Piece) => isObstacle(p.kind) || isRail(p.kind);
const wavePieces = (p: Pattern) => p.pieces.filter(blocking).sort((a, b) => a.x - b.x);

function waves(speed: number, window: number, count = 6, kidMode = false): Pattern[] {
  return Array.from({ length: count }, (_, seed) => planPattern(new Rng(seed + 1), 2, [speed], { zone: seed % 3, window, template: 'wave', kidMode }));
}

describe('waves (ROADMAP 52 Phase 2, point 6)', () => {
  it('are a spawn template from tier 2 on, in every zone', () => {
    expect(TEMPLATE_NAMES).toContain('wave');
    for (const zone of [0, 1, 2]) {
      expect(mixAt(1, zone).wave ?? 0).toBe(0);
      expect(mixAt(2, zone).wave).toBeGreaterThan(0.04);
      expect(mixAt(3, zone).wave).toBeGreaterThan(0.04);
    }
  });

  for (const speed of [BASE_SPEED, TOP_SPEED]) {
    for (const window of [EARLY_TAKEOFF_WINDOW, LATE_TAKEOFF_WINDOW]) {
      it(`are 3-4 easy single obstacles in a steady rhythm, each with the full take-off window (${speed} px/s, ${window} ticks)`, () => {
        for (const p of waves(speed, window)) {
          expect(p.name).toBe('wave');
          const row = wavePieces(p);
          expect(row.length).toBeGreaterThanOrEqual(WAVE_PIECES[0]);
          expect(row.length).toBeLessThanOrEqual(WAVE_PIECES[1]);
          for (const x of row) {
            expect(WAVE_KINDS).toContain(x.kind);
            expect(isPerson(x.kind) || isOverhead(x.kind) || isRail(x.kind)).toBe(false);
          }
          // Steady: the same street from one take-off spot to the next (start to start).
          const beats = row.slice(1).map((x, i) => x.x - row[i]!.x);
          expect(Math.max(...beats) - Math.min(...beats), JSON.stringify(beats)).toBeLessThanOrEqual(1);
          // Each a single: a landing in between (no two in one jump), >= 0.7 s of street.
          for (let i = 1; i < row.length; i++) expect(row[i]!.x - (row[i - 1]!.x + row[i - 1]!.w)).toBeGreaterThanOrEqual(0.7 * speed);
          // The whole wave with the unchanged human window, and every piece from its own run-up too.
          const margin = soberFairness(window);
          expect(humanFair(solversFor(courseOf(p), [speed]), margin), JSON.stringify(row)).toBe(true);
          for (const x of row) {
            const from = courseOf({ ...p, pieces: p.pieces.filter((o) => o.x >= x.x) }, x.x - leadFor(speed));
            expect(humanFair(solversFor(from, [speed]), margin), `${x.kind} at ${x.x}`).toBe(true);
          }
        }
      }, 60_000);
    }

    it(`end with a breather: >= ${BREATHER_SECONDS} s of street after the last piece with nothing to crash into (${speed} px/s)`, () => {
      for (const p of waves(speed, LATE_TAKEOFF_WINDOW)) {
        const last = wavePieces(p).at(-1)!;
        const end = last.x + last.w;
        expect(p.length - end).toBeGreaterThanOrEqual(BREATHER_SECONDS * speed);
        // Only stars (an easy arc to catch) in the breather.
        for (const x of p.pieces.filter((o) => o.x >= end)) expect(x.kind).toBe('star');
      }
    }, 30_000);
  }

  it('kid mode: a wave is at most 3 pieces', () => {
    for (const p of waves(140, LATE_TAKEOFF_WINDOW, 8, true)) expect(wavePieces(p).length).toBe(3);
  }, 30_000);

  it('never while drunk or chilled, never before tier 2', () => {
    const rng = new Rng(5);
    for (let i = 0; i < 120; i++) {
      expect(planPattern(rng, 3, [TOP_SPEED], { zone: i % 3, drunk: true, effect: true }).name).not.toBe('wave');
      expect(planPattern(rng, 1, [BASE_SPEED], { zone: i % 3 }).name).not.toBe('wave');
    }
  }, 60_000);
});

interface Laid {
  pattern: Pattern;
  street: number;
}

/** Every pattern the real gameplay system lays in `seconds` of riding seed `seed` (nobody steering, never crashing). */
function ride(seed: number, seconds: number): Laid[] {
  const log: Laid[] = [];
  const game = new Game({ systems: [createGameplaySystem({ onPattern: (pattern, street) => log.push({ pattern, street }) })] });
  game.seed(seed);
  game.commands.startRun();
  game.state.player.invulnerableTimer = Infinity;
  for (let t = 0; t < seconds / TICK_DT; t++) game.tick();
  return log;
}

describe('waves, the e-scooter and pigeons on the street (spawner rides)', { timeout: 300_000 }, () => {
  const rides = [1, 2, 3, 4, 5, 6].map((seed) => ride(seed, 240));

  it('come from about tier 2 on (street 4800, ~50 s), now and then', () => {
    for (const name of ['wave', 'scooter', 'pigeons']) {
      const laid = rides.flat().filter((l) => l.pattern.name === name);
      expect(laid.length, name).toBeGreaterThanOrEqual(3);
      for (const l of laid) expect(l.street, name).toBeGreaterThanOrEqual(4800 - 700);
    }
  });

  it('keep the breather after a wave: the next obstacle comes >= the breather after its last piece', () => {
    let seen = 0;
    for (const laid of rides) {
      laid.forEach((l, i) => {
        if (l.pattern.name !== 'wave') return;
        const last = wavePieces(l.pattern).at(-1)!;
        const end = l.street + last.x + last.w;
        const next = laid.slice(i + 1).flatMap((n) => n.pattern.pieces.filter(blocking).map((x) => n.street + x.x));
        if (next.length === 0) return;
        seen++;
        // At the wave's own speed (its fastest): the breather in seconds of riding.
        expect(Math.min(...next) - end).toBeGreaterThanOrEqual(BREATHER_SECONDS * BASE_SPEED);
        expect(Math.min(...next) - end).toBeGreaterThanOrEqual(l.pattern.length - (last.x + last.w));
      });
    }
    expect(seen).toBeGreaterThanOrEqual(3);
  });
});
