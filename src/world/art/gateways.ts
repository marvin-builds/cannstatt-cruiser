/**
 * Gateways: the art that sits on each depth's seam between two zones, so a
 * zone change reads as riding into the next district. Indexed by the zone
 * being entered (the cycle is fixed: Mitte -> Neckar -> Cannstatt -> Mitte).
 */
import { GROUND_Y } from '../../core/config';
import { MID, NEAR } from '../palette';
import type { Gateway } from '../scene';
import { MID_TREE, treeCluster } from './city';
import { hillProp, housesHillProp } from './hills';
import { TRAIN_RAIL_Y } from './layout';
import { BANK_Y } from './neckar';
import { noise, type Painter, type Prop, staticProp } from './paint';
import { tree } from './street';

/** Props drawn together, back to front, each at its x offset. */
function group(width: number, parts: ReadonlyArray<readonly [Prop, number]>): Prop {
  return {
    width,
    draw: (g, x, time, seed) => {
      for (const [prop, dx] of parts) prop.draw(g, x + dx, time, seed);
    },
    warm: () => parts.forEach(([prop]) => prop.warm()),
  };
}

/** Grass column from `top` to `bottom` with a dark crest pixel and speckles. */
function grass(p: Painter, x: number, top: number, bottom: number, salt: number): void {
  p.rect(MID.green, x, top, 1, bottom - top);
  p.px(MID.greenDark, x, top);
  for (let y = top + 2; y < bottom; y++) if (noise(x, y, salt) < 0.14) p.px(MID.greenShade, x, y);
}

// ---------------------------------------------------------------- far ----
// A broad ridge high enough to hide the step between two zones' hill crests.

const FAR_W = 120;
const FAR_RISE = 60;

// ---------------------------------------------------------------- mid ----

/** Mitte -> Neckar: a city park mound whose right flank slopes down into the river. */
function riverStart(): Prop {
  const w = 80;
  const h = GROUND_Y - (BANK_Y - 12);
  const crest = 10;
  const mound = staticProp(w, h, GROUND_Y, (p) => {
    for (let x = 0; x < w; x++) {
      const top = x < 16 ? h - Math.round(((h - crest) * (x + 1)) / 16) : x < 56 ? crest : crest + Math.round(((h - crest) * (x - 55)) / 25);
      if (top >= h) continue;
      grass(p, x, top, h, 81);
      if (x >= 56) p.px(MID.stone, x, top);
    }
    for (let x = 18; x < 54; x++) if (x % 9 !== 0) p.px(MID.stair, x, crest + 6);
  });
  const bottom = GROUND_Y - h + crest + 1;
  return group(w, [
    [tree(10, 6, bottom, MID_TREE), 20],
    [mound, 0],
    [tree(8, 5, bottom + 2, MID_TREE), 6],
    [tree(7, 5, bottom + 1, MID_TREE), 38],
  ]);
}

/** Neckar -> Cannstatt: the river ends at a sandstone embankment (bridge ramp) with a balustrade. */
function embankment(): Prop {
  const w = 92;
  const h = 44;
  const crest = 6;
  const wall = staticProp(w, h, GROUND_Y, (p) => {
    for (let x = 0; x < w; x++) {
      if (x < 20) {
        const top = h - Math.round(((h - crest) * (x + 1)) / 20);
        grass(p, x, top, h, 82);
        p.px(MID.stone, x, top);
      } else if (x < 76) {
        p.rect(MID.green, x, crest, 1, 2);
        p.px(MID.greenDark, x, crest);
        for (let y = crest + 2; y < h; y++) {
          const course = Math.floor((y - crest - 2) / 4);
          const joint = (y - crest - 2) % 4 === 3 || (x + (course % 2) * 4) % 8 === 0;
          p.px(joint ? MID.sandShade : MID.sand, x, y);
        }
      } else {
        grass(p, x, crest + Math.round(((h - crest) * (x - 75)) / 16), h, 83);
      }
    }
    p.rect(MID.stone, 20, crest - 5, 56, 1);
    for (let x = 21; x < 76; x += 4) p.rect(MID.stone, x, crest - 4, 1, 4);
    p.rect(MID.stoneShade, 20, crest - 1, 56, 1);
  });
  const top = GROUND_Y - h + crest;
  return group(w, [
    [tree(9, 6, top, MID_TREE), 30],
    [tree(11, 7, top, MID_TREE), 52],
    [wall, 0],
  ]);
}

/** Cannstatt -> Mitte: the last Wasen market stalls before the city blocks. */
function wasenEdge(): Prop {
  const stall = (stripe: string) =>
    staticProp(18, 22, GROUND_Y, (p) => {
      p.rect(MID.stoneShade, 0, 6, 1, 16);
      p.rect(MID.stoneShade, 17, 6, 1, 16);
      p.rect(MID.plaster, 1, 14, 16, 8);
      p.rect(MID.plasterShade, 1, 14, 16, 1);
      for (let x = 2; x < 16; x += 2) p.px([MID.roof, MID.ochre, MID.green][x % 3]!, x, 13);
      p.gable(stripe, 0, 0, 18, 4);
      for (let x = 0; x < 18; x++) p.rect(Math.floor(x / 3) % 2 === 0 ? stripe : MID.white, x, 4, 1, x % 2 === 0 ? 4 : 3);
    });
  return group(80, [
    [stall(MID.roof), 0],
    [stall(MID.blue), 22],
    [treeCluster(), 46],
  ]);
}

// --------------------------------------------------------------- near ----

/** Mitte -> Neckar: the Stadtbahn track ends at a buffer stop, the river railing starts at a quay pillar. */
const quayGate = staticProp(22, 26, GROUND_Y, (p) => {
  const rail = TRAIN_RAIL_Y - (GROUND_Y - 26);
  p.rect(NEAR.iron, 1, rail - 8, 1, 8);
  p.rect(NEAR.iron, 6, rail - 8, 1, 8);
  p.rect(NEAR.flowerRed, 0, rail - 9, 9, 4);
  for (const x of [2, 5]) p.rect(NEAR.rail, x, rail - 9, 1, 4);
  pillar(p, 11, 11, 26);
  p.disc(NEAR.stone, 16, 1, 1);
});

/** Neckar -> Cannstatt: a Kurpark gate pillar with a flower urn. */
const parkGate = staticProp(12, 30, GROUND_Y, (p) => {
  pillar(p, 1, 10, 30);
  p.rect(NEAR.stoneShade, 3, 3, 6, 2);
  p.rect(NEAR.leafDark, 3, 1, 6, 2);
  for (const [x, c] of [[3, NEAR.flowerRed], [5, NEAR.flowerYellow], [7, NEAR.flowerRed], [4, NEAR.leaf]] as const) p.px(c, x, x % 2);
});

/** Sandstone pillar with a cap, `w` wide, from local y 4 down to `h`. */
function pillar(p: Painter, x: number, w: number, h: number): void {
  p.rect(NEAR.quay, x, 5, w, h - 5);
  p.rect(NEAR.quayShade, x + w - 2, 5, 2, h - 5);
  for (let y = 11; y < h; y += 6) p.rect(NEAR.quayShade, x, y, w, 1);
  p.rect(NEAR.stone, x - 1, 3, w + 2, 2);
  p.rect(NEAR.stoneShade, x - 1, 5, w + 2, 1);
}

/** Cannstatt -> Mitte: the hedge ends at a grassy Stadtbahn tunnel portal (the train vanishes into it). */
const tunnelPortal = staticProp(56, 46, GROUND_Y, (p) => {
  const h = 46;
  const wall = 39;
  for (let x = 0; x < wall + 2; x++) {
    const top = x < 26 ? h - 8 - Math.round(30 * Math.sin((Math.PI / 2) * (x / 26))) : 8;
    p.rect(NEAR.grass, x, top, 1, h - top);
    p.px(NEAR.leafDark, x, top);
    for (let y = top + 1; y < h; y++) {
      const n = noise(x, y, 84);
      if (n < 0.16) p.px(NEAR.grassDark, x, y);
      else if (n > 0.97) p.px(NEAR.flowerYellow, x, y);
    }
  }
  for (const [x, y, r] of [[18, 12, 4], [29, 7, 4], [8, 25, 3]] as const) {
    p.disc(NEAR.leafDark, x, y, r);
    p.disc(NEAR.leaf, x - 1, y - 1, r - 1);
    p.px(NEAR.leafLight, x - 1, y - 2);
  }
  p.rect(NEAR.stone, wall, 4, 56 - wall, h - 4);
  p.rect(NEAR.stoneShade, wall - 1, 3, 58 - wall, 2);
  p.rect(NEAR.stoneShade, 54, 5, 2, h - 5);
  const rail = TRAIN_RAIL_Y - (GROUND_Y - h);
  p.rect(NEAR.outline, wall + 3, 12, 11, rail - 11);
  p.rect(NEAR.stone, wall + 3, 12, 2, 1);
  p.rect(NEAR.stone, wall + 12, 12, 2, 1);
  p.px(NEAR.stone, wall + 3, 13);
  p.px(NEAR.stone, wall + 13, 13);
  p.rect(NEAR.railShade, wall + 3, rail, 11, 1);
});

/** Gateways into zone i: [far, mid, near]. */
export const GATEWAYS: readonly (readonly Gateway[])[] = [
  [
    { prop: housesHillProp(FAR_W, FAR_RISE, 14), seam: FAR_W / 2 },
    { prop: wasenEdge(), seam: 40 },
    { prop: tunnelPortal, seam: 30 },
  ],
  [
    { prop: hillProp(FAR_W, FAR_RISE, false, 12), seam: FAR_W / 2 },
    { prop: riverStart(), seam: 46 },
    { prop: quayGate, seam: 16 },
  ],
  [
    { prop: hillProp(FAR_W, FAR_RISE, true, 13), seam: FAR_W / 2 },
    { prop: embankment(), seam: 30 },
    { prop: parkGate, seam: 6 },
  ],
];
