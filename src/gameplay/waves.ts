/**
 * Waves (ROADMAP 52 Phase 2, point 6): from tier 2 on, now and then a burst
 * of 3-4 easy single ground obstacles in a steady rhythm, then a breather.
 * Rhythm and endurance, not order: the pieces stand the same street apart
 * (start to start), so the take-offs come at an even beat; every gap is an
 * open one (land, then jump again) and patterns.ts plans the wave like every
 * template (solver with the real arcs at the pattern's speeds, the unchanged
 * human take-off window, across the boundary, rerolled when not fair). After
 * the last piece BREATHER_SECONDS of easy street follow (patterns.ts
 * `breather`: only an optional star arc in it), which the spawner's quiet
 * cap keeps, since the stars are something to react to. Kid mode: 3 pieces.
 * Tier 2, so never while chilled (spawner.ts CHILLED_TIER) or drunk
 * (fairness.ts DRUNK_TEMPLATES).
 */
import type { Rng } from '../core/rng';
import type { ObstacleKind } from '../types';
import { OBSTACLES } from './catalogue';
import type { Piece } from './course';

/** Pieces per wave (adults; kid mode always the lower count). */
export const WAVE_PIECES: [number, number] = [3, 4];
/** Easy single ground obstacles a wave is made of: low, no people, nothing overhead. */
export const WAVE_KINDS: ObstacleKind[] = ['curbGap', 'planter', 'bin', 'bench'];
/** Seconds of easy street after a wave's last piece (at the pattern's fastest speed). */
export const BREATHER_SECONDS = 2;
/**
 * Landing gap between two pieces of a wave, in seconds of riding: open
 * (>= 0.72 s, patterns.ts OPEN_GAP_SECONDS) with room to spare, so every
 * piece keeps the full window. The beat (start to start) adds the widest piece.
 */
const GAP_SECONDS: [number, number] = [0.78, 0.95];
const WIDEST = Math.max(...WAVE_KINDS.map((k) => OBSTACLES[k].w));

/** What a wave needs from patterns.ts's Builder. */
export interface WaveBuilder {
  readonly rng: Rng;
  readonly lead: number;
  readonly kidMode: boolean;
  /** Street ridden in `seconds` at the pattern's fastest speed. */
  seconds(seconds: number): number;
  obstacle(kind: ObstacleKind, x: number): Piece;
}

/** Lays a wave from the lead: 3-4 pieces (3 in kid mode), one beat apart. */
export function buildWave(b: WaveBuilder): void {
  const count = b.kidMode ? WAVE_PIECES[0] : b.rng.int(...WAVE_PIECES);
  const beat = b.seconds(b.rng.range(...GAP_SECONDS)) + WIDEST;
  for (let i = 0; i < count; i++) b.obstacle(b.rng.pick(WAVE_KINDS), b.lead + i * beat);
}
