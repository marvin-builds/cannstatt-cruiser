/**
 * Art for the NorDIY park line (ROADMAP 36): the high fiver (a NorDIY skater
 * at the street edge, facing the skater, hand up; after the high five his
 * reaction, ROADMAP 49: the slap towards the skater's hand, the hand pulled
 * back, a fist pump with a little hop, then standing relaxed with a grin,
 * turned right towards a skater who already passed him; the slapping and
 * pumping arm is drawn again over the skater, drawHighFiverArm; the burst
 * where the hands meet is klatsch.ts), the banks as smooth grey
 * concrete kickers with a steel coping (not the plywood kicker), and the park
 * ledges as a thin steel coping edge only: the world draws the containers
 * and the crane under them (state.park). Same in kid mode.
 */
import { GROUND_Y } from '../core/config';
import type { Entity } from '../types';
import { ComposedCache } from './composed';
import { sprite } from './sprites';

const K = '#1a1418';

/**
 * Ticks of the slap pose after the high five (data.slapped = the frame of
 * it), until the skater's palm leaves the contact (player/high-five.ts)...
 * The whole reaction is quick: at top speed the street carries him off the
 * left edge about 15 ticks after a late slap.
 */
export const SLAP_TICKS = 10;
/** ...then of the hand pulled back to the chest... */
export const PULL_TICKS = 4;
/** ...then of the fist pump (with the hop), before he stands relaxed. */
export const PUMP_TICKS = 14;
/** The whole reaction after the high five. */
export const REACTION_TICKS = SLAP_TICKS + PULL_TICKS + PUMP_TICKS;
/** The hop at the start of the fist pump: its height (px) and ticks. */
export const HOP_HEIGHT = 3;
const HOP_TICKS = 12;

export type HighFiverPose = 'up' | 'slap' | 'pull' | 'pump' | 'cheer';

/** His pose and hop (px up) for `slapped` (the frame of the high five, or undefined) at `frame`. */
export function highFiverReaction(slapped: number | undefined, frame: number): { pose: HighFiverPose; lift: number } {
  if (slapped === undefined) return { pose: 'up', lift: 0 };
  const age = frame - slapped;
  if (age < SLAP_TICKS) return { pose: 'slap', lift: 0 };
  if (age < SLAP_TICKS + PULL_TICKS) return { pose: 'pull', lift: 0 };
  if (age >= REACTION_TICKS) return { pose: 'cheer', lift: 0 };
  const t = age - SLAP_TICKS - PULL_TICKS;
  const lift = t < HOP_TICKS ? Math.round((HOP_HEIGHT * 4 * t * (HOP_TICKS - t)) / (HOP_TICKS * HOP_TICKS)) : 0;
  return { pose: 'pump', lift };
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

/** The slap: the arm stretched up towards the skater, the open hand at FIVER_HAND (klatsch.ts). */
const SLAP = [
  '...............',
  '...............',
  ...['.....', 'kk...', 'ssk..', 'sssk.', 'kkhk.', '..khk', '...kh', '...kh'].map((arm, i) => arm + HEAD[i]),
  '...khkkkSSkkk..',
  '...khhhhhhhhk..',
  ...BODY,
  ...LEGS,
];

/** A grin instead of the closed mouth (head row 6). */
const GRIN = HEAD.map((row, i) => (i === 6 ? 'ksoossk...' : row));

/** The hand pulled back to the chest after the slap. */
const PULL = [
  '...............',
  '...............',
  ...GRIN.map((row) => '.....' + row),
  '....kkkkSSkkk..',
  '...khhhhhhhhk..',
  '..ksskhhhhhhk..',
  '..ksskhhhhkhk..',
  ...BODY.slice(2),
  ...LEGS,
];

/** The fist pump: a fist up high, grinning (drawn HOP_HEIGHT up at the hop's top). */
const PUMP = [
  '.kkk...........',
  'kSssk..........',
  ...['kssk.', '.kk..', '.khk.', '.khk.', '.khk.', '.khk.', '.khk.', '.khk.'].map((arm, i) => arm + GRIN[i]),
  '..khkkkkSSkkk..',
  '..khhhhhhhhhk..',
  ...BODY,
  ...LEGS,
];

/** Relaxed after the high five: both arms down, a big grin. */
const CHEER = [
  '...............',
  '...............',
  ...GRIN.map((row) => '.....' + row),
  '....kkkkSSkkk..',
  '...khhhhhhhhk..',
  ...BODY.slice(0, 4),
  '...kSHHHHHkSk..',
  ...LEGS,
];

const POSES: Record<HighFiverPose, number> = { up: 0, slap: 1, pull: 2, pump: 3, cheer: 4 };

const FIVER_PALETTE = {
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
};

const HIGH_FIVER = sprite(FIVER_PALETTE, [UP, SLAP, PULL, PUMP, CHEER]);

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

/** Only his raised arm (columns 0-4 down to the collar) of a pose, drawn again over the skater. */
const armOnly = (rows: readonly string[]): string[] =>
  rows.map((row, i) => (i <= 10 ? row.slice(0, 5) : '').padEnd(row.length, '.'));

/** The slap and fist pump arms, drawn over the skater so the contact and the reaction show (drawHighFiverArm). */
const ARMS: Partial<Record<HighFiverPose, number>> = { slap: 0, pump: 1 };
const HIGH_FIVER_ARMS = sprite(FIVER_PALETTE, [armOnly(SLAP), armOnly(PUMP)]);

/** His reaction for entity `e` at `frame`, and whether he faces right (towards a skater who passed him, data.slapRight). */
function reactionOf(e: Entity, frame: number): { pose: HighFiverPose; lift: number; flip: boolean } {
  const slapped = e.data?.slapped;
  return { ...highFiverReaction(typeof slapped === 'number' ? slapped : undefined, frame), flip: e.data?.slapRight === true };
}

/** Draws the high fiver at screen x `x` in his pose (and hop) for `frame`. */
export function drawHighFiver(g: CanvasRenderingContext2D, e: Entity, x: number, frame: number): void {
  const { pose, lift, flip } = reactionOf(e, frame);
  HIGH_FIVER.draw(g, POSES[pose], x, GROUND_Y - HIGH_FIVER.height - lift, { flip });
}

/** Draws his slapping or pumping arm again at screen x `x`, over the skater (the fx layer); nothing in the other poses. */
export function drawHighFiverArm(g: CanvasRenderingContext2D, e: Entity, x: number, frame: number): void {
  const { pose, lift, flip } = reactionOf(e, frame);
  const arm = ARMS[pose];
  if (arm !== undefined) HIGH_FIVER_ARMS.draw(g, arm, x, GROUND_Y - HIGH_FIVER.height - lift, { flip });
}

export function concreteKickerSize(): { w: number; h: number } {
  return { w: CONCRETE_KICKER.width, h: CONCRETE_KICKER.height };
}

export function highFiverSize(): { w: number; h: number } {
  return { w: HIGH_FIVER.width, h: HIGH_FIVER.height };
}
