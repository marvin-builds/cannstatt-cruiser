/**
 * The NorDIY high five (ROADMAP 36): a `highFiver` stands at the street edge
 * of the park with a hand up. Where a use press (E / the item button) goes
 * depends on his hand's distance ahead of the skater (highFiveWindow):
 *
 * - `reach` (within HIGH_FIVE_REACH, either side, on the ground or in the
 *   air): the press is his. The first gives a high five (`highFive`, a
 *   bonus, `data.slapped` = the frame for the slap pose in park-art.ts).
 * - `approach` (further ahead, up to HIGH_FIVE_APPROACH): a slightly early
 *   press is his too. It is buffered (`data.queued`) and gives the high five
 *   on the first tick he is in reach.
 * - `none`: the press goes on to the carried item.
 *
 * A press his never uses the carried item (use.ts asks highFive first). The
 * ui imports the window (ui/high-five.ts) instead of duplicating it.
 */
import type { Entity, GameContext } from '../types';
import { addBonus } from './scoring';

/** Half the high five window: px between the high fiver's middle and the skater (generous: ~0.25 s at top speed either side). */
export const HIGH_FIVE_REACH = 24;
/** A use press while his hand is at most this far ahead (beyond the reach) is buffered for the high five. */
export const HIGH_FIVE_APPROACH = 48;
/** Points for a high five (as they are, no multiplier). */
export const HIGH_FIVE_POINTS = 100;

export type HighFiveWindow = 'reach' | 'approach' | 'none';

/** Signed px of a high fiver's hand (his middle) ahead of the skater at `playerX`. */
export function highFiverAhead(e: Entity, playerX: number): number {
  return e.x + e.w / 2 - playerX;
}

/** Where a use press goes with a high fiver's hand `ahead` px in front of the skater (negative: behind). */
export function highFiveWindow(ahead: number): HighFiveWindow {
  if (Math.abs(ahead) <= HIGH_FIVE_REACH) return 'reach';
  return ahead > 0 && ahead <= HIGH_FIVE_APPROACH ? 'approach' : 'none';
}

/** The first high fiver whose window (reach or approach) holds the skater, or null. */
function highFiverNear(ctx: GameContext): { fiver: Entity; window: HighFiveWindow } | null {
  const { entities, player } = ctx.state;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;
    if (e.kind !== 'highFiver') continue;
    const window = highFiveWindow(highFiverAhead(e, player.x));
    if (window !== 'none') return { fiver: e, window };
  }
  return null;
}

/**
 * Every playing tick, with whether use was pressed: gives a buffered or
 * pressed high five once the high fiver is in reach and returns true when
 * the press was his (it must not use the carried item).
 */
export function highFive(ctx: GameContext, pressed: boolean): boolean {
  const near = highFiverNear(ctx);
  if (!near) return false;
  const { fiver, window } = near;
  const given = typeof fiver.data?.slapped === 'number';
  if (window === 'approach') {
    if (pressed && !given) fiver.data = { ...fiver.data, queued: true };
    return pressed;
  }
  if (!given && (pressed || fiver.data?.queued === true)) {
    fiver.data = { ...fiver.data, slapped: ctx.state.frame };
    const points = addBonus(ctx.state, ctx.bus, HIGH_FIVE_POINTS);
    ctx.bus.emit('highFive', { entityId: fiver.id, points });
  }
  return pressed;
}
