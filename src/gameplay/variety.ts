/**
 * Variety of the street (ROADMAP 52 6a): which patterns a real run lays and
 * how many elements (obstacles, people, overhead signs, rails; stars are
 * none) each has. rideVariety rides a seed with the real gameplay system
 * (live spawner with its planning budget, zones, stunt lines, the park),
 * nobody steering and never crashing, and logs every pattern as it comes
 * onto the street; summarise turns a log into the numbers variety.test.ts
 * pins (elements per template pattern, distinct templates per ride).
 * DOM-free; not used by the game itself.
 */
import { TICK_DT } from '../core/config';
import { Game } from '../core/game';
import { createGameplaySystem } from './index';
import { laid, type LaidPattern } from './pattern-log';
import { TEMPLATE_NAMES } from './patterns';

/** Rides seed `seed` for `seconds` (see the module comment) and returns every pattern laid, in street order. */
export function rideVariety(seed: number, seconds: number): LaidPattern[] {
  const log: LaidPattern[] = [];
  const game = new Game({ systems: [createGameplaySystem({ onPattern: (p, street) => log.push(laid(p, street)) })] });
  game.seed(seed);
  game.commands.startRun();
  game.state.player.invulnerableTimer = Infinity;
  for (let t = 0; t < seconds / TICK_DT; t++) game.tick();
  return log;
}

export interface VarietySummary {
  /** Template patterns laid (stunt lines, the park, the joint and the star fallback left out). */
  patterns: number;
  /** Mean elements per template pattern. */
  elements: number;
  /** Distinct templates laid. */
  distinct: number;
}

export function summarise(log: readonly LaidPattern[]): VarietySummary {
  const templates = log.filter((p) => TEMPLATE_NAMES.includes(p.name));
  const total = templates.reduce((sum, p) => sum + p.elements, 0);
  return { patterns: templates.length, elements: templates.length ? total / templates.length : 0, distinct: new Set(templates.map((p) => p.name)).size };
}
