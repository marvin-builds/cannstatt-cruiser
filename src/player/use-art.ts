/**
 * Geometry and art of the item use overlay (use.ts) and the drunk flail
 * (wobble.ts): the using arm as a line from the frame's shoulder to a hand
 * position relative to the mouth, the item at the mouth (full, tipped,
 * empty, bitten), crumbs, the tossed mug and the hiccup bubble. Pure data
 * and math; render.ts draws it.
 */
import { rowsFromString } from '../core/sprite-data';
import type { CarriedItem } from '../types';
import { B, BODY_FRAMES, FACE_AT } from './art';
import { ITEM_ART } from './carry';
import type { Point } from './chill';
import { isCrashTimeline, type TimelineName } from './poses';
import type { UseArm, UseFrame, UseItemLook } from './use';

/** Front shoulder per body frame (index = B.*), where the using arm starts; null in the crash frames. */
export const SHOULDER_AT: (Point | null)[] = BODY_FRAMES.map(() => null);
SHOULDER_AT[B.ride] = { x: 12, y: 11 };
SHOULDER_AT[B.pushDown] = { x: 13, y: 12 };
SHOULDER_AT[B.pushBack] = { x: 13, y: 12 };
SHOULDER_AT[B.pushSwing] = { x: 13, y: 12 };
SHOULDER_AT[B.crouch] = { x: 12, y: 16 };
SHOULDER_AT[B.airRise] = { x: 15, y: 15 };
SHOULDER_AT[B.airFall] = { x: 15, y: 13 };
SHOULDER_AT[B.landSquash] = { x: 15, y: 17 };
SHOULDER_AT[B.grindA] = { x: 15, y: 13 };
SHOULDER_AT[B.grindB] = { x: 15, y: 14 };
SHOULDER_AT[B.duck] = { x: 10, y: 19 };
SHOULDER_AT[B.grindTurn] = { x: 15, y: 13 };
SHOULDER_AT[B.grindFront] = { x: 15, y: 13 };
SHOULDER_AT[B.grab] = { x: 15, y: 17 };

/** Hand position per arm pose, relative to the mouth. Item poses put the item at the lips. */
const HAND: Record<UseArm, Point> = {
  lift: { x: 4, y: 5 },
  drink: { x: 3, y: 5 },
  tip: { x: 5, y: 4 },
  toss: { x: -9, y: -4 },
  bite: { x: 3, y: 4 },
  chew: { x: 4, y: 6 },
  windup: { x: -7, y: -9 },
  release: { x: 9, y: -5 },
};

/** Arm poses reaching behind the head: drawn before the body, so head and torso cover the arm's root. */
const BEHIND: ReadonlySet<UseArm> = new Set(['toss', 'windup']);

/** Drunk flail: the hand thrown up, alternating between two spots (relative to the shoulder). */
const FLAIL_HAND = { high: { x: 5, y: -10 }, low: { x: 8, y: -6 } } as const;

/** The item sprites the use overlay draws (keys of USE_ITEM_ART). */
export type UseSprite = `${CarriedItem}-${UseItemLook}` | 'beer-tip' | 'beer-tipEmpty';

const rows = (art: string) => rowsFromString(art);

/** Mug without beer (and without the foam crown): only glass left. */
const EMPTY_MUG = rows(ITEM_ART.beer).map((row, y) => (y === 0 ? row.replace(/w/g, '.') : row.replace(/[yYw]/g, 'g')));

/** Turned 90 degrees anticlockwise: the opening faces the lips on the left, the handle on top. */
function tipLeft(art: string[]): string[] {
  const w = art[0]!.length;
  return Array.from({ length: w }, (_, r) => art.map((row) => row[w - 1 - r]!).join(''));
}

/** The first `n` columns (the side at the lips) bitten off. */
function bitten(art: string[], n: number): string[] {
  return art.map((row) => '.'.repeat(n) + row.slice(n));
}

function foodLooks(item: CarriedItem): [UseSprite, string[]][] {
  const full = rows(ITEM_ART[item]);
  const w = full[0]!.length;
  return [
    [`${item}-full`, full],
    [`${item}-bitten`, bitten(full, Math.ceil(w / 3))],
    [`${item}-crumb`, bitten(full, w - 3)],
  ];
}

export const USE_ITEM_ART: ReadonlyMap<UseSprite, string[]> = new Map<UseSprite, string[]>([
  ['beer-full', rows(ITEM_ART.beer)],
  ['beer-empty', EMPTY_MUG],
  ['beer-tip', tipLeft(rows(ITEM_ART.beer))],
  ['beer-tipEmpty', tipLeft(EMPTY_MUG)],
  ...foodLooks('pretzel'),
  ...foodLooks('gingerbread'),
]);

/** Spin frames of the tossed mug in flight (empty, upright / tipped / upside down / tipped the other way). */
export const TOSSED_MUG: string[][] = [EMPTY_MUG, tipLeft(EMPTY_MUG), [...EMPTY_MUG].reverse(), tipLeft([...EMPTY_MUG].reverse())];
/** The mug lying on the street once landed. */
export const LYING_MUG = 1;

export interface UseDraw {
  /** The arm: from the shoulder to the hand (body-frame pixels). */
  shoulder: Point;
  hand: Point;
  /** Arm drawn before the body (reaching behind the head). */
  behind: boolean;
  /** The item at the hand, top-left in body-frame pixels. */
  sprite: UseSprite | null;
  x: number;
  y: number;
  /** Crumb pixels falling from the mouth (body-frame pixels), empty when none. */
  crumbs: Point[];
}

const size = (sprite: UseSprite) => {
  const art = USE_ITEM_ART.get(sprite)!;
  return { w: art[0]!.length, h: art.length };
};

/**
 * What to draw for use frame `frame` of `item` in `timeline`'s body frame
 * `body`, or null: nothing in the crash, nor in a frame without a face.
 */
export function useDraw(item: CarriedItem, frame: UseFrame, timeline: TimelineName, body: number): UseDraw | null {
  const face = FACE_AT[body];
  const shoulder = SHOULDER_AT[body];
  if (isCrashTimeline(timeline) || !face || !shoulder) return null;
  const { mouth } = face;
  const off = HAND[frame.arm];
  const hand = { x: mouth.x + off.x, y: mouth.y + off.y };
  const draw: UseDraw = { shoulder, hand, behind: BEHIND.has(frame.arm), sprite: null, x: 0, y: 0, crumbs: crumbsAt(mouth, frame.crumbs) };
  if (!frame.item || item === 'football') return draw;
  const sprite = itemSprite(item, frame);
  const { w, h } = size(sprite);
  draw.sprite = sprite;
  if (frame.arm === 'lift' || frame.arm === 'chew') {
    // On the way up / held just below the lips: the item sits on the hand.
    draw.x = hand.x - Math.floor(w / 2);
    draw.y = hand.y - h + 1;
  } else {
    // At the lips: the item's mouth side just in front of the mouth, vertically centred on it.
    draw.x = mouth.x + 1;
    draw.y = mouth.y - Math.floor(h / 2);
  }
  return draw;
}

function itemSprite(item: CarriedItem, frame: UseFrame): UseSprite {
  if (item === 'beer' && frame.arm === 'tip') return frame.item === 'empty' ? 'beer-tipEmpty' : 'beer-tip';
  return `${item}-${frame.item!}`;
}

/** Crumb fall speed (px/s) and their spread under the mouth. */
const CRUMB_FALL = 40;
const CRUMB_DX = [0, 2, -1] as const;
const CRUMB_DELAY = [0, 0.05, 0.1] as const;

function crumbsAt(mouth: Point, seconds: number): Point[] {
  if (seconds < 0) return [];
  return CRUMB_DX.flatMap((dx, i) => {
    const t = seconds - CRUMB_DELAY[i]!;
    return t < 0 ? [] : [{ x: mouth.x + 1 + dx, y: mouth.y + 1 + Math.round(t * CRUMB_FALL) }];
  });
}

/** The flailing drunk arm (body-frame pixels), or null in frames without a shoulder. */
export function flailArm(body: number, high: boolean): { shoulder: Point; hand: Point } | null {
  const shoulder = SHOULDER_AT[body];
  if (!shoulder) return null;
  const off = high ? FLAIL_HAND.high : FLAIL_HAND.low;
  return { shoulder, hand: { x: shoulder.x + off.x, y: shoulder.y + off.y } };
}

/** Pixels of the arm line from `a` to `b` (Bresenham, both ends included). */
export function armLine(a: Point, b: Point): Point[] {
  const out: Point[] = [];
  let { x, y } = a;
  const dx = Math.abs(b.x - x);
  const dy = -Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1;
  const sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ x, y });
    if (x === b.x && y === b.y) return out;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** Hiccup bubble: a tiny ring next to the mouth, risen `rise` px (body-frame pixels of its top-left). */
export function hiccupAt(body: number, rise: number): Point | null {
  const face = FACE_AT[body];
  return face ? { x: face.mouth.x + 2, y: face.mouth.y - 3 - rise } : null;
}

export const HICCUP_ART = `
  .o.
  o.o
  .o.
`;
