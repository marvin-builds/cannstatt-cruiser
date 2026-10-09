/**
 * The use button (input.use, E or the ui's item button): uses the carried
 * item once per press and clears state.carriedItem. A Maßkrug is drunk
 * (state.drunkTimer = DRUNK_DURATION; core then delays action / duck input,
 * core/drunk.ts), a Brezel or Lebkuchenherz is eaten (+1 health, or bonus
 * points at full health), the football is thrown (ball.ts). Kid mode never
 * yields a Maßkrug (items.ts); should one be carried anyway, it is eaten,
 * never drunk. A Maßkrug kept too long is drunk by itself (auto-drink.ts).
 * Next to (or just before) a NorDIY high fiver the press is his
 * (high-five.ts): it gives the high five and never uses the item.
 */
import type { CarriedItem, GameContext, ItemAction } from '../types';
import { highFive } from './high-five';
import { addPoints } from './scoring';

/** Seconds of being drunk after a Maßkrug. */
export const DRUNK_DURATION = 6;
/** Points for eating at full health (times the multiplier). */
export const EAT_BONUS_POINTS = 150;

export function actionOf(item: CarriedItem, kidMode: boolean): ItemAction {
  if (item === 'football') return 'throw';
  return item === 'beer' && !kidMode ? 'drink' : 'eat';
}

/** Counts the drunk effect down by one tick. */
export function countDownDrunk(ctx: GameContext, dt: number): void {
  ctx.state.drunkTimer = Math.max(0, ctx.state.drunkTimer - dt);
}

/**
 * On a use press (or `auto`: the auto drink, auto-drink.ts) with an item in
 * hand: uses it, unless the press went to a high fiver. `throwBall` launches the football and emits ballThrown.
 */
export function useCarriedItem(ctx: GameContext, throwBall: () => void, auto = false): void {
  const { state } = ctx;
  const press = ctx.input.use.pressed;
  const pressed = !highFive(ctx, press) && press;
  const item = state.carriedItem;
  if (!(pressed || auto) || !item) return;
  state.carriedItem = null;
  const action = actionOf(item, state.kidMode);
  ctx.bus.emit('itemUsed', { item, action });
  if (action === 'drink') {
    state.drunkTimer = DRUNK_DURATION;
    ctx.bus.emit('drunkStart', { duration: DRUNK_DURATION });
  } else if (action === 'eat') eat(ctx);
  else throwBall();
}

function eat(ctx: GameContext): void {
  const { state } = ctx;
  if (state.health >= state.maxHealth) {
    addPoints(state, ctx.bus, EAT_BONUS_POINTS);
    return;
  }
  state.health += 1;
  ctx.bus.emit('healthGained', { health: state.health });
}
