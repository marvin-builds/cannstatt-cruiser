import { GROUND_Y, VIEW_H } from '../../core/config';
import { GROUND } from '../palette';
import { baseTile, type BaseTile, lazyCanvas, noise, type Painter } from './paint';

const H = VIEW_H - GROUND_Y;
/** Rows of the band (relative to GROUND_Y). */
const WALK_BOTTOM = 11;
const CURB_TOP = 11;
const STREET_TOP = 16;

type Walk = (p: Painter) => void;

/** Sidewalk (zone-specific paving), curb and asphalt street; period 64. */
function groundTile(salt: number, walk: Walk): BaseTile {
  return baseTile(64, GROUND_Y, H, (p) => {
    walk(p);
    p.rect(GROUND.edge, 0, 0, 64, 1);
    p.rect(GROUND.curbTop, 0, CURB_TOP, 64, 2);
    p.rect(GROUND.curbFace, 0, CURB_TOP + 2, 64, 2);
    for (let x = 15; x < 64; x += 32) p.px(GROUND.slabJoint, x, CURB_TOP + 2);
    p.rect(GROUND.curbShadow, 0, CURB_TOP + 4, 64, 1);
    for (let y = STREET_TOP; y < H; y++) {
      for (let x = 0; x < 64; x++) {
        const n = noise(x, y, salt);
        p.px(n < 0.12 ? GROUND.asphaltDark : n > 0.93 ? GROUND.asphaltLight : GROUND.asphalt, x, y);
      }
    }
    p.rect(GROUND.marking, 12, 23, 30, 2);
  });
}

/** Grey concrete slabs in two staggered rows (Stuttgart-Mitte). */
const slabs: Walk = (p) => {
  for (let x = 0; x < 64; x++) {
    for (let y = 1; y < WALK_BOTTOM; y++) {
      const row = y < 5 ? 0 : 1;
      const slab = Math.floor((x + row * 8) / 16);
      const base = noise(slab, row, 41) < 0.5 ? GROUND.slab : GROUND.slabAlt;
      p.px(noise(x, y, 42) < 0.06 ? GROUND.speck : base, x, y);
    }
  }
  p.rect(GROUND.slabJoint, 0, 5, 64, 1);
  for (let x = 15; x < 64; x += 16) p.rect(GROUND.slabJoint, x, 1, 1, 4);
  for (let x = 7; x < 64; x += 16) p.rect(GROUND.slabJoint, x, 6, 1, 5);
};

/** Large warm sandstone pavers along the river promenade (Neckar). */
const pavers: Walk = (p) => {
  for (let x = 0; x < 64; x++) {
    for (let y = 1; y < WALK_BOTTOM; y++) {
      const paver = Math.floor(x / 32);
      p.px(noise(x, y, 51) < 0.07 ? GROUND.paverJoint : paver === 0 ? GROUND.paver : GROUND.paverAlt, x, y);
    }
  }
  p.rect(GROUND.paverJoint, 31, 1, 1, 10);
  p.rect(GROUND.paverJoint, 63, 1, 1, 10);
  p.rect(GROUND.paverJoint, 0, 6, 64, 1);
};

/** Old-town cobblestones in a running bond (Bad Cannstatt Altstadt). */
const cobbles: Walk = (p) => {
  p.rect(GROUND.cobbleDark, 0, 1, 64, WALK_BOTTOM - 1);
  for (let row = 0; row < 3; row++) {
    const y = 1 + row * 3;
    for (let x = row % 2 === 0 ? 0 : -2; x < 64; x += 4) {
      p.rect(noise(x, row, 61) < 0.5 ? GROUND.cobble : GROUND.cobbleAlt, x, y, 3, 2);
      p.rect(GROUND.edge, x + 1, y, 1, 1);
    }
  }
};

/** One riding-surface tile per zone. */
export const GROUND_TILES: readonly BaseTile[] = [groundTile(71, slabs), groundTile(72, pavers), groundTile(73, cobbles)];

/**
 * Marks a paving seam: a granite strip across the sidewalk, a lowered curb
 * and a zebra crossing over the street. The seam lies at x CROSSING_SEAM.
 */
export const CROSSING_W = 24;
export const CROSSING_SEAM = 12;
export const CROSSING = lazyCanvas(CROSSING_W, H, (p) => {
  p.rect(GROUND.edge, 0, 0, CROSSING_W, 1);
  p.rect(GROUND.curbTop, CROSSING_SEAM - 3, 1, 6, WALK_BOTTOM - 1);
  p.rect(GROUND.curbFace, CROSSING_SEAM - 3, 5, 6, 1);
  p.rect(GROUND.curbFace, CROSSING_SEAM + 2, 1, 1, WALK_BOTTOM - 1);
  p.rect(GROUND.curbTop, 0, CURB_TOP, CROSSING_W, 4);
  p.rect(GROUND.curbFace, 0, CURB_TOP + 4, CROSSING_W, 1);
  for (let y = STREET_TOP; y < H; y++) {
    const stripe = (y - STREET_TOP) % 4 < 2;
    for (let x = 0; x < CROSSING_W; x++) p.px(stripe ? GROUND.marking : noise(x, y, 74) < 0.12 ? GROUND.asphaltDark : GROUND.asphalt, x, y);
  }
});
