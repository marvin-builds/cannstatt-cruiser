/**
 * Art for the NorDIY park line (ROADMAP 36): the high fiver (a NorDIY skater
 * at the street edge, facing the skater, hand up; the slap with a few sparks
 * after the high five; then standing relaxed), the banks as smooth grey
 * concrete kickers with a steel coping (not the plywood kicker), and the park
 * ledges as a thin steel coping edge only: the world draws the containers
 * and the crane under them (state.park). Same in kid mode.
 */
import { GROUND_Y } from '../core/config';
import type { Entity } from '../types';
import { ComposedCache } from './composed';
import { sprite } from './sprites';

const K = '#1a1418';

/** Ticks the slap pose shows after the high five (data.slapped = the frame of it). */
export const SLAP_TICKS = 30;

export type HighFiverPose = 'up' | 'slap' | 'cheer';

/** The pose for `slapped` (the frame of the high five, or undefined) at `frame`. */
export function highFiverPose(slapped: number | undefined, frame: number): HighFiverPose {
  if (slapped === undefined) return 'up';
  return frame - slapped < SLAP_TICKS ? 'slap' : 'cheer';
}

/** Beanie and face (rows 2-9), right of the raised arm's columns 0-4. */
const HEAD = ['..kkkkk...', '.kbbbbbk..', 'kbbbbbbbk.', 'kBBBBBBBk.', 'kssssssk..', 'kskssssk..', 'kssssssk..', '.kSssSk...'];
/** Hoodie with the arm hanging on the far side (rows 11-16). */
const BODY = ['...khhhhhhhhk..', '...khhhhhhkhk..', '...khhHhhhkhk..', '...khhhhhhkhk..', '...kHHHHHHkSk..'];
/** Baggy pants and white shoes (rows 17-26). */
const LEGS = ['...kppppppkk...', '...kpppppppk...', '...kpppkpppk...', '...kpppkpppk...', '...kpppkpppk...', '...kPppkPppk...', '...kPppkPppk...', '..kwwwk.kwwwk..', '.kwwwwk.kwwwwk.', '.kkkkkk.kkkkkk.'];

/** Hand up high, towards the street. */
const UP = [
  '.kk............',
  'kssk...........',
  ...['kssk.', '.khk.', '.khk.', '.khk.', '.khk.', '.khk.', '.khk.', '.khk.'].map((arm, i) => arm + HEAD[i]),
  '..khkkkkSSkkk..',
  '..khhhhhhhhhk..',
  ...BODY,
  ...LEGS,
];

/** The slap: the hand out flat towards the skater, sparks around it. */
const SLAP = [
  '...............',
  '...............',
  ...['.....', '.....', '.....', '.....', 'y....', '.y...', 'kk...', 'sskk.'].map((arm, i) => arm + HEAD[i]),
  'sshhkkkkSSkkk..',
  'kkkhhhhhhhhhk..',
  '.y.khhhhhhhhk..',
  'y..khhhhhhkhk..',
  ...BODY.slice(2),
  ...LEGS,
];

/** Relaxed after the high five: both arms down, a big grin. */
const CHEER = [
  '...............',
  '...............',
  ...HEAD.map((row, i) => '.....' + (i === 6 ? 'ksoossk...' : row)),
  '....kkkkSSkkk..',
  '...khhhhhhhhk..',
  ...BODY.slice(0, 4),
  '...kSHHHHHkSk..',
  ...LEGS,
];

const POSES: Record<HighFiverPose, number> = { up: 0, slap: 1, cheer: 2 };

const HIGH_FIVER = sprite(
  {
    k: K,
    s: '#f0c08a',
    S: '#c98d5c',
    o: '#7a2c2c',
    b: '#2fb5a8',
    B: '#1f7f76',
    h: '#f08a3c',
    H: '#c0612a',
    p: '#4a5468',
    P: '#363d4c',
    w: '#f4f1ea',
    y: '#ffd23f',
  },
  [UP, SLAP, CHEER],
);

/** The plywood kicker's shape in smooth concrete: light top, grey face, a few pebbles, a steel coping on the lip. */
const CONCRETE_KICKER = sprite({ k: K, C: '#e0ddd5', c: '#bcb9b1', g: '#a5a29a', d: '#8a8780', M: '#eef1f4' }, [
  `
  ...............kkk
  ............kkkMMk
  .........kkkCCCcdk
  ......kkkCCCccccdk
  ...kkkCCCcccgcccdk
  kkkCCCcccgcccccgdk
  kkkkkkkkkkkkkkkkkk
  `,
]);

/** A park ledge: one row of dark edge above the grind surface, the steel coping on it. */
const COPING = sprite({ k: K, M: '#eef1f4', m: '#9aa3ad' }, [['k', 'M', 'm']]);
const COPINGS = new ComposedCache<number>(8, (g, w) => {
  for (let px = 0; px < w; px++) COPING.draw(g, 0, px, 0);
});

/** Draws a park kicker (a concrete bank) or a park ledge (its coping only) at screen x `x`. */
export function drawParkPiece(g: CanvasRenderingContext2D, e: Entity, x: number): void {
  const y = Math.round(e.y);
  if (e.kind === 'kicker') {
    CONCRETE_KICKER.draw(g, 0, x, y);
    return;
  }
  const w = Math.round(e.w);
  g.drawImage(COPINGS.get(w, w, COPING.height, w), x, y - 1);
}

/** Draws the high fiver at screen x `x` in the pose for `frame`. */
export function drawHighFiver(g: CanvasRenderingContext2D, e: Entity, x: number, frame: number): void {
  const slapped = e.data?.slapped;
  HIGH_FIVER.draw(g, POSES[highFiverPose(typeof slapped === 'number' ? slapped : undefined, frame)], x, GROUND_Y - HIGH_FIVER.height);
}

export function concreteKickerSize(): { w: number; h: number } {
  return { w: CONCRETE_KICKER.width, h: CONCRETE_KICKER.height };
}

export function highFiverSize(): { w: number; h: number } {
  return { w: HIGH_FIVER.width, h: HIGH_FIVER.height };
}
