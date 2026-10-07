/**
 * Distance-based spawner: lays patterns back to back along the street (gap
 * from the difficulty ramp) and turns each one into entities as soon as its
 * start comes within SPAWN_MARGIN of the right edge, so nothing pops in on
 * any view width while the layout itself stays the same for every width.
 * People are themed by the zone the pattern lies in (`zoneAt`), and every so
 * often a joint pattern comes; the patterns the chill effect can reach after
 * it are also verified with the chill jump at chill speed.
 */
import { MAX_SPEED, PLAYER_X } from '../core/config';
import { CHILL_DURATION } from '../core/chill';
import type { Rng } from '../core/rng';
import type { Entity } from '../types';
import { CHILL_SPEED_SCALE } from './chill';
import { gapAt, speedAt, tierAt } from './difficulty';
import { motionOf, withMotion } from './motion';
import { jointPattern, type Pattern, planPattern } from './patterns';

/** Street distance from the player to the first pattern (a few empty seconds). */
const FIRST_START = 380;
/** A pattern is materialised once its start is this close to the right edge. */
const SPAWN_MARGIN = 16;
/** The speed range checked for a pattern spans this much street after its start. */
const SPEED_SPAN = 500;

/** Street distance before the first joint can come: over 30 s even at the start speed ramp. */
export const JOINT_FIRST_DISTANCE = 3000;
/** Street distance between joints: at least 45 s even at MAX_SPEED (more while chilled)... */
export const JOINT_SPACING = 7500;
/** ...plus up to this much at random (also for the first one). */
const JOINT_JITTER = 2400;
/** Street the chill effect can last after the pickup (it runs CHILL_DURATION, never faster than MAX_SPEED). */
export const CHILL_REACH = Math.ceil(CHILL_DURATION * MAX_SPEED);

export class Spawner {
  private rng: Rng | null = null;
  /** Screen x of the next pattern's start. */
  private nextStart = 0;
  private nextId = 1;
  /** Street distance from which the next joint pattern is laid. */
  private nextJoint = 0;
  /** Patterns starting before this street distance may be ridden while chilled. */
  private chillUntil = -Infinity;

  /** `zoneAt(street)`: the background zone at a street distance (themes the people). */
  constructor(private readonly zoneAt: (street: number) => number = () => 0) {}

  reset(rng: Rng): void {
    this.rng = rng;
    this.nextStart = PLAYER_X + FIRST_START;
    this.nextId = 1;
    this.nextJoint = JOINT_FIRST_DISTANCE + rng.int(0, JOINT_JITTER);
    this.chillUntil = -Infinity;
  }

  /** The street moved left by dx (call together with moving the entities). */
  scroll(dx: number): void {
    this.nextStart -= dx;
  }

  /**
   * Appends the entities of every pattern that is due. `distance` is the
   * distance matching the current entity positions (after this tick's scroll).
   */
  spawn(entities: Entity[], distance: number, viewWidth: number, speedOverride: number | null): void {
    const rng = this.rng;
    if (!rng) return;
    while (this.nextStart <= viewWidth + SPAWN_MARGIN) {
      const street = distance + this.nextStart - PLAYER_X;
      const speeds = speedOverride !== null ? [speedOverride] : [speedAt(street), speedAt(street + SPEED_SPAN)];
      const pattern = this.plan(rng, street, speeds, speedOverride !== null);
      for (const piece of pattern.pieces) {
        const e: Entity = { ...piece, id: this.nextId++, x: this.nextStart + piece.x, done: false };
        const motion = motionOf(e);
        if (motion) withMotion(e, motion, e.x);
        entities.push(e);
      }
      this.nextStart += pattern.length + gapAt(street);
    }
  }

  private plan(rng: Rng, street: number, speeds: number[], pinned: boolean): Pattern {
    if (street >= this.nextJoint) {
      const pattern = jointPattern(Math.max(...speeds));
      this.nextJoint = street + JOINT_SPACING + rng.int(0, JOINT_JITTER);
      this.chillUntil = street + pattern.length + CHILL_REACH;
      return pattern;
    }
    const options = { zone: this.zoneAt(street), chillSpeeds: undefined as number[] | undefined };
    if (street < this.chillUntil) {
      // A pinned speed stays pinned while chilled; otherwise from the slowest chill speed through the ramp back up.
      const low = Math.min(...speeds) * CHILL_SPEED_SCALE;
      const high = Math.max(...speeds);
      options.chillSpeeds = pinned ? speeds : [low, (low + high) / 2, high];
    }
    return planPattern(rng, tierAt(street), speeds, options);
  }
}
