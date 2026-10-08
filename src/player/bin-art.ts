/**
 * The Mülltonne the skater dives into on a bin crash: gameplay's bin (same
 * colours and lids, see gameplay/art.ts) with the lid flipped open down its
 * back, square so the tumble can turn it in quarter steps.
 */
import { rowsFromString } from '../core/sprite-data';

/** Frame size (square, so the rotated frames match). */
export const BIN_SIZE = 15;
/** Column of the bin body's centre (the open lid hangs to the left of it). */
export const BIN_ANCHOR_X = 9;

/** Bin colours as in gameplay/art.ts (outline, body, highlight, shade, wheel). */
const BIN_COLORS = { k: '#1a1418', m: '#6d7680', M: '#929ca5', n: '#4a525a', x: '#2a2d31' } as const;
/** Lid colours in gameplay's `data.variant` order: Restmüll (anthracite), Papier (blue), Bio (brown). */
const LIDS = [
  { L: '#5a6068', l: '#3d4249' },
  { L: '#4a8fd8', l: '#2c62a8' },
  { L: '#9a6438', l: '#6c4322' },
] as const;

/** One palette per lid colour (index = lid). */
export const BIN_PALETTES = LIDS.map((lid) => ({ ...BIN_COLORS, ...lid }));

/** Upright, open (the skater's legs come out of the top), lid hanging down the back. */
const UPRIGHT = rowsFromString(`
  kkkkkkkkkkkkkkk
  kLlkmMmmmmmmmnk
  kLlkmMmmmmmmmnk
  kLlkmMkkkkkkmnk
  kLlkmMkmmmmkmnk
  kLlkmMkmmmmkmnk
  kLlkmMkkkkkkmnk
  kLlkmMmmmmmmmnk
  kLlkmMmmmmmmmnk
  kkkkmMmmmmmmmnk
  ...kmMmmmmmmmnk
  ...knnnnnnnnnnk
  ...kkkkkkkkkkkk
  ....kk.....kxxk
  ...........kkk.
`);

/** Turns square pixel art a quarter to the left (counter-clockwise): the top goes left. */
export function turnLeft(rows: readonly string[]): string[] {
  const n = rows.length;
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => rows[c]![n - 1 - r]!).join(''));
}

/** Rotation frames: upright, then each a quarter turn further to the left (rolling away left). */
export const BIN_FRAMES: string[][] = [UPRIGHT];
for (let i = 1; i < 4; i++) BIN_FRAMES.push(turnLeft(BIN_FRAMES[i - 1]!));
