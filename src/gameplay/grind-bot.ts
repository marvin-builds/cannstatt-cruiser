/**
 * Test tooling (Vitest and the grind-points playtest): a bot that only
 * grinds. For every rail or bench it knows a jump from the street (how far
 * ahead the target's left edge is at the press, and how long the action is
 * held) that lands on it, found by trying jumps in a quiet game (player +
 * gameplay, nothing else on the street) at the pinned speed. It never jumps
 * for anything else, so it scores nothing but its grinds. DOM-free; not used
 * by the game itself.
 */
import { PLAYER_X } from '../core/config';
import { tick } from '../player/testing';
import type { Entity, GameState, Rect } from '../types';
import { place, quietGame, record } from './test-kit';

/** A jump from the street onto a grindable. */
export interface GrindJump {
  /** The target's left edge is this many px ahead of PLAYER_X on the press tick. */
  lead: number;
  /** Ticks the action stays down. */
  hold: number;
  /** Ticks the grind lasted in the trial. */
  ticks: number;
}

const HOLDS = [1, 3, 6, 10, 14, 20] as const;
const MAX_LEAD = 160;
/** Ticks a trial rides: up, along the longest rail and off it. */
const TRIAL_TICKS = 240;

/** Grind ticks of one trial: `kind` with rect `size` placed `lead` px ahead, pressed at once for `hold` ticks. */
function trial(kind: Entity['kind'], size: Rect, speed: number, lead: number, hold: number): number {
  const game = quietGame(speed);
  const target = place(game, kind, { ...size, x: PLAYER_X + lead });
  const ends = record(game, 'grindEnd');
  const crashes = record(game, 'crash');
  game.buttons.action.press('bot');
  for (let i = 0; i < TRIAL_TICKS && ends.length === 0 && crashes.length === 0; i++) {
    if (i === hold) game.buttons.action.release('bot');
    tick(game);
  }
  const end = ends.find((e) => e.entityId === target.id);
  return crashes.length === 0 && end ? end.ticks : 0;
}

/** The jump that grinds `kind` (rect `size`; its x is ignored) longest at `speed`, or null if none lands on it. */
export function bestGrindJump(kind: Entity['kind'], size: Rect, speed: number): GrindJump | null {
  let best: GrindJump | null = null;
  for (const hold of HOLDS) {
    let landed = false;
    for (let lead = 0; lead <= MAX_LEAD; lead += 2) {
      const ticks = trial(kind, size, speed, lead, hold);
      if (ticks > (best?.ticks ?? 0)) best = { lead, hold, ticks };
      // Past the leads that land on it: further ahead only jumps short of it.
      if (ticks > 0) landed = true;
      else if (landed) break;
    }
  }
  return best;
}

/** Presses for the planned grinds only; same protocol as SolverBot (apply 'press' / 'release' before each tick). */
export class GrindBot {
  private holding = 0;
  private readonly jumped = new Set<number>();

  /** `jumps`: entity id -> the jump onto it (bestGrindJump). */
  constructor(private readonly jumps: ReadonlyMap<number, GrindJump>) {}

  next(state: GameState): 'press' | 'release' | null {
    if (this.holding > 0) return --this.holding === 0 ? 'release' : null;
    if (!state.player.grounded) return null;
    for (let i = 0; i < state.entities.length; i++) {
      const e = state.entities[i]!;
      const jump = this.jumps.get(e.id);
      if (!jump || this.jumped.has(e.id) || e.x - PLAYER_X > jump.lead) continue;
      this.jumped.add(e.id);
      this.holding = jump.hold;
      return 'press';
    }
    return null;
  }
}
