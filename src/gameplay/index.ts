/**
 * PLACEHOLDER owned by the gameplay slice: obstacles, rails, collisions,
 * score, combo, stars, health, spawner and difficulty go here.
 */
import type { System } from '../types';

export function createGameplaySystem(): System {
  return { name: 'gameplay' };
}
