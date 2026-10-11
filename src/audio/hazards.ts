/**
 * Sounds of the moving local hazards (ROADMAP 52 Phase 2, point 7), read from
 * the entities on the street (no event needed): the e-scooter rider rings
 * and whirrs once just before he comes on screen (an early warning: he comes
 * in faster than the street), and a pigeon flock flaps once as it takes off
 * (gameplay/pigeons.ts sets `data.flushedAt`). Identifies the hazards with
 * gameplay/hazards.ts. Allocation-free per tick.
 */
import { isPigeons, isScooter } from '../gameplay/hazards';
import type { Entity } from '../types';
import type { Cue } from './backend';

/** The scooter is heard when its left edge is this far beyond the right screen edge. */
export const SCOOTER_WARN = 48;

export const HAZARD_CUES = ['scooter', 'pigeons'] as const satisfies readonly Cue[];
export type HazardCue = (typeof HAZARD_CUES)[number];

export class HazardSounds {
  private readonly heard = new Set<number>();
  private readonly cues: HazardCue[] = [];

  /** The cues to play this tick for `entities` on a view `viewWidth` wide (reused array: read it before the next call). */
  update(entities: readonly Entity[], viewWidth: number): readonly HazardCue[] {
    this.cues.length = 0;
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i]!;
      if (this.heard.has(e.id)) continue;
      if (isScooter(e) && !e.done && e.x <= viewWidth + SCOOTER_WARN) this.hear(e.id, 'scooter');
      else if (isPigeons(e) && typeof e.data?.flushedAt === 'number') this.hear(e.id, 'pigeons');
    }
    return this.cues;
  }

  reset(): void {
    this.heard.clear();
    this.cues.length = 0;
  }

  private hear(id: number, cue: HazardCue): void {
    this.heard.add(id);
    this.cues.push(cue);
  }
}
