/**
 * Score, combo and multiplier rules. A trick (clean clear, rail landing)
 * extends the combo; the multiplier equals the combo (1..MAX_MULTIPLIER).
 * Touching the ground or crashing breaks the combo.
 */
import type { GameBus, GameState } from '../types';
import { MAX_MULTIPLIER } from './catalogue';

function multiplierFor(combo: number): number {
  return Math.min(MAX_MULTIPLIER, Math.max(1, combo));
}

/** Adds `base` times the current multiplier; returns the points awarded. */
export function addPoints(state: GameState, bus: GameBus, base: number): number {
  const delta = base * state.multiplier;
  if (delta === 0) return 0;
  state.score += delta;
  bus.emit('scoreChanged', { score: state.score, delta, combo: state.combo, multiplier: state.multiplier });
  return delta;
}

/** Adds `points` as they are (no multiplier: stunt lines have their own); returns them. */
export function addBonus(state: GameState, bus: GameBus, points: number): number {
  if (points === 0) return 0;
  state.score += points;
  bus.emit('scoreChanged', { score: state.score, delta: points, combo: state.combo, multiplier: state.multiplier });
  return points;
}

/** Counts a trick in the chain, then scores `base` with the new multiplier. */
export function addTrick(state: GameState, bus: GameBus, base: number): number {
  state.combo += 1;
  state.multiplier = multiplierFor(state.combo);
  return addPoints(state, bus, base);
}

export function breakCombo(state: GameState): void {
  state.combo = 0;
  state.multiplier = 1;
}
