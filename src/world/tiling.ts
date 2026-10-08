/**
 * Screen x (an integer, -period < x <= 0) of the first copy of a horizontally
 * repeating tile `period` wide, scrolled by `scroll`. Draw copies at x, x +
 * period, ... while x < viewWidth (a plain loop: no list per frame).
 */
export function firstTileX(scroll: number, period: number): number {
  return -(((Math.floor(scroll) % period) + period) % period);
}
