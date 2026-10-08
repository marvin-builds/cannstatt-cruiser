/**
 * The item the skater carries after a stomp (state.carriedItem): its art
 * (football, pretzel, beer mug, gingerbread heart), where the hand is in every
 * body frame and how the item sits there, plus the short catch reach after
 * itemCaught (arm up above the cap, see CATCH_TIME). Pure data and math;
 * render.ts draws it.
 */
import { rowsFromString } from '../core/sprite-data';
import type { CarriedItem } from '../types';
import { B, BODY_FRAMES, HEAD_AT, PALETTE } from './art';
import type { Point } from './chill';
import type { TimelineName } from './poses';

export const ITEM_PALETTE = {
  k: PALETTE.k, // the skater's outline
  f: '#9a5a2c', // football leather
  F: '#663717', // football leather shade
  w: '#f7f3ea', // white: ball seams, pretzel salt, beer foam
  z: '#c47a35', // pretzel crust
  Z: '#8a4a1c', // pretzel crust shade
  y: '#f5b52e', // beer
  Y: '#c9821a', // beer shade
  g: '#cfe2ea', // mug glass
  L: '#a3602c', // gingerbread
  i: '#fff4f4', // icing
  P: '#ff7aa8', // pink icing
  x: '#2f6fd6', // ribbon
} as const;

/** Small side-view sprites, readable at 1x, outlined like the skater. */
export const ITEM_ART: Record<CarriedItem, string> = {
  football: `
    .kkkk.
    kfwffk
    kwwwfk
    kfwfFk
    kFfFFk
    .kkkk.
  `,
  pretzel: `
    .kkk.kkk.
    kzwzkzwzk
    kz.kzk.zk
    kzzzkzzzk
    .kz.k.zk.
    ..kzZzk..
    ...kkk...
  `,
  beer: `
    .wwwww..
    kwwwwwk.
    kyyyygkk
    kyYyygkk
    kyYyygkk
    kyyyygk.
    .kkkkk..
  `,
  gingerbread: `
    ..x.x..
    .kkxkk.
    kiikiik
    kiLPLik
    .kiLik.
    ..kik..
    ...k...
  `,
};

export function itemSize(item: CarriedItem): { w: number; h: number } {
  const rows = rowsFromString(ITEM_ART[item]);
  return { w: rows[0]!.length, h: rows.length };
}

/**
 * How the item sits at the hand: `side` tucked under the arm against the hip
 * (hand over the item), `hang` below an outstretched hand, `raise` above a
 * raised hand, `catch` held up above the cap right after the catch.
 */
export type Grip = 'side' | 'hang' | 'raise' | 'catch';

export interface Hold {
  /** Hand pixel in body-frame coordinates. */
  hand: Point;
  grip: Exclude<Grip, 'catch'>;
}

const hold = (x: number, y: number, grip: Hold['grip']): Hold => ({ hand: { x, y }, grip });

/** Hand per body frame (index = B.*), or null where nothing is carried (crash frames). */
export const HOLD_AT: (Hold | null)[] = BODY_FRAMES.map(() => null);
HOLD_AT[B.ride] = hold(11, 16, 'side');
HOLD_AT[B.pushDown] = hold(15, 16, 'side');
HOLD_AT[B.pushBack] = hold(15, 16, 'side');
HOLD_AT[B.pushSwing] = hold(15, 16, 'side');
HOLD_AT[B.crouch] = hold(16, 19, 'side');
HOLD_AT[B.airRise] = hold(20, 15, 'hang');
HOLD_AT[B.airFall] = hold(19, 9, 'raise');
HOLD_AT[B.landSquash] = hold(20, 17, 'hang');
HOLD_AT[B.grindA] = hold(20, 13, 'hang');
HOLD_AT[B.grindB] = hold(20, 14, 'hang');
HOLD_AT[B.duck] = hold(12, 21, 'side');

/**
 * Catch reach: the front arm goes up from the shoulder past the face to above
 * the cap. Drawn before the body, so the torso and the face cover its root.
 */
export const CATCH_ARM = `
  ....ksk
  ....kRk
  ....kRk
  ....kRk
  ....kRk
  ....kRk
  ...kRk.
  ...kRk.
  ..kRk..
  .kRk...
  kRk....
`;
/** Top-left of CATCH_ARM and its hand pixel, relative to the head's top-left. */
const CATCH_ARM_AT: Point = { x: 8, y: -3 };
const CATCH_HAND: Point = { x: 13, y: -3 };

export interface ItemDraw {
  item: CarriedItem;
  /** Top-left of the item sprite (body-frame pixels). */
  x: number;
  y: number;
  grip: Grip;
  /** Hand pixel, redrawn over a tucked item so the arm grips it. */
  hand: Point;
  /** Top-left of CATCH_ARM while catching. */
  arm?: Point;
}

/**
 * Where to draw `item` for `timeline`'s frame `body`, or null: nothing is
 * carried, the crash is playing (gameplay clears the item then) or the frame
 * has no hand. `catching` (the first CATCH_TIME after itemCaught) raises it
 * above the cap.
 */
export function carriedItemDraw(item: CarriedItem | null, timeline: TimelineName, body: number, catching: boolean): ItemDraw | null {
  if (!item || timeline === 'crash') return null;
  const { w, h } = itemSize(item);
  const head = HEAD_AT[body];
  if (catching && head) {
    const hand = { x: head.x + CATCH_HAND.x, y: head.y + CATCH_HAND.y };
    const arm = { x: head.x + CATCH_ARM_AT.x, y: head.y + CATCH_ARM_AT.y };
    return { item, x: hand.x - Math.floor(w / 2), y: hand.y - h, grip: 'catch', hand, arm };
  }
  const held = HOLD_AT[body];
  if (!held) return null;
  const { hand, grip } = held;
  const x = hand.x - Math.floor(w / 2);
  if (grip === 'hang') return { item, x, y: hand.y + 1, grip, hand };
  if (grip === 'raise') return { item, x, y: hand.y - h, grip, hand };
  return { item, x, y: hand.y - h + 3, grip, hand };
}
