/**
 * Test tooling for the touch duck limit (ROADMAP 66): rides a seed with the
 * real gameplay system (live spawner with its planning budget, zones,
 * effects, stunt lines, the park), nobody steering and never crashing, and
 * measures every duck group (duck-span.ts) on the street as laid, across
 * pattern boundaries, at the speed the skater actually rides it. DOM-free;
 * not used by the game itself.
 */
import { TICK_DT } from '../core/config';
import { Game } from '../core/game';
import type { Piece } from './course';
import { duckGroups, oneGoSeconds } from './duck-span';
import { isObstacle, isOverhead } from './catalogue';
import { createGameplaySystem } from './index';

export interface DuckRide {
  seed: number;
  /** Duck groups on the street. */
  groups: number;
  /** The longest one go (seconds, incl. the duck transition) and the street x it starts at. */
  longest: { seconds: number; street: number; signs: number };
  /** The most signs in one group. */
  mostSigns: number;
}

/** Street around a sign that can share a duck group with it (more than DUCK_REPEAT_SECONDS at TOP_SPEED). */
const NEAR = 600;

export function rideDucks(seed: number, seconds: number): DuckRide {
  const pieces: Piece[] = [];
  const game = new Game({
    systems: [
      createGameplaySystem({
        onPattern: (pattern, street) => {
          for (const p of pattern.pieces) if (isObstacle(p.kind)) pieces.push({ ...p, x: street + p.x });
        },
      }),
    ],
  });
  game.seed(seed);
  game.commands.startRun();
  game.state.player.invulnerableTimer = Infinity;
  /** The speed ridden per street distance (one sample per tick). */
  const ridden: { distance: number; speed: number }[] = [];
  for (let t = 0; t < seconds / TICK_DT; t++) {
    game.tick();
    ridden.push({ distance: game.state.distance, speed: game.state.speed });
  }
  const end = game.state.distance;
  const speedAt = (x: number) => ridden.find((r) => r.distance >= x)?.speed ?? game.state.speed;
  const ride: DuckRide = { seed, groups: 0, longest: { seconds: 0, street: 0, signs: 0 }, mostSigns: 0 };
  const signs = pieces.filter((p) => isOverhead(p.kind) && p.x < end).sort((a, b) => a.x - b.x);
  const seen = new Set<number>();
  for (const sign of signs) {
    const speed = speedAt(sign.x);
    const near = pieces.filter((p) => Math.abs(p.x - sign.x) <= NEAR);
    const group = duckGroups(near, speed).find((g) => g.from <= sign.x && sign.x <= g.to);
    if (!group || seen.has(Math.round(group.from))) continue;
    seen.add(Math.round(group.from));
    ride.groups++;
    const go = oneGoSeconds(group, speed);
    if (go > ride.longest.seconds) ride.longest = { seconds: go, street: Math.round(group.from), signs: group.signs };
    ride.mostSigns = Math.max(ride.mostSigns, group.signs);
  }
  return ride;
}
