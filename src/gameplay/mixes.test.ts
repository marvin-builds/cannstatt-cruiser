import { describe, expect, it } from 'vitest';
import { BASE_SPEED } from '../core/config';
import { Rng } from '../core/rng';
import type { ObstacleKind } from '../types';
import { isGrindable, isObstacle, isOverhead, isPerson, isRail, OBSTACLES, obstacleRect, railRect } from './catalogue';
import { TOP_SPEED } from './difficulty';
import { EARLY_TAKEOFF_WINDOW, humanFair, LATE_TAKEOFF_WINDOW, PERSON_ROOM_SECONDS, soberFairness, solversFor } from './fairness';
import { railBody } from './jumpsim';
import { MIX_TEMPLATES } from './mixes';
import { anchorOf, motionOf } from './motion';
import { courseOf, leadFor, type Pattern, type Piece, planPattern, TEMPLATE_NAMES } from './patterns';
import { Solver } from './solver';

const SPEEDS = [BASE_SPEED, TOP_SPEED];
const SEEDS = 5;
const blocking = (p: Piece) => isObstacle(p.kind) || isRail(p.kind);
const elements = (p: Pattern) => p.pieces.filter(blocking).length;
const zoneFor = (name: string, seed: number) => (MIX_TEMPLATES.find((t) => t.name === name)!.people ? 1 + (seed % 2) : seed % 3);

/** `count` plans of mix `name` at `speed` with the human window `window` (after `before`, if given). */
function plans(name: string, speed: number, window: number, count = SEEDS, before?: Piece[]): Pattern[] {
  return Array.from({ length: count }, (_, seed) => planPattern(new Rng(seed + 1), 3, [speed], { zone: zoneFor(name, seed), window, template: name, before }));
}

const own = (name: string, planned: Pattern[]) => planned.filter((p) => p.name === name);

describe('combination templates (ROADMAP 52 6a)', () => {
  it('are many spawn templates from tier 2 on: about 3 elements at tier 2, 4-5 at tier 3', () => {
    expect(MIX_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    for (const t of MIX_TEMPLATES) {
      expect(TEMPLATE_NAMES).toContain(t.name);
      expect(t.tier).toBeGreaterThanOrEqual(2);
      for (const p of own(t.name, plans(t.name, 140, LATE_TAKEOFF_WINDOW, 4))) expect(elements(p), t.name).toBeGreaterThanOrEqual(t.tier === 2 ? 3 : 4);
    }
    // Every kind of combination the USER asked for is there.
    const has = (test: (t: (typeof MIX_TEMPLATES)[number]) => boolean) => MIX_TEMPLATES.filter(test).length;
    expect(has((t) => !!t.people)).toBeGreaterThanOrEqual(3);
    expect(has((t) => !!t.line)).toBeGreaterThanOrEqual(3);
    expect(has((t) => !!t.route)).toBeGreaterThanOrEqual(2);
    expect(has((t) => t.tier === 3)).toBeGreaterThanOrEqual(5);
  }, 60_000);

  it('mix jumps, ducks, people and rails: each kind of piece comes in some combination', () => {
    const kinds = new Set<string>();
    for (const t of MIX_TEMPLATES) for (const p of own(t.name, plans(t.name, 140, LATE_TAKEOFF_WINDOW, 3))) for (const x of p.pieces) kinds.add(isOverhead(x.kind) ? 'sign' : isPerson(x.kind) ? 'person' : isRail(x.kind) ? 'rail' : x.kind);
    for (const k of ['sign', 'person', 'rail', 'bench', 'bin', 'curbGap']) expect(kinds).toContain(k);
  }, 60_000);

  for (const speed of SPEEDS) {
    it(`plan fair at ${speed} px/s with the unchanged human window (>= ${EARLY_TAKEOFF_WINDOW} ticks early, >= ${LATE_TAKEOFF_WINDOW} late)`, () => {
      for (const { name } of MIX_TEMPLATES) {
        for (const window of [EARLY_TAKEOFF_WINDOW, LATE_TAKEOFF_WINDOW]) {
          const planned = own(name, plans(name, speed, window));
          // The template itself must work most of the time (the planner falls back to a lone obstacle otherwise).
          expect(planned.length, `${name} ${speed} ${window}`).toBeGreaterThanOrEqual(SEEDS * 0.7);
          for (const p of planned) expect(humanFair(solversFor(courseOf(p), [speed]), soberFairness(window)), `${name} ${speed}: ${JSON.stringify(p.pieces)}`).toBe(true);
        }
      }
    }, 120_000);
  }

  // The planner checks a pattern together with the previous pattern's last pieces (patterns.ts lastPieces): every
  // kind of last piece, alone and a rail over a low obstacle (railOver), stands for every template's tail.
  const TAILS: Piece[][] = [
    ...(Object.keys(OBSTACLES) as ObstacleKind[]).map((kind) => {
      const p: Piece = { kind, ...obstacleRect(kind, 0) };
      const motion = OBSTACLES[kind].motion;
      if (motion) p.data = { walk: motion.walk[1], sway: motion.sway[1], phase: 1, ax: 0 };
      return [p];
    }),
    [{ kind: 'pipe', ...railRect(0, 10, 80) }],
    [{ kind: 'handrail', ...railRect(0, 26, 120) }, { kind: 'planter', ...obstacleRect('planter', 51) }],
  ];
  for (const speed of [BASE_SPEED, TOP_SPEED]) {
    it(`fair after every kind of previous pattern tail at ${speed} px/s (across the boundary)`, () => {
      const margin = soberFairness(LATE_TAKEOFF_WINDOW);
      for (const tail of TAILS) {
        // The tightest the spawner lays two patterns: 1.1 s of free street after the previous one's last piece.
        const end = Math.max(...tail.map((x) => x.x + x.w));
        const advance = end + Math.ceil(1.1 * speed);
        const before = tail.map((x) => ({ ...x, x: x.x - advance, data: x.data && { ...x.data, ax: anchorOf(x) - advance } }));
        for (const { name } of MIX_TEMPLATES) {
          const [p] = plans(name, speed, LATE_TAKEOFF_WINDOW, 1, before);
          const label = `${name} after ${tail.map((x) => x.kind).join('+')} at ${speed}`;
          expect(p!.name, label).toBe(name);
          const across = courseOf({ ...p!, pieces: [...before, ...p!.pieces] }, Math.min(...before.map((x) => x.x)) - leadFor(speed));
          expect(new Solver(across, speed).fair(margin.holds, margin.window), label).toBe(true);
        }
      }
    }, 120_000);
  }

  for (const speed of [BASE_SPEED, TOP_SPEED]) {
    it(`lines: the street path is fair without the rails, and a grind on any piece leads on fairly (${speed} px/s)`, () => {
      const { holds } = soberFairness(EARLY_TAKEOFF_WINDOW);
      for (const { name } of MIX_TEMPLATES.filter((t) => t.line)) {
        for (const p of own(name, plans(name, speed, EARLY_TAKEOFF_WINDOW, 3))) {
          const street = { ...p, pieces: p.pieces.filter((x) => !isRail(x.kind)) };
          expect(new Solver(courseOf(street), speed).fair(holds, EARLY_TAKEOFF_WINDOW), `${name} street: ${JSON.stringify(p.pieces)}`).toBe(true);
          for (const top of p.pieces.filter((x) => isGrindable(x.kind))) {
            expect(new Solver(courseOf(p, top.x), speed).fair(holds, EARLY_TAKEOFF_WINDOW, railBody(top.y, top.w)), `${name} from ${top.kind}`).toBe(true);
          }
        }
      }
    }, 120_000);
  }

  for (const speed of [BASE_SPEED, TOP_SPEED]) {
    it(`people inside: >= ${PERSON_ROOM_SECONDS} s of free street to every other piece, jumped or stomped and go on (${speed} px/s)`, () => {
      const { holds, window } = soberFairness(LATE_TAKEOFF_WINDOW);
      for (const { name } of MIX_TEMPLATES.filter((t) => t.people)) {
        const planned = own(name, plans(name, speed, LATE_TAKEOFF_WINDOW, 3));
        expect(planned.some((p) => p.pieces.some((x) => isPerson(x.kind))), name).toBe(true);
        for (const p of planned) {
          for (const person of p.pieces.filter((x) => isPerson(x.kind))) {
            const sway = motionOf(person)!.sway;
            for (const o of p.pieces.filter((x) => blocking(x) && x !== person)) {
              const gap = o.x > person.x ? o.x - (person.x + person.w + sway) : person.x - sway - (o.x + o.w);
              expect(gap, `${name}: ${o.kind} ${gap} px from the person`).toBeGreaterThanOrEqual(PERSON_ROOM_SECONDS * speed);
            }
            // From the street before the person (a lone person's run-up), every stomp comes down where the rest is fair.
            const stomping = new Solver(courseOf(p, person.x - leadFor(speed)), speed, { stomps: true });
            expect(stomping.stompsLeadOn(holds, window), `${name} stomp: ${JSON.stringify(p.pieces)}`).toBe(true);
          }
        }
      }
    }, 120_000);
  }

  it('route choices: a high path over a bench or a rail and a low path on the street, both fair', () => {
    for (const { name } of MIX_TEMPLATES.filter((t) => t.route)) {
      for (const p of own(name, plans(name, 140, LATE_TAKEOFF_WINDOW, 4))) {
        expect(p.pieces.some((x) => isGrindable(x.kind)), name).toBe(true);
        expect(p.pieces.some((x) => isObstacle(x.kind) && !isGrindable(x.kind)), name).toBe(true);
        expect(elements(p), name).toBeGreaterThanOrEqual(3);
      }
    }
  }, 60_000);

  it('come often from tier 2 on, never in tier 0 or 1, never while drunk or chilled', () => {
    const names = MIX_TEMPLATES.map((t) => t.name);
    const at = (rng: Rng, tier: number, options: Parameters<typeof planPattern>[3] = {}, count = 240) =>
      Array.from({ length: count }, (_, i) => planPattern(rng, tier, [i % 2 ? BASE_SPEED : TOP_SPEED], { zone: i % 3, ...options }).name);
    const share = (picked: string[]) => picked.filter((n) => names.includes(n)).length / picked.length;
    // By weight about 27 % at tier 2 and 38 % at tier 3 (fewer in Mitte, which has no people); before the
    // waves and moving hazards of ROADMAP 52 Phase 2 (waves.ts, hazards.ts: about 10-14 % of the mix) 30 % and 42 %.
    // Over 4 seeds: 240 plans of one seed swing by +-4 % around the weight.
    const rngs = [21, 22, 23, 24].map((seed) => new Rng(seed));
    expect(share(rngs.flatMap((rng) => at(rng, 2)))).toBeGreaterThanOrEqual(0.24);
    expect(share(rngs.flatMap((rng) => at(rng, 3)))).toBeGreaterThanOrEqual(0.34);
    const rng = rngs[0]!;
    for (const name of [...at(rng, 0, {}, 60), ...at(rng, 1, {}, 100), ...at(rng, 3, { drunk: true, effect: true }, 100)]) expect(names).not.toContain(name);
  }, 120_000);

  it('is deterministic per seed', () => {
    for (const { name } of MIX_TEMPLATES) expect(plans(name, 140, LATE_TAKEOFF_WINDOW, 2)).toEqual(plans(name, 140, LATE_TAKEOFF_WINDOW, 2));
  }, 60_000);
});
