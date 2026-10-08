/**
 * Test-only tooling (enabled together with window.__game): lets playtest
 * scenarios put a specific obstacle, person, the joint or stunt pieces on the
 * street, see the dropped items (they are no entities, so window.__game
 * misses them) and the running stunt line.
 * See scripts/scenarios/ducking.ts, chill.ts, people.ts, drop.ts and stunts.ts.
 */
import { Rng } from '../core/rng';
import type { CarriedItem, Entity, GameContext, ObstacleKind, Rect, StuntKind } from '../types';
import { jointRect, kickerRect, ledgeRect, OBSTACLES, obstacleRect } from './catalogue';
import type { DroppedItems } from './drop';
import { withMotion } from './motion';
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
  /**
   * Places a whole designed stunt line (stunt-line.ts) for the current speed
   * and zone with its first kicker at screen x; returns the entity ids
   * (stars included). `seed` picks the design.
   */
  stuntLine(x: number, seed?: number): number[];
  /** The running stunt line (steps, made, multiplier, points), or null; read-only. */
  stunts(): StuntLineView | null;
  /** Removes every entity (spawning goes on as planned). */
  clear(): void;
  /** Snapshot of the items knocked out of people's hands (drop.ts), falling or lying; read-only. */
  drops(): DroppedItemView[];
}

declare global {
  interface Window {
    __gameplay?: GameplayDebugHook;
  }
}

let nextId = 800_000;

const mid = ([a, b]: [number, number]) => (a + b) / 2;

/** Ids of debug-placed stunt lines (negative, apart from the spawner's street-based ids). */
let nextLine = -1;

export function installGameplayDebug(ctx: GameContext, dropped: DroppedItems, stunts: StuntLines): void {
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
    stuntLine(x, seed = 1) {
      const steps = planStuntLine(new Rng(seed), [ctx.state.speed], ctx.state.zoneIndex, nextLine--);
      let result = steps.next();
      while (!result.done) result = steps.next();
      const pieces = result.value.pieces;
      const dx = x - pieces[0]!.x;
      return pieces.map((p) => {
        const e: Entity = { ...p, data: p.data && { ...p.data }, id: nextId++, x: p.x + dx, done: false };
        ctx.state.entities.push(e);
        return e.id;
      });
    },
    stunts() {
      return stunts.view();
    },
    clear() {
      ctx.state.entities.splice(0);
    },
    drops() {
      return dropped.items.map(({ item, x, y, w, h, lying }) => ({ item, x, y, w, h, lying }));
    },
  };
}
