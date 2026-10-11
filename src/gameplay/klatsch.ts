/**
 * The "klatsch" of the NorDIY high five (ROADMAP 49): a small comic burst
 * where the hands meet. It starts KLATSCH_DELAY after the high five, when the
 * skater's arm (player/high-five.ts) reaches the slap, and lasts
 * KLATSCH_TICKS (0.25 s). high-five.ts keeps its point on the high fiver
 * (data.klatschDx, data.klatschY: halfway between his slapping hand and the
 * skater's open palm) and which way he slaps (data.slapRight: towards a
 * skater who already passed him), so the burst moves with the street; the
 * gameplay fx layer draws it from data.slapped and the frame, with no state
 * of its own. Same in kid mode.
 */
import { TICK_RATE } from '../core/config';
import { HIGH_FIVE_RAISE, type HighFiveSide, highFiveSide } from '../player/high-five';
import type { Entity } from '../types';
import { drawHighFiverArm } from './park-art';
import { sprite } from './sprites';

/** His slapping hand from the high fiver's top-left corner (the slap pose in park-art.ts, facing left). */
export const FIVER_HAND = { dx: 1, dy: 4 } as const;
/**
 * The middle of the skater's open palm at the slap, from the wheel contact
 * point (player.x, player.y), per side the arm reaches (ride pose; mirrors
 * player/high-five-art.ts, pinned by klatsch.test.ts).
 */
export const SKATER_PALM: Record<HighFiveSide, { dx: number; dy: number }> = {
  ahead: { dx: 8, dy: -32 },
  over: { dx: 3, dy: -37 },
  behind: { dx: -8, dy: -35 },
};
/** Ticks from the high five until the skater's palm reaches the slap. */
export const KLATSCH_DELAY = Math.round(HIGH_FIVE_RAISE * TICK_RATE);

interface SkaterAt {
  x: number;
  y: number;
}

const KLATSCH = sprite({ o: '#ff8a2a', y: '#ffd23f', W: '#fffbe8' }, [
  [
    '.....o.....',
    '..o..y..o..',
    '...oyWyo...',
    '...yWWWy...',
    '.oyWWWWWyo.',
    'oyWWWWWWWyo',
    '.oyWWWWWyo.',
    '...yWWWy...',
    '...oyWyo...',
    '..o..y..o..',
    '.....o.....',
  ],
  [
    '.....y.....',
    '.y...o...y.',
    '...o...o...',
    '...........',
    '..o.....o..',
    'yo.......oy',
    '..o.....o..',
    '...........',
    '...o...o...',
    '.y...o...y.',
    '.....y.....',
  ],
  [
    'W....o....W',
    '...........',
    '...........',
    '...........',
    '...........',
    'o.........o',
    '...........',
    '...........',
    '...........',
    '...........',
    'W....o....W',
  ],
]);

export const KLATSCH_FRAMES = KLATSCH.frameCount;
const KLATSCH_FRAME_TICKS = 5;
/** How long the burst shows after the slap (0.25 s). */
export const KLATSCH_TICKS = KLATSCH_FRAMES * KLATSCH_FRAME_TICKS;

/** The burst's frame for a slap at frame `slapped` (or undefined: none yet) at `frame`, or null when it does not show. */
export function klatschFrame(slapped: number | undefined, frame: number): number | null {
  if (slapped === undefined) return null;
  const age = frame - slapped - KLATSCH_DELAY;
  return age >= 0 && age < KLATSCH_TICKS ? Math.floor(age / KLATSCH_FRAME_TICKS) : null;
}

/** Which way the skater's arm reaches for this high fiver (as player/high-five.ts picks it). */
function sideOf(fiver: Entity, skater: SkaterAt): HighFiveSide {
  return highFiveSide(fiver.x + fiver.w / 2 - skater.x);
}

/** He slaps to the right (mirrored) when the skater has already passed him. */
export function slapsRight(fiver: Entity, skater: SkaterAt): boolean {
  return sideOf(fiver, skater) === 'behind';
}

/** His slapping hand on screen, facing left or (mirrored) right. */
export function fiverHand(fiver: Entity, right: boolean): { x: number; y: number } {
  const dx = right ? fiver.w - 1 - FIVER_HAND.dx : FIVER_HAND.dx;
  return { x: fiver.x + dx, y: fiver.y + FIVER_HAND.dy };
}

/** The high fiver as he will be at the contact, KLATSCH_DELAY ticks on: carried left by the street at `speed` px/s. */
export function atContact(fiver: Entity, speed: number): Entity {
  return speed === 0 ? fiver : { ...fiver, x: fiver.x - (speed * KLATSCH_DELAY) / TICK_RATE };
}

/**
 * Where the hands meet for a high five (pass the fiver atContact): halfway between the high
 * fiver's slapping hand and the skater's open palm, as an integer x offset
 * from the fiver's x (it moves with him) and an integer screen y.
 */
export function klatschPoint(fiver: Entity, skater: SkaterAt): { dx: number; y: number } {
  const hand = fiverHand(fiver, slapsRight(fiver, skater));
  const palm = SKATER_PALM[sideOf(fiver, skater)];
  const x = (hand.x + skater.x + palm.dx) / 2;
  const y = (hand.y + skater.y + palm.dy) / 2;
  return { dx: Math.round(x - fiver.x), y: Math.round(y) };
}

/**
 * Draws, over the skater, the arm of every high fiver still slapping or
 * fist-pumping (so the contact and his reaction show) and the burst of every
 * high five in its KLATSCH_TICKS; `lead` (the scroll lead) left like the fiver.
 */
export function drawHighFiveFx(g: CanvasRenderingContext2D, entities: readonly Entity[], frame: number, lead: number): void {
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;
    if (e.kind !== 'highFiver') continue;
    const { slapped, klatschDx, klatschY } = e.data ?? {};
    if (typeof slapped !== 'number') continue;
    const x = Math.round(e.x - lead);
    drawHighFiverArm(g, e, x, frame);
    const f = klatschFrame(slapped, frame);
    if (f === null || typeof klatschDx !== 'number' || typeof klatschY !== 'number') continue;
    const half = (KLATSCH.width - 1) / 2;
    KLATSCH.draw(g, f, x + klatschDx - half, klatschY - half);
  }
}
