/**
 * The NorDIY high five (ROADMAP 36): a `highFiver` stands at the street edge
 * of the park with a hand up. While his middle is within HIGH_FIVE_REACH of
 * the skater (either side, on the ground or in the air) the use press (E /
 * the item button) is his: the first gives a high five (`highFive`, a bonus,
 * `data.slapped` = the frame for the slap pose in park-art.ts), every press
 * in the window never uses the carried item (use.ts asks highFive first).
 */
import type { Entity, GameContext } from '../types';
import { addBonus } from './scoring';

/** Half the high five window: px between the high fiver's middle and the skater (generous: ~0.25 s at top speed either side). */
export const HIGH_FIVE_REACH = 24;
/** Points for a high five (as they are, no multiplier). */
export const HIGH_FIVE_POINTS = 100;

/** The high fiver within reach of the skater, or null. */
export function highFiverInReach(ctx: GameContext): Entity | null {
  const { entities, player } = ctx.state;
  for (let i = 0; i < entities.length; i++) {
    const e = entities[i]!;
    if (e.kind === 'highFiver' && Math.abs(e.x + e.w / 2 - player.x) <= HIGH_FIVE_REACH) return e;
  }
  return null;
}

/**
 * On a use press: when a high fiver is within reach, the press is his (the
 * first one gives the high five) and this returns true; otherwise false and
 * the press goes on to the carried item.
 */
export function highFive(ctx: GameContext): boolean {
  const fiver = highFiverInReach(ctx);
  if (!fiver) return false;
  if (typeof fiver.data?.slapped === 'number') return true;
  fiver.data = { ...fiver.data, slapped: ctx.state.frame };
  const points = addBonus(ctx.state, ctx.bus, HIGH_FIVE_POINTS);
  ctx.bus.emit('highFive', { entityId: fiver.id, points });
  return true;
}
