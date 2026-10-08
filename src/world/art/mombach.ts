/**
 * The Mombachquelle on the far Neckar bank (mid layer): a sandstone spring
 * wall pours mineral water into a small bathing pool, whose outlet runs over
 * the quay into the river. A few people chill there: two on the rim with their
 * feet in the water, one waving, one in the pool, one sunbathing on a towel.
 * Small and in the soft mid palette, so it reads as scenery, never as an
 * obstacle. Four pre-rendered frames: water shimmer, a dangling foot, a wave.
 */
import { drawText, measureText } from '../../core/font';
import { MID } from '../palette';
import { animatedProp, type Painter, type Prop } from './paint';
import { BANK_Y, WATER_Y } from './layout';

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
} as const;

const SIGN_TEXT = 'Mombachquelle';
const SIGN_W = measureText(SIGN_TEXT) + 4;

const W = 92;
/** Local y of view y `y` (the prop's top is TOP). */
const TOP = BANK_Y - 27;
const BOTTOM = WATER_Y + 5;
const H = BOTTOM - TOP;
const ly = (y: number) => y - TOP;

// Layout (local x).
const TOWEL_X = 1;
const WALL_X = 17;
const WALL_W = 12;
const POOL_X = WALL_X + WALL_W;
const POOL_W = 40;
const OUTLET_X = POOL_X + POOL_W;
const FALL_X = W - 6;
/** View rows of the pool. */
const RIM = BANK_Y - 6;
const POOL_FRONT = BANK_Y - 2;

/** Sandstone spring wall with a little gable and a spout pouring into the pool. */
function paintSpring(p: Painter, frame: number): void {
  const top = ly(BANK_Y - 17);
  p.rect(MID.sand, WALL_X, top, WALL_W, ly(BANK_Y + 1) - top);
  p.rect(MID.sandShade, WALL_X + WALL_W - 2, top, 2, ly(BANK_Y + 1) - top);
  p.gable(MID.sandLight, WALL_X - 1, top - 3, WALL_W + 2, 3);
  p.rect(MID.sandShade, WALL_X, top, WALL_W, 1);
  // Arched niche with the spout.
  p.rect(MID.stoneShade, WALL_X + 3, top + 4, 5, 6);
  p.rect(MID.sand, WALL_X + 3, top + 4, 1, 1);
  p.rect(MID.sand, WALL_X + 7, top + 4, 1, 1);
  p.rect(MID.windowDark, WALL_X + 4, top + 7, 4, 1);
  // Jet into the pool, flickering.
  const jet = ly(RIM) - (top + 7);
  for (let i = 0; i < jet + 1; i++) p.px((i + frame) % 3 === 0 ? MID.waterGlint : MID.waterLight, WALL_X + 8 + Math.min(2, i >> 1), top + 7 + i);
}

/** Pool seen slightly from above: back rim, water, front rim and wall. */
function paintPool(p: Painter, frame: number): void {
  const rim = ly(RIM);
  p.rect(MID.stone, POOL_X, rim, POOL_W, 1);
  p.rect(MID.water, POOL_X, rim + 1, POOL_W, 3);
  p.rect(MID.waterMid, POOL_X, rim + 3, POOL_W, 1);
  for (let i = 0; i < 6; i++) {
    const x = POOL_X + 2 + ((i * 7 + frame * 3) % (POOL_W - 4));
    p.px(i % 2 === 0 ? MID.waterGlint : MID.waterLight, x, rim + 1 + (i % 3));
  }
  const front = ly(POOL_FRONT);
  p.rect(MID.stone, POOL_X, front, POOL_W, 1);
  p.rect(MID.sand, POOL_X, front + 1, POOL_W, ly(BANK_Y + 1) - front - 1);
  for (let x = POOL_X + 3; x < POOL_X + POOL_W; x += 6) p.px(MID.sandShade, x, front + 2);
  p.rect(MID.sandShade, POOL_X, ly(BANK_Y), POOL_W, 1);
}

/** The outlet brook across the bank and its little fall over the quay into the Neckar. */
function paintOutlet(p: Painter, frame: number): void {
  const bank = ly(BANK_Y);
  p.rect(MID.water, OUTLET_X, ly(POOL_FRONT) + 1, 2, bank - ly(POOL_FRONT) - 1);
  p.rect(MID.water, OUTLET_X, bank, FALL_X - OUTLET_X + 2, 2);
  p.rect(MID.waterLight, OUTLET_X + 2, bank, FALL_X - OUTLET_X, 1);
  for (let x = OUTLET_X + 2 + (frame % 3); x < FALL_X; x += 4) p.px(MID.waterGlint, x, bank);
  // Quay outlet arch and the fall.
  const quay = ly(BANK_Y + 2);
  const water = ly(WATER_Y);
  p.rect(MID.windowDark, FALL_X - 1, quay, 4, water - quay - 1);
  for (let y = quay; y < water; y++) p.rect((y + frame) % 2 === 0 ? MID.waterGlint : MID.waterLight, FALL_X, y, 2, 1);
  // Splash rings spreading on the river.
  const r = 2 + (frame % 4);
  p.rect(MID.waterLight, FALL_X - r, water + 1, r * 2 + 2, 1);
  p.px(MID.waterGlint, FALL_X - r + 1, water + 2);
  p.px(MID.waterGlint, FALL_X + r, water + 2);
  if (frame % 2 === 0) p.rect(MID.waterLight, FALL_X - 1, water + 3, 4, 1);
}

/** A person sitting on the back rim, facing out, legs in the water. */
function sitter(p: Painter, x: number, hair: string, suit: string, frame: number, waves: boolean, dangles: boolean): void {
  const rim = ly(RIM);
  p.rect(hair, x, rim - 8, 3, 1);
  p.rect(PEOPLE.skin, x, rim - 7, 3, 2);
  p.px(hair, x, rim - 7);
  p.rect(suit, x - 1, rim - 5, 5, 2);
  p.rect(suit, x, rim - 3, 3, 3);
  p.px(PEOPLE.skin, x - 1, rim - 3);
  if (waves) {
    const up = frame % 2 === 0;
    p.px(PEOPLE.skin, x + 4, rim - 4);
    p.px(PEOPLE.skin, x + 5, up ? rim - 7 : rim - 6);
    p.px(PEOPLE.skin, x + 4 + (up ? 1 : 2), rim - 5 - (up ? 1 : 0));
  } else {
    p.px(PEOPLE.skin, x + 3, rim - 3);
  }
  // Shins in the water (paler), one foot kicking.
  const kick = dangles ? [0, 1, 0, -1][frame]! : 0;
  p.rect(PEOPLE.skinShade, x, rim + 1, 1, 2);
  p.rect(PEOPLE.skinShade, x + 2 + kick, rim + 1, 1, 2);
}

/** Only head and shoulders above the water. */
function swimmer(p: Painter, x: number, frame: number): void {
  const rim = ly(RIM);
  const bob = frame % 2;
  p.rect(PEOPLE.hairLight, x, rim - 2 + bob, 3, 1);
  p.rect(PEOPLE.skin, x, rim - 1 + bob, 3, 2);
  p.rect(PEOPLE.skin, x - 1, rim + 1, 5, 1);
  p.rect(MID.waterLight, x - 2, rim + 2, 7, 1);
}

/** Sunbather lying on a striped towel on the bank grass, one foot tapping. */
function sunbather(p: Painter, frame: number): void {
  const y = ly(BANK_Y) - 1;
  for (let x = 0; x < 14; x++) p.rect(Math.floor(x / 2) % 2 === 0 ? MID.white : PEOPLE.red, TOWEL_X + x, y, 1, 2);
  p.rect(PEOPLE.hairDark, TOWEL_X + 1, y - 2, 2, 2);
  p.rect(PEOPLE.skin, TOWEL_X + 3, y - 2, 2, 2);
  p.rect(PEOPLE.yellow, TOWEL_X + 5, y - 2, 4, 2);
  p.rect(PEOPLE.skin, TOWEL_X + 9, y - 1, 4, 1);
  p.px(PEOPLE.skin, TOWEL_X + 12, frame === 2 ? y - 3 : y - 2);
  p.px(PEOPLE.skinShade, TOWEL_X + 10, y - 2);
}

/** Wooden sign board on two posts behind the pool. */
function paintSign(p: Painter): void {
  const x = POOL_X + Math.floor((POOL_W - SIGN_W) / 2);
  const y = 0;
  p.rect(MID.beam, x + 4, y + 9, 1, ly(RIM) - y - 9);
  p.rect(MID.beam, x + SIGN_W - 5, y + 9, 1, ly(RIM) - y - 9);
  p.rect(MID.beam, x, y, SIGN_W, 10);
  p.rect(MID.plaster, x + 1, y + 1, SIGN_W - 2, 8);
  drawText(p.g, SIGN_TEXT, x + 2, y + 1, { color: MID.beam });
}

export const mombachquelle: Prop = animatedProp(W, H, BOTTOM, 4, 3, (p, frame) => {
  paintSign(p);
  sunbather(p, frame);
  paintPool(p, frame);
  sitter(p, POOL_X + 5, PEOPLE.hairDark, PEOPLE.red, frame, false, true);
  sitter(p, POOL_X + 13, PEOPLE.hairLight, PEOPLE.blue, frame, true, false);
  swimmer(p, POOL_X + 23, frame);
  sitter(p, POOL_X + 32, PEOPLE.hairDark, PEOPLE.green, (frame + 2) % 4, false, true);
  paintSpring(p, frame);
  paintOutlet(p, frame);
});
