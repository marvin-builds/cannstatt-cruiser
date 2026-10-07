/**
 * Distance-based spawner: lays patterns back to back along the street (gap
 * from the difficulty ramp) and turns each one into entities as soon as its
 * start comes within SPAWN_MARGIN of the right edge, so nothing pops in on
 * any view width while the layout itself stays the same for every width.
 */
import { PLAYER_X } from '../core/config';
import type { Rng } from '../core/rng';
import type { Entity } from '../types';
import { gapAt, speedAt, tierAt } from './difficulty';
import { planPattern } from './patterns';

/** Street distance from the player to the first pattern (a few empty seconds). */
const FIRST_START = 380;
/** A pattern is materialised once its start is this close to the right edge. */
const SPAWN_MARGIN = 16;
/** The speed range checked for a pattern spans this much street after its start. */
const SPEED_SPAN = 500;

export class Spawner {
  private rng: Rng | null = null;
  /** Screen x of the next pattern's start. */
  private nextStart = 0;
  private nextId = 1;

  reset(rng: Rng): void {
    this.rng = rng;
    this.nextStart = PLAYER_X + FIRST_START;
    this.nextId = 1;
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
      const pattern = planPattern(rng, tierAt(street), speeds);
      for (const piece of pattern.pieces) {
        entities.push({ ...piece, id: this.nextId++, x: this.nextStart + piece.x, done: false });
      }
      this.nextStart += pattern.length + gapAt(street);
    }
  }
}
