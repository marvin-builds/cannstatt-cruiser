/**
 * The Mombachquelle's outlet into the Neckar (mid layer, far bank), in side
 * view after the real place: at the foot of a green embankment (dense trees
 * and bushes) a basin of light grey boulders, about one person's height
 * across, juts into the river. Left of it a stair climbs the embankment, and
 * left of that a flat area just above the water has a bench. Above the
 * basin a second bench stands on a terrace; the spring water leaves a
 * culvert below it and splashes into the basin. Upper right a bin hangs on a
 * tree. A few people chill there: on both benches and one with the feet in
 * the basin. No sign or name anywhere. Small, soft mid-palette people (no
 * outlines), so it reads as scenery, never as an obstacle. Six pre-rendered
 * frames: the splashing water, a kicking foot, a wave.
 */
import { MID } from '../palette';
import { animatedProp, noise, type Painter, type Prop } from './paint';
import { WATER_Y } from './layout';

/** Muted people colours for the mid layer (no outlines). */
const PEOPLE = {
  skin: '#d9b496',
  skinShade: '#c49c7e',
  hairDark: '#6a5444',
  hairLight: '#c9a66b',
  red: '#c8705e',
  blue: '#6f8fb6',
  yellow: '#dcc06a',
  green: '#7f9f74',
  jeans: '#5f7390',
  dark: '#6b6670',
} as const;

const SCENE = {
  boulder: '#cfcfca',
  boulderLight: '#e4e4df',
  boulderShade: '#a9a9a3',
  boulderDark: '#8f8f8a',
  /** Seams between boulders, so the ring reads as stones (not cloud) at 1x. */
  boulderSeam: '#6d6d68',
  spring: '#9fd0d8',
  concrete: '#b9b5ac',
  concreteShade: '#a29e95',
  culvert: '#4e5862',
  leafDeep: '#55774e',
  leafLight: '#9dbb83',
  trunk: '#7d6650',
  trunkShade: '#66523f',
  benchLeg: '#6f6b66',
  bin: '#5f8068',
  binShade: '#4b6853',
  rail: '#8c939a',
} as const;

const W = 160;
/** View rows: the prop's top, and its bottom (the basin's ripples on the river). */
const TOP = 66;
const BOTTOM = WATER_Y + 10;
const H = BOTTOM - TOP;
/** Local y of view y. */
const ly = (y: number) => y - TOP;

// Layout (local x, view y).
/** Flat area just above the river, left of the stair. */
const FLAT_X = 10;
const FLAT_W = 44;
const FLAT_Y = WATER_Y - 3;
/** Stair foot (left) to its top on the terrace (right). */
const STAIR_X = FLAT_X + FLAT_W - 2;
const STEPS = 9;
const STEP_W = 3;
/** Terrace over the basin, with the culvert's headwall in front. */
const TERRACE_X = STAIR_X + STEPS * STEP_W;
const TERRACE_W = 34;
const TERRACE_Y = FLAT_Y - STEPS * 2;
/** Basin: outer boulder ring and centre. */
const BASIN_X = TERRACE_X + 1;
const BASIN_W = 32;
/** Boulders per half ring, 5 px apart. */
const RING = 6;
const BASIN_CX = BASIN_X + BASIN_W / 2;
/** Culvert mouth (the water's exit), below the upper bench. */
const CULVERT_X = BASIN_CX - 3;
const CULVERT_Y = TERRACE_Y + 7;
/** The tree with the hanging bin, upper right of the basin. */
const TREE_X = TERRACE_X + TERRACE_W + 6;
/** Benches: left x, seat row (view). */
const LOW_BENCH_X = FLAT_X + 10;
const UP_BENCH_X = TERRACE_X + 8;
const BENCH_W = 16;

/** A leafy clump: dark base, lighter crown, a highlight and speckles. */
function clump(p: Painter, cx: number, cy: number, r: number, salt: number): void {
  p.disc(SCENE.leafDeep, cx, cy + 1, r);
  p.disc(MID.greenDark, cx, cy, r - 1);
  p.disc(MID.green, cx - 1, cy - 1, Math.max(1, r - 3));
  p.disc(SCENE.leafLight, cx - Math.round(r * 0.4), cy - Math.round(r * 0.45), Math.max(1, Math.round(r * 0.3)));
  for (let i = 0; i < r * 3; i++) {
    const a = i * 2.39996;
    const d = (r - 1) * Math.sqrt((i + 1) / (r * 3));
    const x = cx + Math.round(Math.cos(a) * d);
    const y = cy + Math.round(Math.sin(a) * d);
    p.px(noise(i, salt, 61) < 0.5 ? MID.greenShade : SCENE.leafDeep, x, y);
  }
}

/** The embankment: grass from its top line down to the river, with trees behind and bushes on it. */
function paintEmbankment(p: Painter): void {
  const water = ly(WATER_Y);
  p.profile(MID.greenShade, 0, W, water, (col) => {
    const edge = Math.min(col, W - 1 - col);
    return ly(Math.max(98, 121 - edge * 0.9));
  });
  for (let x = 0; x < W; x++) {
    for (let y = ly(98); y < water; y++) if (noise(x, y, 63) < 0.12) p.px(MID.greenDark, x, y);
  }
  // Trunks, then dense crowns behind the slope.
  for (const x of [22, 50, 118, 146]) p.rect(SCENE.trunkShade, x, ly(88), 2, ly(104) - ly(88));
  const crowns: readonly (readonly [number, number, number])[] = [
    [10, 100, 8], [20, 90, 11], [34, 80, 10], [50, 86, 12], [66, 76, 11], [78, 88, 9],
    [92, 78, 12], [112, 84, 9], [128, 76, 11], [140, 88, 11], [150, 99, 8],
    [28, 96, 8], [60, 94, 8], [98, 94, 7], [134, 98, 8],
  ];
  crowns.forEach(([x, y, r], i) => clump(p, x, ly(y), r, i));
  // Bushes down the slope on both sides of the stair and basin.
  const bushes: readonly (readonly [number, number, number])[] = [
    [8, 114, 6], [18, 110, 7], [32, 108, 7], [46, 110, 6],
    [122, 108, 8], [138, 110, 8], [151, 114, 6], [128, 120, 6], [143, 121, 7], [154, 122, 4],
  ];
  bushes.forEach(([x, y, r], i) => clump(p, x, ly(y), r, i + 20));
}

/** Gravel flat just above the water, with a stone edge. */
function paintFlat(p: Painter): void {
  const top = ly(FLAT_Y);
  p.rect(MID.stair, FLAT_X, top, FLAT_W, 1);
  p.rect(MID.stone, FLAT_X, top + 1, FLAT_W, ly(WATER_Y) - top - 1);
  p.rect(MID.stoneShade, FLAT_X, ly(WATER_Y) - 1, FLAT_W, 1);
  for (let x = FLAT_X + 3; x < FLAT_X + FLAT_W; x += 7) p.px(MID.stoneShade, x, top + 1);
}

/** Stone stair up the embankment from the flat (left) to the terrace (right), with a handrail. */
function paintStair(p: Painter): void {
  for (let k = 0; k < STEPS; k++) {
    const x = STAIR_X + k * STEP_W;
    const tread = ly(FLAT_Y) - 2 * k;
    p.rect(MID.stone, x, tread, STEP_W, ly(WATER_Y) - tread);
    p.rect(MID.stair, x, tread, STEP_W, 1);
    p.rect(SCENE.boulderDark, x, tread + 1, STEP_W, 1);
  }
  p.rect(MID.stoneShade, STAIR_X, ly(WATER_Y) - 1, STEPS * STEP_W, 1);
  const x0 = STAIR_X + 1;
  const x1 = TERRACE_X;
  p.line(SCENE.rail, x0, ly(FLAT_Y) - 7, x1, ly(TERRACE_Y) - 7);
  for (let k = 1; k < STEPS; k += 3) {
    const x = STAIR_X + k * STEP_W + 1;
    const y = ly(FLAT_Y) - 2 * k;
    p.rect(SCENE.rail, x, y - 6, 1, 6);
  }
}

/** Terrace over the basin and the concrete headwall with the culvert. */
function paintTerrace(p: Painter): void {
  const top = ly(TERRACE_Y);
  p.rect(MID.stair, TERRACE_X, top, TERRACE_W, 1);
  p.rect(SCENE.concrete, TERRACE_X, top + 1, TERRACE_W, ly(WATER_Y) - top - 3);
  p.rect(SCENE.concreteShade, TERRACE_X, top + 1, TERRACE_W, 1);
  // Laid stone blocks: staggered courses with mortar joints and lit top edges.
  const bottom = ly(WATER_Y) - 3;
  for (let y = top + 2, row = 0; y < bottom; y += 4, row++) {
    p.rect(SCENE.concreteShade, TERRACE_X, y + 3, TERRACE_W, 1);
    for (let x = TERRACE_X + (row % 2 === 0 ? 0 : 4); x < TERRACE_X + TERRACE_W; x += 8) {
      p.rect(SCENE.concreteShade, x, y, 1, 3);
      p.rect(SCENE.boulderLight, x + 1, y, Math.min(5, TERRACE_X + TERRACE_W - x - 1), 1);
      if (noise(x, row, 67) < 0.4) p.rect(SCENE.boulder, x + 2, y + 1, 3, 2);
    }
  }
  p.rect(SCENE.boulderDark, TERRACE_X, bottom, TERRACE_W, 1);
  // Culvert: an arched dark mouth with a stone lip.
  const cy = ly(CULVERT_Y);
  p.rect(SCENE.concreteShade, CULVERT_X - 1, cy - 4, 8, 6);
  p.rect(SCENE.culvert, CULVERT_X, cy - 3, 6, 4);
  p.rect(SCENE.culvert, CULVERT_X + 1, cy - 4, 4, 1);
  p.rect(MID.stair, CULVERT_X - 1, cy + 1, 8, 1);
}

/** Wooden bench seen from the front: backrest, seat, legs. `seat` = view row of the seat. */
function bench(p: Painter, x: number, seat: number): void {
  const s = ly(seat);
  p.rect(MID.beam, x, s - 5, BENCH_W, 1);
  p.rect(MID.beam, x, s - 3, BENCH_W, 1);
  p.rect(SCENE.benchLeg, x + 1, s - 5, 1, 5);
  p.rect(SCENE.benchLeg, x + BENCH_W - 2, s - 5, 1, 5);
  p.rect(MID.ochreShade, x - 1, s, BENCH_W + 2, 1);
  p.rect(SCENE.benchLeg, x + 1, s + 1, 1, 3);
  p.rect(SCENE.benchLeg, x + BENCH_W - 2, s + 1, 1, 3);
}

/**
 * Person sitting (front view) with the seat at view row `seat`: head, torso,
 * knees and shins hanging down. `kick` swings one shin; `wave` raises an arm.
 */
function sitter(p: Painter, x: number, seat: number, hair: string, top: string, legs: string, kick = 0, wave = -1): void {
  const s = ly(seat);
  p.rect(hair, x + 1, s - 10, 3, 1);
  p.rect(PEOPLE.skin, x + 1, s - 9, 3, 2);
  p.px(hair, x + 1, s - 9);
  p.rect(top, x, s - 7, 5, 5);
  p.rect(PEOPLE.skin, x - 1, s - 5, 1, 3);
  if (wave >= 0) {
    p.px(PEOPLE.skin, x + 5, s - 7);
    p.px(PEOPLE.skin, x + 6, s - 8 - wave);
    p.px(PEOPLE.skin, x + 6, s - 9 - wave);
  } else {
    p.rect(PEOPLE.skin, x + 5, s - 5, 1, 3);
  }
  p.rect(legs, x, s - 2, 5, 2);
  p.rect(legs, x, s, 2, 2);
  p.rect(legs, x + 3, s, 2, 2);
  p.rect(PEOPLE.skinShade, x + kick, s + 2, 1, 2);
  p.rect(PEOPLE.skinShade, x + 4, s + 2, 1, 2);
}

/** Boulder shapes (lit from the upper left): l light, m mid, s shade, d dark, . clear. */
const BOULDERS: readonly (readonly string[])[] = [
  ['..lllm...', '.llmmmms.', 'lllmmmmss', 'lmmmmmsss', '.mmmsssd.', '..ssddd..'],
  ['.llmm..', 'llmmmms', 'lmmmmss', '.mmsssd', '..sdd..'],
];
const BOULDER_COLORS: Readonly<Record<string, string>> = {
  l: SCENE.boulderLight,
  m: SCENE.boulder,
  s: SCENE.boulderShade,
  d: SCENE.boulderDark,
};

/**
 * One boulder (shape `big` 9x6 or 7x5) with its bottom centre at (cx, bottom),
 * framed by a dark seam on its sides and bottom (painted over its neighbours).
 */
function boulder(p: Painter, cx: number, bottom: number, big: boolean): void {
  const rows = BOULDERS[big ? 0 : 1]!;
  const x0 = cx - (rows[0]!.length >> 1);
  const y0 = bottom - rows.length + 1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '.') continue;
      p.px(SCENE.boulderSeam, x0 + x - 1, y0 + y);
      p.px(SCENE.boulderSeam, x0 + x + 1, y0 + y);
      p.px(SCENE.boulderSeam, x0 + x, y0 + y + 1);
    }
  });
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = BOULDER_COLORS[row[x]!];
      if (c) p.px(c, x0 + x, y0 + y);
    }
  });
}

/** Back half of the boulder ring and the spring water inside it. */
function paintBasinBack(p: Painter, frame: number): void {
  const rim = ly(WATER_Y - 3);
  for (let i = 0; i < RING; i++) boulder(p, BASIN_X + 3 + i * 5, rim + 1 - (i % 2), i % 2 === 1);
  const water = ly(WATER_Y);
  p.ellipse(SCENE.spring, BASIN_CX, water, BASIN_W / 2 - 3, 2);
  p.rect(MID.waterLight, BASIN_X + 6, water - 1, BASIN_W - 12, 1);
  // Rings spreading from where the jet lands.
  const r = 1 + (frame % 3) * 2;
  p.rect(MID.waterGlint, CULVERT_X + 3 - r, water, 1, 1);
  p.rect(MID.waterGlint, CULVERT_X + 3 + r, water, 1, 1);
}

/** Front half of the boulder ring, sitting in the river, with ripples around it. */
function paintBasinFront(p: Painter, frame: number): void {
  const base = ly(WATER_Y + 3);
  for (let i = 0; i < RING; i++) {
    const u = (i + 0.5) / RING;
    const sag = Math.round(Math.sin(Math.PI * u) * 2);
    boulder(p, BASIN_X + 3 + i * 5, base + 2 + sag, i % 2 === 0);
  }
  const ripple = ly(BOTTOM) - 2;
  const spread = frame % 2;
  p.rect(MID.waterLight, BASIN_X - 2 - spread, ripple, BASIN_W + 4 + spread * 2, 1);
  p.rect(MID.waterGlint, BASIN_X + 4 + spread * 3, ripple, 3, 1);
  // Overflow trickling out of the ring into the Neckar.
  p.px((frame & 1) === 0 ? MID.waterGlint : MID.waterLight, BASIN_X + BASIN_W - 1, ly(WATER_Y + 1));
  p.px(MID.waterLight, BASIN_X + BASIN_W, ly(WATER_Y + 3) + (frame % 3));
}

/** The spring water leaving the culvert and splashing into the basin (frame-animated). */
function paintJet(p: Painter, frame: number): void {
  const from = ly(CULVERT_Y) + 1;
  const to = ly(WATER_Y) - 1;
  const x = CULVERT_X + 2;
  for (let y = from; y <= to; y++) {
    const glint = (y + frame) % 3 === 0;
    p.rect(glint ? MID.waterGlint : MID.waterLight, x + (y - from > 2 ? 1 : 0), y, 2, 1);
  }
  // Droplets hopping out of the splash.
  const hop = [0, 1, 2, 1, 0, 2][frame]!;
  p.px(MID.waterGlint, x - 2 - (frame % 2), to - hop);
  p.px(MID.waterGlint, x + 4 + ((frame + 1) % 2), to - ((hop + 1) % 3));
  p.px(MID.waterLight, x - 1, to - 1);
  p.px(MID.waterLight, x + 3, to - 1);
}

/** The tree upper right of the basin, with a bin hanging on its trunk. */
function paintBinTree(p: Painter): void {
  p.rect(SCENE.trunk, TREE_X, ly(84), 3, ly(WATER_Y - 2) - ly(84));
  p.rect(SCENE.trunkShade, TREE_X + 2, ly(84), 1, ly(WATER_Y - 2) - ly(84));
  clump(p, TREE_X + 1, ly(78), 10, 40);
  clump(p, TREE_X - 6, ly(84), 6, 41);
  // Bracket and bin.
  const top = ly(TERRACE_Y - 6);
  p.rect(SCENE.rail, TREE_X - 3, top, 3, 1);
  p.rect(SCENE.bin, TREE_X - 8, top, 6, 7);
  p.rect(SCENE.binShade, TREE_X - 8, top, 6, 1);
  p.rect(SCENE.binShade, TREE_X - 3, top + 1, 1, 6);
  p.rect(SCENE.binShade, TREE_X - 7, top + 3, 4, 1);
}

export const mombachquelle: Prop = animatedProp(W, H, BOTTOM, 6, 6, (p, frame) => {
  paintEmbankment(p);
  paintBinTree(p);
  paintFlat(p);
  paintTerrace(p);
  paintStair(p);
  // Upper bench above the basin: two people, one waving now and then.
  bench(p, UP_BENCH_X, TERRACE_Y - 2);
  sitter(p, UP_BENCH_X + 2, TERRACE_Y - 2, PEOPLE.hairDark, PEOPLE.blue, PEOPLE.jeans, 0, frame < 3 ? frame % 2 : -1);
  sitter(p, UP_BENCH_X + 9, TERRACE_Y - 2, PEOPLE.hairLight, PEOPLE.yellow, PEOPLE.dark);
  // Lower bench on the flat, one person resting.
  bench(p, LOW_BENCH_X, FLAT_Y - 2);
  sitter(p, LOW_BENCH_X + 6, FLAT_Y - 2, PEOPLE.hairDark, PEOPLE.red, PEOPLE.jeans);
  paintBasinBack(p, frame);
  paintJet(p, frame);
  // On the ring's left boulders, feet in the basin.
  sitter(p, BASIN_X + 3, WATER_Y - 4, PEOPLE.hairLight, PEOPLE.green, PEOPLE.jeans, [0, 1, 0, -1, 0, 1][frame]!);
  paintBasinFront(p, frame);
});
