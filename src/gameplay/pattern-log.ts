/**
 * What the spawner laid (ROADMAP 52 6a): each pattern as it comes onto the
 * street, by name, with the street distance of its start and its number of
 * elements (obstacles, people, overhead signs, rails; stars are none). Kept
 * for the test tooling (variety.ts) and the debug hook (debug.ts patterns()).
 */
import { isObstacle, isRail } from './catalogue';
import type { Pattern } from './patterns';

export interface LaidPattern {
  name: string;
  /** Street distance of the pattern's start. */
  street: number;
  /** Obstacles (people and overhead signs too) and rails in it. */
  elements: number;
}

export function laid(pattern: Pattern, street: number): LaidPattern {
  return { name: pattern.name, street: Math.round(street), elements: pattern.pieces.filter((p) => isObstacle(p.kind) || isRail(p.kind)).length };
}

/** The last `max` patterns laid, oldest first. */
export class PatternLog {
  private readonly laid: LaidPattern[] = [];

  constructor(private readonly max: number) {}

  add(pattern: Pattern, street: number): void {
    this.laid.push(laid(pattern, street));
    if (this.laid.length > this.max) this.laid.shift();
  }

  clear(): void {
    this.laid.length = 0;
  }

  /** A copy, oldest first. */
  list(): LaidPattern[] {
    return this.laid.map((p) => ({ ...p }));
  }
}
