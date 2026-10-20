/**
 * Test-only tooling (enabled together with window.__game): lets playtest
 * scenarios put a specific obstacle, person, the joint or stunt pieces on the
 * street, see the dropped items (they are no entities, so window.__game
 * misses them) and the running stunt line, plan a NorDIY park right ahead,
 * lay a named spawn pattern (the combos, a wave, the e-scooter, the pigeons,
 * a fan crowd; in kid mode as kid mode plans them), put a rail of any size
 * there and keep a stretch free of spawned patterns, see which patterns the
 * spawner laid and start a run further down the street.
 * See scripts/scenarios/ducking.ts, chill.ts, people.ts, drop.ts, stunts.ts, nordiy.ts, combos.ts, fan-crowd.ts and grind-points.ts.
 */
import { PLAYER_X, VIEW_MAX_W } from '../core/config';
import { Rng } from '../core/rng';
import type { CarriedItem, Entity, GameContext, ObstacleKind, ParkPlan, RailKind, Rect, StuntKind } from '../types';
import { jointRect, kickerRect, ledgeRect, OBSTACLES, obstacleRect, railRect } from './catalogue';
import type { DroppedItems } from './drop';
import type { LaidPattern } from './pattern-log';
import { motionOf, withMotion } from './motion';
import { parkPiecesOf, planParkLine } from './park-line';
import { CROWD_TEMPLATE, planCrowd } from './crowd';
import { type Pattern, planPattern } from './patterns';
import { linkArcs } from './star-arcs';
import { planStuntLine } from './stunt-line';
import { DEFAULT_LEDGE_HEIGHT, type StuntLines, type StuntLineView } from './stunts';

export type PlaceableKind = ObstacleKind | StuntKind | 'joint';

/** Length of a placed ledge. */
const PLACED_LEDGE_LENGTH = 100;

/** A dropped item as the hook shows it: its pickup box (screen space) and whether it already lies on the street. */
export interface DroppedItemView extends Rect {
  item: CarriedItem;
  lying: boolean;
}

export interface GameplayDebugHook {
  /**
   * Places `kind` with its left edge at screen x (people: their street
   * anchor, moving with the middle of their catalogue motion) and returns its
   * entity id. `variant` picks the bin colour / Wasen outfit, `prop` what a
   * Wasen visitor holds (0 Maßkrug, in kid mode Lebkuchenherz; 1 Brezel).
   * Stunt pieces form one line: a kicker starts a new one (launching for a
   * DEFAULT_LEDGE_HEIGHT ledge), a ledge (DEFAULT_LEDGE_HEIGHT up,
   * PLACED_LEDGE_LENGTH long, the current zone's look; `variant` picks the
   * zone's second look) joins the line placed last. A ledge's y is its grind surface.
   */
  place(kind: PlaceableKind, x: number, variant?: number, prop?: number): number;
  /** Places a rail with its left edge at screen x, its top `height` px above the street and `length` px long; returns its id. */
  rail(kind: RailKind, x: number, height: number, length: number): number;
  /** Keeps the street from screen x on for `length` px free of spawned patterns (what is already laid there stays). */
  keepFree(x: number, length: number): void;
  /**
   * Places a whole designed stunt line (stunt-line.ts) for the current speed
   * and zone with its first kicker at screen x; returns the entity ids
   * (stars included). `seed` picks the design.
   */
  stuntLine(x: number, seed?: number): number[];
  /**
   * Plans the spawn template `name` (patterns.ts, e.g. a combo from
   * combos.ts, or CROWD_TEMPLATE 'fanCrowd', crowd.ts) for the current speed and zone with its origin (the player's
   * x when it starts, before its run-up) at screen x, removing whatever
   * stood there and keeping that street free of spawned patterns; returns
   * the entity ids (stars included). `seed` picks the layout.
   */
  pattern(name: string, x?: number, seed?: number): number[];
  /** The running stunt line (steps, made, multiplier, points), or null; read-only. */
  stunts(): StuntLineView | null;
  /**
   * Plans the NorDIY park for the current speed with its start `offset` run
   * distance ahead of the player (default: just beyond the widest view's
   * right edge), puts it into state.park and lays its line and high fiver,
   * removing whatever stood there (and an earlier debug park). Run distance
   * d is at screen x `PLAYER_X + d - state.distance`. The spawner keeps the
   * park's street free and the speed ramp pauses there, like a planned park.
   */
  park(offset?: number, seed?: number): ParkPlan;
  /** The planned park (state.park), or null; read-only. */
  parkPlan(): ParkPlan | null;
  /** Removes every entity (spawning goes on as planned). */
  clear(): void;
  /** The last patterns the spawner laid (name, street distance of the start, elements), oldest first; read-only. */
  patterns(): LaidPattern[];
  /**
   * Puts a run that has not ticked yet at street distance `distance`, so it
   * starts there with that distance's difficulty (speed, gap, pattern tier).
   * Throws once the run has moved.
   */
  startAt(distance: number): void;
  /** Snapshot of the items knocked out of people's hands (drop.ts), falling or lying; read-only. */
  drops(): DroppedItemView[];
}

declare global {
  interface Window {
    __gameplay?: GameplayDebugHook;
  }
}

let nextId = 800_000;

/** A fan crowd planned at once for `speed` (null when bouncing across is not fair there). */
function crowdNow(seed: number, speed: number, kidMode: boolean): Pattern | null {
  const steps = planCrowd(new Rng(seed), [speed], { kidMode });
  for (;;) {
    const step = steps.next();
    if (step.done) return step.value;
  }
}

const mid = ([a, b]: [number, number]) => (a + b) / 2;

/** Ids of debug-placed stunt lines (negative, apart from the spawner's street-based ids). */
let nextLine = -1;

/** Keeps run distances [start, end) free of spawned patterns (spawner.reserve), given the current distance. */
export type ReserveStreet = (start: number, end: number, distance: number) => void;

export function installGameplayDebug(
  ctx: GameContext,
  dropped: DroppedItems,
  stunts: StuntLines,
  reserve: ReserveStreet = () => {},
  laid: () => readonly LaidPattern[] = () => [],
): void {
  /** The line placed last: its id and pieces. */
  let line = { id: 0, pieces: [] as Entity[] };
  function placeStunt(kind: StuntKind, x: number, variant: number): number {
    if (kind === 'kicker' || line.id === 0) line = { id: nextLine--, pieces: [] };
    const step = line.pieces.length + 1;
    const rect = kind === 'kicker' ? kickerRect(x) : ledgeRect(x, DEFAULT_LEDGE_HEIGHT, PLACED_LEDGE_LENGTH);
    const data: Record<string, number> = { line: line.id, step };
    if (kind === 'ledge') Object.assign(data, { zone: ctx.state.zoneIndex, variant });
    const e: Entity = { id: nextId++, kind, ...rect, done: false, data };
    line.pieces.push(e);
    // A kicker expects a ledge after it; a ledge may end the line.
    const steps = kind === 'kicker' ? step + 1 : step;
    for (const p of line.pieces) p.data!.steps = steps;
    ctx.state.entities.push(e);
    return e.id;
  }
  window.__gameplay = {
    place(kind, x, variant = 0, prop = 0) {
      if (kind === 'kicker' || kind === 'ledge') return placeStunt(kind, x, variant);
      const id = nextId++;
      const rect = kind === 'joint' ? jointRect(x) : obstacleRect(kind, x);
      const e: Entity = { id, kind, ...rect, done: false, data: { variant, prop } };
      const motion = kind === 'joint' ? undefined : OBSTACLES[kind].motion;
      if (motion) withMotion(e, { walk: mid(motion.walk), sway: mid(motion.sway), phase: 0 }, x);
      ctx.state.entities.push(e);
      return id;
    },
    rail(kind, x, height, length) {
      const e: Entity = { id: nextId++, kind, ...railRect(x, height, length), done: false };
      ctx.state.entities.push(e);
      return e.id;
    },
    keepFree(x, length) {
      const start = ctx.state.distance + (x - PLAYER_X);
      reserve(start, start + length, ctx.state.distance);
    },
    stuntLine(x, seed = 1) {
      const steps = planStuntLine(new Rng(seed), [ctx.state.speed], ctx.state.zoneIndex, nextLine--);
      let result = steps.next();
      while (!result.done) result = steps.next();
      const pieces = result.value.pieces;
      const dx = x - pieces[0]!.x;
      const first = ctx.state.entities.length;
      const ids = pieces.map((p) => {
        const e: Entity = { ...p, data: p.data && { ...p.data }, id: nextId++, x: p.x + dx, done: false };
        ctx.state.entities.push(e);
        return e.id;
      });
      linkArcs(ctx.state.entities, first);
      return ids;
    },
    pattern(name, x = PLAYER_X, seed = 1) {
      const { state } = ctx;
      const planned = name === CROWD_TEMPLATE ? crowdNow(seed, state.speed, state.kidMode) : planPattern(new Rng(seed), 3, [state.speed], { zone: state.zoneIndex, template: name, kidMode: state.kidMode });
      if (planned?.name !== name) throw new Error(`pattern ${name}: nothing fair at ${state.speed} px/s`);
      const entities = state.entities;
      for (let i = entities.length - 1; i >= 0; i--) if (entities[i]!.x + entities[i]!.w > x) entities.splice(i, 1);
      const start = state.distance + (x - PLAYER_X);
      reserve(start, start + planned.length, state.distance);
      const first = entities.length;
      const ids = planned.pieces.map((p) => {
        const e: Entity = { ...p, data: p.data && { ...p.data }, id: nextId++, x: x + p.x, done: false };
        // People and the e-scooter: anchored on the screen like the spawner does it, moved where their motion has carried them.
        const motion = motionOf(e);
        if (motion) withMotion(e, motion, e.x);
        entities.push(e);
        return e.id;
      });
      linkArcs(entities, first);
      return ids;
    },
    stunts() {
      return stunts.view();
    },
    park(offset = VIEW_MAX_W + 16 - PLAYER_X, seed = 1) {
      const { state } = ctx;
      const steps = planParkLine(new Rng(seed), [state.speed], nextLine--);
      let result = steps.next();
      while (!result.done) result = steps.next();
      const line = result.value;
      const start = state.distance + offset;
      const plan: ParkPlan = { start, end: start + line.length, pieces: parkPiecesOf(line, start) };
      const from = PLAYER_X + offset;
      const to = from + line.length;
      const entities = state.entities;
      for (let i = entities.length - 1; i >= 0; i--) {
        const e = entities[i]!;
        if ((e.x < to && e.x + e.w > from) || e.data?.park !== undefined || e.kind === 'highFiver') entities.splice(i, 1);
      }
      const first = entities.length;
      for (const p of line.pieces) entities.push({ ...p, data: p.data && { ...p.data }, id: nextId++, x: from + p.x, done: false });
      linkArcs(entities, first);
      reserve(plan.start, plan.end, state.distance);
      state.park = plan;
      return plan;
    },
    parkPlan() {
      return ctx.state.park;
    },
    clear() {
      ctx.state.entities.splice(0);
    },
    patterns() {
      return laid().map((p) => ({ ...p }));
    },
    startAt(distance) {
      const { state } = ctx;
      if (state.mode !== 'playing' || state.time > 0) throw new Error('startAt: only before the first tick of a run');
      state.distance = distance;
    },
    drops() {
      return dropped.items.map(({ item, x, y, w, h, lying }) => ({ item, x, y, w, h, lying }));
    },
  };
}
