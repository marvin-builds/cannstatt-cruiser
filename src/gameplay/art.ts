/**
 * Palette sprites and drawing for obstacles, rails, stars and the pickup
 * sparkle. Every sprite has a dark outline so it reads against the busy
 * Stuttgart backgrounds. Sizes match catalogue.ts.
 */
import { GROUND_Y } from '../core/config';
import { type Sprite, sprite } from '../core/sprite';
import type { Entity, ObstacleKind } from '../types';
import { drawOverhead, isOverheadArt, overheadSize } from './overhead-art';

const K = '#1a1418';

const BIN_ART = `
  .kkkkkkkkkk.
  kLLLLLLLLLLk
  kllllllllllk
  kkkkkkkkkkkk
  kgGgggggggdk
  kgGgggggggdk
  kgGkkkkkkgdk
  kgGkgggggkdk
  kgGkgggggkdk
  kgGkkkkkkgdk
  kgGgggggggdk
  kgGgggggggdk
  kgGgggggggdk
  kgGgggggggdk
  kddddddddddk
  kkkkkkkkkkkk
  .kk.....kwwk
  ........kkk.
`;

/** Lid colours: Restmüll (anthracite), Papier (blue), Bio (brown). */
const BIN_LIDS = [
  { L: '#5a6068', l: '#3d4249' },
  { L: '#4a8fd8', l: '#2c62a8' },
  { L: '#9a6438', l: '#6c4322' },
];

const BINS = BIN_LIDS.map((lid) =>
  sprite({ k: K, ...lid, g: '#6d7680', G: '#929ca5', d: '#4a525a', w: '#2a2d31' }, [BIN_ART]),
);

const BARRIER = sprite({ k: K, y: '#ffcf3a', r: '#d8342c', w: '#f4f1ea', f: '#2c2c30' }, [
  `
  ...kkk...
  ...kyk...
  ..kkkkk..
  ..krrwk..
  ..krwwk..
  ..kwwrk..
  ..kwrrk..
  ..krrwk..
  ..krwwk..
  ..kwwrk..
  ..kwrrk..
  ..krrwk..
  ..krwwk..
  ..kwwrk..
  ..kwrrk..
  ..krrwk..
  ..kkkkk..
  ...kfk...
  .kkkfkkk.
  kfffffffk
  kkkkkkkkk
  `,
]);

const BENCH = sprite({ k: K, b: '#b8763a', B: '#d9995a', i: '#3a3d44' }, [
  `
  kkkkkkkkkkkkkkkkkkkkkkkk
  kBBBBBBBBBBBBBBBBBBBBBBk
  kbbbbbbbbbbbbbbbbbbbbbbk
  kkkkkkkkkkkkkkkkkkkkkkkk
  .kik................kik.
  kkkkkkkkkkkkkkkkkkkkkkkk
  kBBBBBBBBBBBBBBBBBBBBBBk
  kbbbbbbbbbbbbbbbbbbbbbbk
  kkkkkkkkkkkkkkkkkkkkkkkk
  .kik................kik.
  .kik................kik.
  kkikk..............kkikk
  `,
]);

const PLANTER = sprite({ k: K, G: '#5fae4a', g: '#3b7d34', f: '#e6588a', c: '#b4afa4', C: '#d2cec5', d: '#8a857b' }, [
  `
  .....kkkk.kkk.....
  ...kkGGfGkkGGGk...
  ..kGGgGGGGgGfGGk..
  .kGgGfGgGGgGGGgGk.
  .kgGgggGgggGggfgk.
  kkkkkkkkkkkkkkkkkk
  kCCCCCCCCCCCCCCCCk
  kcccccccccccccccdk
  kkkkkkkkkkkkkkkkkk
  .kcccccccccccccdk.
  .kcCcccccccccccdk.
  .kcCcccccccccccdk.
  .kcCcccccccccccdk.
  .kcCcccccccccccdk.
  .kcccccccccccccdk.
  .kdddddddddddddddk
  .kkkkkkkkkkkkkkkk.
  `,
]);

const CURB_GAP = sprite({ k: K, s: '#c9c3b6', S: '#e4dfd4', h: '#2b2622', d: '#453d36', o: '#ff8a1e' }, [
  `
  kkkk............kkkk
  kSSk............kSSk
  ksskkkkkkkkkkkkkkssk
  ksskhhhhhhhhhhhhkssk
  .kkhhhdhhhhhhdhhhkk.
  ..khhhhhdhhhhhhhhk..
  ..kkhhhhhhhhhhhhkk..
  ....kkkkkkkkkkkk....
  `,
]);

const OBSTACLE_SPRITES: Record<Exclude<ObstacleKind, 'bin' | 'banner' | 'stopSign'>, Sprite> = {
  barrier: BARRIER,
  bench: BENCH,
  planter: PLANTER,
  curbGap: CURB_GAP,
};

/** Rails are tiled from 1-px-wide bar slices, posts and feet. */
const HANDRAIL = {
  bar: sprite({ k: K, L: '#e3e7ec', m: '#8d96a2' }, [['k', 'L', 'm', 'k']]),
  post: sprite({ k: K, m: '#6c7480', L: '#a9b1bb' }, [['kLmk']]),
  foot: sprite({ k: K, m: '#6c7480' }, [['.kkkk.', 'kmmmmk']]),
};

const PIPE = {
  bar: sprite({ k: K, Y: '#ffd25a', y: '#e0a526', d: '#a26a12' }, [['k', 'Y', 'y', 'd', 'k']]),
  post: sprite({ k: K, m: '#4d535c' }, [['kmk']]),
  foot: sprite({ k: K, m: '#4d535c' }, [['kmmmk']]),
};

const STAR_ART = [
  '....k....',
  '...kyk...',
  'kkkkyWkkk',
  'kyyyWWyyk',
  '.kyyWyyk.',
  '..kyyyk..',
  '.kyykyyk.',
  '.kykkkyk.',
  '.kk...kk.',
];
/** Twinkle: the highlight moves to a second pixel on alternate frames. */
const STAR = sprite({ k: '#5a3a00', y: '#ffc928', W: '#fff6c2' }, [
  STAR_ART,
  STAR_ART.map((row, i) => (i === 4 ? '.kyWWWyk.' : row)),
]);

const SPARKLE = sprite({ w: '#fff6c2', y: '#ffd23f' }, [
  ['..w..', '..y..', 'wy.yw', '..y..', '..w..'],
  ['w...w', '.y.y.', '.....', '.y.y.', 'w...w'],
  ['.....', '.y.y.', '.....', '.y.y.', '.....'],
]);
const SPARKLE_FRAMES = SPARKLE.frameCount;
const SPARKLE_FRAME_TICKS = 4;
export const SPARKLE_TICKS = SPARKLE_FRAMES * SPARKLE_FRAME_TICKS;

/** Distance between rail posts. */
const POST_SPACING = 28;

function drawRail(g: CanvasRenderingContext2D, e: Entity): void {
  const parts = e.kind === 'pipe' ? PIPE : HANDRAIL;
  const x = Math.round(e.x);
  const top = Math.round(e.y);
  const barH = parts.bar.height;
  const postW = parts.post.width;
  const footW = parts.foot.width;
  const postXs: number[] = [];
  for (let px = 4; px < e.w - postW - 3; px += POST_SPACING) postXs.push(x + px);
  postXs.push(x + e.w - postW - 4);
  for (const px of postXs) {
    for (let py = top + barH - 1; py < GROUND_Y - parts.foot.height; py++) parts.post.draw(g, 0, px, py);
    parts.foot.draw(g, 0, px - Math.floor((footW - postW) / 2), GROUND_Y - parts.foot.height);
  }
  for (let px = 0; px < e.w; px++) parts.bar.draw(g, 0, x + px, top - 1);
}

/** Draws one entity at integer coordinates; `frame` drives the star spin. */
export function drawEntity(g: CanvasRenderingContext2D, e: Entity, frame: number): void {
  const x = Math.round(e.x);
  const y = Math.round(e.y);
  switch (e.kind) {
    case 'handrail':
    case 'pipe':
      drawRail(g, e);
      return;
    case 'star':
      STAR.draw(g, Math.floor((frame + e.id * 7) / 12), x, y + (Math.floor((frame + e.id * 5) / 20) % 2));
      return;
    case 'bin':
      BINS[Number(e.data?.variant ?? 0) % BINS.length]!.draw(g, 0, x, y);
      return;
    case 'banner':
    case 'stopSign':
      drawOverhead(g, { ...e, kind: e.kind });
      return;
    default:
      OBSTACLE_SPRITES[e.kind].draw(g, 0, x, y);
  }
}

/** Pickup sparkle centred on (cx, cy), `age` ticks old. */
export function drawSparkle(g: CanvasRenderingContext2D, cx: number, cy: number, age: number): void {
  SPARKLE.draw(g, Math.floor(age / SPARKLE_FRAME_TICKS), Math.round(cx) - 2, Math.round(cy) - 2);
}

/** Art sizes must match the catalogue (checked by art.test.ts). */
export function artSize(kind: ObstacleKind): { w: number; h: number } {
  if (isOverheadArt(kind)) return overheadSize(kind);
  const s = kind === 'bin' ? BINS[0]! : OBSTACLE_SPRITES[kind];
  return { w: s.width, h: s.height };
}

export function starSize(): { w: number; h: number } {
  return { w: STAR.width, h: STAR.height };
}
