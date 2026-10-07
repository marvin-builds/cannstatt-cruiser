/** Colour helpers for palettes that blend (sky gradients). Colours are `#rrggbb`. */

function channels(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** Linear blend from `a` (t = 0) to `b` (t = 1), per channel. */
export function mixColor(a: string, b: string, t: number): string {
  const ca = channels(a);
  const cb = channels(b);
  return `#${ca.map((v, i) => Math.round(v + (cb[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Colour of row `y` in a vertical gradient through `stops`, spread evenly over
 * `height` rows: each stop sits at the centre of its share, rows in between blend.
 */
export function gradientColor(stops: readonly string[], y: number, height: number): string {
  const pos = Math.min(stops.length - 1, Math.max(0, (y * stops.length) / height - 0.5));
  const i = Math.min(stops.length - 2, Math.floor(pos));
  return mixColor(stops[i]!, stops[i + 1]!, pos - i);
}
