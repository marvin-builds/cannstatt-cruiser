/**
 * Star points (ROADMAP 65). Every star scores STAR_POINTS times the current
 * multiplier (scoring.ts addPoints: no trick, so it neither starts nor
 * breaks a combo). Stars are laid in arcs: the stars of one jump arc, of a
 * combo's guide line, or of one stretch of a stunt line or the park between
 * two street contacts (one per kicker). Patterns name their arcs with
 * `asArc` (a key unique within the pattern); the spawner turns those keys
 * into run-wide ids with `linkArcs` (entity data `arc` = the id of the arc's
 * first star, `arcSize` = its star count). Taking every star of an arc in
 * one flight (no street landing in between) adds STAR_ARC_BONUS times the
 * multiplier once. Gameplay emits starCollected, then the star's
 * scoreChanged, then the bonus's scoreChanged right after it (the ui's
 * popup feed reads them in that order: "Stern! +10", "Sternenbogen! +50").
 */
import type { Entity, GameContext } from '../types';
import type { Piece } from './course';
import { addPoints } from './scoring';

export const STAR_POINTS = 10;
export const STAR_ARC_BONUS = 50;
/** Fewest stars an arc needs for its bonus (a lone star is no arc). */
export const MIN_ARC_STARS = 2;

/** The `stars` as one arc named `key` within their pattern (copies; the pieces given stay as they are). */
export function asArc(stars: readonly Piece[], key: string): Piece[] {
  return stars.map((s) => ({ ...s, data: { ...s.data, arc: key } }));
}

/**
 * Links the arc keys of the pattern just laid (`entities` from index `from`
 * on) to run-wide ids: the id of each arc's first star, plus the arc's size.
 */
export function linkArcs(entities: Entity[], from: number): void {
  const arcs = new Map<unknown, { id: number; size: number }>();
  for (let i = from; i < entities.length; i++) {
    const key = entities[i]!.data?.arc;
    if (key === undefined) continue;
    const arc = arcs.get(key);
    if (arc) arc.size++;
    else arcs.set(key, { id: entities[i]!.id, size: 1 });
  }
  for (let i = from; i < entities.length; i++) {
    const e = entities[i]!;
    const arc = e.data?.arc === undefined ? undefined : arcs.get(e.data.arc);
    if (arc) e.data = { ...e.data, arc: arc.id, arcSize: arc.size };
  }
}

/** Scores collected stars and follows the arc in progress (one per flight). */
export class StarArcs {
  private arc: number | null = null;
  private got = 0;

  /** The skater took `star`: its points, and the arc bonus when it was the arc's last one. */
  collect(ctx: GameContext, star: Entity): void {
    const { state, bus } = ctx;
    addPoints(state, bus, STAR_POINTS);
    const arc = star.data?.arc;
    const size = star.data?.arcSize;
    if (typeof arc !== 'number' || typeof size !== 'number' || size < MIN_ARC_STARS) return;
    if (arc !== this.arc) {
      this.arc = arc;
      this.got = 0;
    }
    if (++this.got < size) return;
    this.arc = null;
    addPoints(state, bus, STAR_ARC_BONUS);
  }

  /** Wheels on the street: the flight is over, an arc in progress stays incomplete. */
  landed(): void {
    this.arc = null;
  }

  reset(): void {
    this.arc = null;
    this.got = 0;
  }
}
