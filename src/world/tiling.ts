/**
 * Screen x positions (integers) at which to draw a horizontally repeating tile
 * of width `period` so that it covers 0..viewWidth when scrolled by `scroll`.
 */
export function tileStarts(scroll: number, period: number, viewWidth: number): number[] {
  const offset = ((Math.floor(scroll) % period) + period) % period;
  const starts: number[] = [];
  for (let x = -offset; x < viewWidth; x += period) starts.push(x);
  return starts;
}
