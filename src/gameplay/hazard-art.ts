/**
 * Art of the moving local hazards (hazards.ts), as palette sprites with the
 * dark outline of the other obstacles, readable at 1x on a phone:
 * - the e-scooter rider: helmet, blue jacket, standing on a light grey
 *   e-scooter facing left (towards the skater) with a blinking headlight at
 *   the front, so he reads as coming at you. Drawn so his body is the
 *   person's collision box (catalogue vfbFan). Bumped: a surprised "oh";
 *   stomped (or hit by the ball): he tumbles off like any person
 *   (people-art.ts drawFallen) and the scooter lies beside him;
 * - the pigeons: three blue-grey pigeons pecking on the street; from
 *   `data.flushedAt` on they flap up and away ahead of the skater.
 * Same in kid mode (nothing in it is for adults only).
 */
import { GROUND_Y } from '../core/config';
import type { Entity } from '../types';
import { isPigeons, isScooter } from './hazards';
import { drawFallen, lyingDown, SIT_BASE, SITTING } from './people-art';
import { sprite } from './sprites';

const K = '#1a1418';

/** Rider and scooter, facing left: helmet H/h, skin s/S, jacket J/j, trousers P, shoes b, scooter g/G, wheels W/w, light L, rear light R. */
const RIDER = [
  '......kkkkk.......',
  '.....kHHHHHk......',
  '....kHHHHHHHk.....',
  '....kHHHHHHhk.....',
  '....ksssssssk.....',
  '....kskssssSk.....',
  '....kssssssSk.....',
  '.....kkssSSk......',
  '......kSSSk.......',
  '.....kJJJJJk......',
  '.kk.kJJJJJJJk.....',
  'kgsJJJJJJJJjk.....',
  'Lgk.kJJJJJJjk.....',
  'kgk.kJJJJJJjk.....',
  'kgk.kjjjjjjjk.....',
  'kgk..kPPPPPk......',
  'kgk..kPPkPPk......',
  'kgk..kPPkPPk......',
  'kgk..kPPkPPk......',
  'kgk..kPPkPPk......',
  'kgk.kbbbkbbbk.....',
  'kgkkkkkkkkkkkkkkk.',
  'kgGGGGGGGGGGGGGGRk',
  'kkkkkkkkkkkkkkkkkk',
  'kWwWk.......kWwWk.',
  '.kkk.........kkk..',
];
/** Rows of the rider alone (no scooter), for the tumble. */
const RIDER_ONLY = RIDER.slice(0, 20).map((row) => '...' + row.slice(3));
const RIDER_PALETTE = {
  k: K,
  H: '#ff8a1e',
  h: '#c25e0c',
  s: '#f0c08a',
  S: '#c98d5c',
  J: '#3e6fd6',
  j: '#2b4f9e',
  P: '#2c2f3a',
  b: '#f4f1ea',
  g: '#6c7480',
  G: '#c9d2db',
  W: '#1e2024',
  w: '#8d96a2',
  L: '#fff3a0',
  l: '#a89a52',
  R: '#e8322c',
  o: '#8a2a2a',
};
const dimLight = (rows: string[]) => rows.map((r) => r.replace('L', 'l'));
/** Wheels turned: hub and tyre swap. */
const rolled = (rows: string[]) => rows.map((r, i) => (i === RIDER.length - 2 ? r.replace(/W/g, '*').replace(/w/g, 'W').replace(/\*/g, 'w') : r));
/** Bumped into: a surprised round mouth. */
const surprised = (rows: string[]) => rows.map((r, i) => (i === 7 ? '.....kossSSk......' : r));
/** Frames: 0 / 1 riding (headlight blinking, wheels turning), 2 bumped. */
const SCOOTER = sprite(RIDER_PALETTE, [RIDER, rolled(dimLight(RIDER)), surprised(RIDER)]);
const RIDER_LYING = sprite(RIDER_PALETTE, [lyingDown(RIDER_ONLY)]);
const RIDER_SIT = sprite({ ...SIT_BASE, H: RIDER_PALETTE.H, T: RIDER_PALETTE.J, t: RIDER_PALETTE.j, P: RIDER_PALETTE.P, b: RIDER_PALETTE.b }, SITTING);
/** The scooter lying on the street after its rider fell off. */
const FALLEN_SCOOTER = sprite(RIDER_PALETTE, [['.kWk.........kWk..', 'kkkkkkkkkkkkkkkkkk', 'kgGGGGGGGGGGGGGGRk', 'kkkkkkkkkkkkkkkkkk']]);
/** The rider's body (columns 5-11 of RIDER) lies over the person's collision box (catalogue box x 3..9). */
const RIDER_DX = -2;
/** Ticks per headlight blink / wheel turn. */
const BLINK_TICKS = 8;

function drawScooter(g: CanvasRenderingContext2D, e: Entity, x: number, frame: number, time: number): void {
  if (typeof e.data?.stompedAt === 'number') {
    FALLEN_SCOOTER.draw(g, 0, x + 6, GROUND_Y - FALLEN_SCOOTER.height);
    drawFallen(g, RIDER_LYING, RIDER_SIT, x - 4, time - e.data.stompedAt);
    return;
  }
  const bumped = e.done && e.data?.hit === true;
  SCOOTER.draw(g, bumped ? 2 : Math.floor(frame / BLINK_TICKS) % 2, x + RIDER_DX, GROUND_Y - SCOOTER.height);
}

/** Light blue-grey pigeons with white wing bars and a green neck sheen, so they stand out from hedges and pavement. */
const PIGEON_PALETTE = { k: K, G: '#b4bccb', g: '#7d8697', d: '#6a7389', n: '#6fbf98', W: '#f2f4f7', e: '#ff7a3a', b: '#efe6d6', o: '#ef7f62' };
/** A pigeon on the street facing left: 0 head up, 1 pecking. */
const PIGEON = sprite(PIGEON_PALETTE, [
  ['..kkk.....', '.kdddk....', 'bdedk.....', '.kdnnkk...', '..knGGGkk.', '..kGWWGGgk', '..kGGWWGgk', '...kkGGgkk', '....o.o...'],
  ['..........', '..........', '....kkkk..', '..kkGGGGk.', '.kdnGWWGgk', 'kdenGGWWgk', 'bdkkGGGGgk', '.k..kkkkkk', '....o.o...'],
]);
/** A pigeon flying up and away: 0 wings up, 1 wings down. */
const FLYING = sprite(PIGEON_PALETTE, [
  ['.kk.....kk.', 'kWGk...kGWk', '.kWGk.kGWk.', '..kGGGGGk..', 'bddGGGGGgk.', '.kkkGGGgkk.', '....kkk....'],
  ['...........', '..kkkkkkk..', 'bddGGGGGgk.', '.kGGGGGGGk.', 'kGWk...kWGk', 'kWk.....kWk', 'kk.......kk'],
]);
/** Where the three pigeons of a flock sit (x within its PIGEONS.w). */
const BIRD_X = [0, 8, 16];
/** Take-off: each bird flies ahead (px/s) and up (px/s, plus px/s² of climbing), a little differently. */
const FLY_AHEAD = 34;
const FLY_UP = 38;
const FLY_CLIMB = 70;
const FLAP_HZ = 14;

function drawPigeons(g: CanvasRenderingContext2D, e: Entity, x: number, frame: number, time: number): void {
  const flushed = e.data?.flushedAt;
  for (let i = 0; i < BIRD_X.length; i++) {
    const bx = x + BIRD_X[i]!;
    if (typeof flushed !== 'number') {
      // Pecking now and then, each to its own beat.
      const peck = Math.floor((frame + i * 23) / 18) % 3 === 0 ? 1 : 0;
      PIGEON.draw(g, peck, bx, GROUND_Y - PIGEON.height);
      continue;
    }
    const t = time - flushed;
    const fx = Math.round(bx + (FLY_AHEAD + 10 * i) * t);
    const fy = Math.round(GROUND_Y - FLYING.height - 2 - (FLY_UP + 8 * i) * t - FLY_CLIMB * t * t);
    if (fy + FLYING.height < 0) continue;
    FLYING.draw(g, Math.floor(t * FLAP_HZ + i) % 2, fx, fy);
  }
}

/** Draws `e` if it is a hazard (at screen x `x`, already less the scroll lead); false otherwise. */
export function drawHazard(g: CanvasRenderingContext2D, e: Entity, x: number, frame: number, time: number): boolean {
  if (isScooter(e)) drawScooter(g, e, x, frame, time);
  else if (isPigeons(e)) drawPigeons(g, e, x, frame, time);
  else return false;
  return true;
}
