/**
 * Palette sprites and drawing for obstacles, rails, stars, the joint and the
 * pickup sparkle (people live in people-art.ts). Every sprite has a dark
 * outline so it reads against the busy Stuttgart backgrounds. Sizes match
 * catalogue.ts.
 */
import { GROUND_Y } from '../core/config';
import type { Sprite } from '../core/sprite';
import { scratchContext, sprite, warmSprites } from './sprites';
import type { Entity, GameState, ObstacleKind } from '../types';
import { ITEM_SPRITES } from './item-art';
import { ComposedCache } from './composed';
import { drawOverhead, isOverheadArt, overheadSize, warmOverheads } from './overhead-art';
import { drawPerson, personSize } from './people-art';

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

type SpriteKind = Exclude<ObstacleKind, 'bin' | 'banner' | 'stopSign' | 'vfbFan' | 'wasenGuest'>;

const OBSTACLE_SPRITES: Record<SpriteKind, Sprite> = {
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

/** The joint: filter tip, paper, glowing tip and a curl of smoke (two frames). */
const JOINT_ART = [
  '.........g.',
  '........g..',
  '.........g.',
  '..kkkkkkkk.',
  'kkWWWWWWWRk',
  'kcWWWLWWWok',
  '.kkkkkkkkk.',
];
const JOINT = sprite({ k: K, c: '#d8a86a', W: '#f4f1ea', L: '#5f9a4a', R: '#ff5a2a', o: '#ffb03a', g: '#c8ccd4' }, [
  JOINT_ART,
  JOINT_ART.map((row, i) => (i < 3 ? ['........g..', '.........g.', '........g..'][i]! : row)),
]);

/**
 * Kid mode's stand-in for the joint: a pink bubble gum in a twisted wrapper,
 * same size, with a shine that moves on the second frame.
 */
const GUM_ART = [
  '..kkkkkkk..',
  'kkkpWWppkkk',
  'klkpWpppklk',
  '.kkpppppkk.',
  'klkppppdklk',
  'kkkppdddkkk',
  '..kkkkkkk..',
];
const GUM = sprite({ k: '#7a2350', p: '#ff7eb6', W: '#ffe0ef', d: '#d9508f', l: '#ffc2dc' }, [
  GUM_ART,
  GUM_ART.map((row, i) => (i === 1 ? 'kkkppWWpkkk' : i === 2 ? 'klkppWppklk' : row)),
]);

export interface ChillPickupArt {
  name: 'joint' | 'gum';
  sprite: Sprite;
}

/** The chill pickup's look: the joint for adults, a bubble gum in kid mode (state.kidMode). */
export function chillPickupArt(kidMode: boolean): ChillPickupArt {
  return kidMode ? { name: 'gum', sprite: GUM } : { name: 'joint', sprite: JOINT };
}

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

/** A rail's art from its bar (one row above its top) down to the ground, composed once per kind, length and height. */
const RAILS = new ComposedCache<Entity>(8, (g, e) => paintRail(g, e, 1, GROUND_Y - Math.round(e.y) + 1));

function drawRail(g: CanvasRenderingContext2D, e: Entity, x: number): void {
  const top = Math.round(e.y);
  const w = Math.round(e.w);
  const key = ((e.kind === 'pipe' ? 1 : 0) * 4096 + w) * 256 + top;
  g.drawImage(RAILS.get(key, w, GROUND_Y - top + 1, e), x, top - 1);
}

/** Bar slices, posts and feet with the rail top at `top` and the ground at `ground` (canvas y). */
function paintRail(g: CanvasRenderingContext2D, e: Entity, top: number, ground: number): void {
  const parts = e.kind === 'pipe' ? PIPE : HANDRAIL;
  const w = Math.round(e.w);
  const postW = parts.post.width;
  // Posts every POST_SPACING, plus one at the rear end.
  for (let px = 4; px < w - postW - 3; px += POST_SPACING) drawPost(g, parts, px, top, ground);
  drawPost(g, parts, w - postW - 4, top, ground);
  for (let px = 0; px < w; px++) parts.bar.draw(g, 0, px, top - 1);
}

function drawPost(g: CanvasRenderingContext2D, parts: typeof HANDRAIL | typeof PIPE, px: number, top: number, ground: number): void {
  const footTop = ground - parts.foot.height;
  for (let py = top + parts.bar.height - 1; py < footTop; py++) parts.post.draw(g, 0, px, py);
  parts.foot.draw(g, 0, px - Math.floor((parts.foot.width - parts.post.width) / 2), footTop);
}

/** What the art reads from the game state: `frame` drives the star spin, `time` the stomp reaction, `kidMode` pickup and props. */
export type ArtState = Pick<GameState, 'frame' | 'time' | 'kidMode'>;

/**
 * Draws one entity at integer coordinates, `lead` (RenderContext.scrollLead)
 * left of its tick position, so it moves evenly with the street.
 */
export function drawEntity(g: CanvasRenderingContext2D, e: Entity, state: ArtState, lead = 0): void {
  const { frame, kidMode } = state;
  const x = Math.round(e.x - lead);
  const y = Math.round(e.y);
  switch (e.kind) {
    case 'handrail':
    case 'pipe':
      drawRail(g, e, x);
      return;
    case 'star':
      STAR.draw(g, Math.floor((frame + e.id * 7) / 12), x, y + (Math.floor((frame + e.id * 5) / 20) % 2));
      return;
    case 'bin':
      BINS[Number(e.data?.variant ?? 0) % BINS.length]!.draw(g, 0, x, y);
      return;
    case 'banner':
    case 'stopSign':
      drawOverhead(g, e, e.kind, lead);
      return;
    case 'vfbFan':
    case 'wasenGuest':
      drawPerson(g, e, state.time, kidMode, lead);
      return;
    case 'ball':
      // The thrown football (types.ts): the same art as the carried and tossed one.
      ITEM_SPRITES.football.draw(g, 0, x, y);
      return;
    case 'joint':
      // Bobs gently like the stars; the smoke curls (or the gum shines) every 16 ticks.
      chillPickupArt(kidMode).sprite.draw(g, Math.floor(frame / 16), x, y + (Math.floor((frame + e.id * 5) / 24) % 2));
      return;
    default:
      OBSTACLE_SPRITES[e.kind].draw(g, 0, x, y);
  }
}

/** Pickup sparkle centred on (cx, cy) (screen x minus the scroll lead), `age` ticks old. */
export function drawSparkle(g: CanvasRenderingContext2D, cx: number, cy: number, age: number): void {
  SPARKLE.draw(g, Math.floor(age / SPARKLE_FRAME_TICKS), Math.round(cx) - 2, Math.round(cy) - 2);
}

/** Art sizes must match the catalogue (checked by art.test.ts). */
export function artSize(kind: ObstacleKind): { w: number; h: number } {
  if (isOverheadArt(kind)) return overheadSize(kind);
  if (kind === 'vfbFan' || kind === 'wasenGuest') return personSize(kind);
  const s = kind === 'bin' ? BINS[0]! : OBSTACLE_SPRITES[kind];
  return { w: s.width, h: s.height };
}

export function starSize(): { w: number; h: number } {
  return { w: STAR.width, h: STAR.height };
}

export function jointSize(): { w: number; h: number } {
  return { w: JOINT.width, h: JOINT.height };
}

/**
 * Rasterises all gameplay art now (call once at startup): every sprite frame
 * and the composed overhead signs, so nothing is built on its first draw
 * mid-run. Rails are composed when they come (their sizes vary).
 */
export function warmArt(): void {
  const g = scratchContext();
  if (!g) return;
  warmSprites(g);
  warmOverheads(g);
}
