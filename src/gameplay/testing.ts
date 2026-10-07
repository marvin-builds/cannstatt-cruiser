/**
 * Test tooling for gameplay (Vitest and the playtest bot): turn the live
 * entities into a solver course and play it with the solver's best jumps.
 * DOM-free; not used by the game itself.
 */
import { PLAYER_X } from '../core/config';
import type { Entity, GameState, ObstacleKind } from '../types';
import { hitBox, isObstacle, isRail } from './catalogue';
import { type Body, groundBody, railBody } from './jumpsim';
import { type Course, type Jump, Solver } from './solver';

/** Room after the last entity the plan may use for landing. */
const OPEN_END = 400;

function live(e: Entity): boolean {
  return !e.data?.debugRail;
}

/** The entities ahead of the player in course space (x = 0 at the player). */
export function courseAhead(state: GameState): Course {
  const shift = (r: { x: number; y: number; w: number; h: number }) => ({ ...r, x: r.x - PLAYER_X });
  const obstacles = state.entities
    .filter((e) => live(e) && isObstacle(e.kind) && !e.done)
    .map((e) => shift(hitBox({ ...e, kind: e.kind as ObstacleKind })));
  const rails = state.entities.filter((e) => live(e) && isRail(e.kind)).map(shift);
  const goal = Math.max(0, ...[...obstacles, ...rails].map((r) => r.x + r.w));
  return { obstacles, rails, goal, limit: goal + OPEN_END };
}

/** The player's support as a solver body (ground, or the rail being ground). */
function startBody(state: GameState): Body {
  const p = state.player;
  if (!p.grinding) return groundBody();
  const rail = state.entities.find((e) => isRail(e.kind) && e.y === p.y && e.x <= p.x && p.x <= e.x + e.w);
  return rail ? railBody(rail.y, rail.x + rail.w - PLAYER_X) : groundBody();
}

/** The solver's most forgiving next jump from the current support, or null. */
export function planJump(state: GameState): Jump | null {
  return new Solver(courseAhead(state), state.speed).bestJump(startBody(state));
}

/**
 * Plays like a careful human: whenever supported and idle, plans the next
 * jump and commits to it. Call `next(state)` once before every tick and apply
 * the returned button change.
 */
export class SolverBot {
  private wait = -1;
  private hold = 0;
  private holding = 0;

  next(state: GameState): 'press' | 'release' | null {
    if (this.holding > 0) {
      this.holding--;
      return this.holding === 0 ? 'release' : null;
    }
    const p = state.player;
    if (this.wait < 0) {
      if (!(p.grounded || p.grinding) || p.state === 'crash') return null;
      const jump = planJump(state);
      if (!jump) return null;
      this.wait = jump.tick;
      this.hold = jump.hold;
    }
    if (this.wait > 0) {
      this.wait--;
      return null;
    }
    this.wait = -1;
    this.holding = this.hold;
    return 'press';
  }
}
