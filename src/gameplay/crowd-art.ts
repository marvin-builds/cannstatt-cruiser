/**
 * Art of the fan crowds (ROADMAP 76, crowd.ts), palette sprites with the dark
 * outline of the other people, readable at 1x on a phone:
 * - VfB fans: the people-art fan in red and white, chanting in a wave (arms
 *   up, arms down, one seat after the other), every other one holding a
 *   red-and-white scarf up over the head; the banner seat waves a white flag
 *   with the red chest band (no crest);
 * - Wasen visitors: Lederhosen and Dirndl with a Lebkuchenherz around the
 *   neck (never a Maßkrug), swaying together (schunkeln); the banner seat
 *   holds up a big Lebkuchenherz on a stick in the back hand, above the heads.
 * Behind every gap between two front fans stands a smaller, shaded fan of
 * the second row (drawn first, so the front row covers it): the row reads as
 * one crowd. Only the front fans collide; their heads are the bounce
 * targets, all at the same height. Stomped or bumped fans fall, sit and
 * laugh like any person (people-art.ts drawPerson). Same in kid mode.
 */
import { GROUND_Y } from '../core/config';
import type { Entity } from '../types';
import { crowdOf } from './crowd-tag';
import { drawPerson, FAN, guestLook } from './people-art';
import { sprite } from './sprites';

const K = '#1a1418';

/** Seconds per chant step (VfB arms up / down) and per sway (Wasen). */
const CHANT_PERIOD = 0.5;
const SWAY_PERIOD = 0.6;

/** A red and white scarf held up between both hands (FAN cheer frame: hands at columns 0-1 and 10-11 of row 0). */
const SCARF = sprite({ k: K, r: '#d8202c', w: '#f4f1ea' }, [['kkkkkkkkkkkk', 'krrwwrrwwrrk', 'kkkkkkkkkkkk']]);

/** Flag cloth (white, red chest band) on a pole in the last column; frame 1 ripples. */
const FLAG_CLOTH = [
  'kkkkkkkkkkkkk',
  'kwwwwwwwwwwwk',
  'kwwwwwwwwwwwk',
  'krrrrrrrrrrrk',
  'kRRRRRRRRRRRk',
  'kwwwwwwwwwwwk',
  'kwwwwwwwwwwwk',
  'kkkkkkkkkkkkk',
];
const POLE_ROWS = 14;
/** The flag's left half one pixel lower: a ripple in the wind. */
function ripple(rows: string[]): string[] {
  return rows.map((_, y) => {
    const here = rows[y]!;
    const above = rows[y - 1] ?? '.'.repeat(here.length);
    return above.slice(0, 6) + here.slice(6);
  }).concat([rows[rows.length - 1]!.slice(0, 6) + '.'.repeat(rows[0]!.length - 6)]);
}
const poled = (cloth: string[], rows: number) => [...cloth, ...Array.from({ length: rows }, () => '.'.repeat(cloth[0]!.length - 1) + 'k')];
const FLAG = sprite({ k: K, w: '#f4f1ea', r: '#d8202c', R: '#9a1420' }, [poled([...FLAG_CLOTH, '.'.repeat(13)], POLE_ROWS), poled(ripple(FLAG_CLOTH), POLE_ROWS)]);

/** A big Lebkuchenherz on a stick: brown heart, white icing edge, pink and white sugar dots. */
const HEART_SIGN = sprite({ k: K, H: '#a0582a', h: '#7a3e1a', w: '#f4f1ea', p: '#f0a0b8', s: '#9a6438' }, [
  [
    '.kkk...kkk.',
    'kwwwk.kwwwk',
    'kwHHwkwHHwk',
    'kwHpHwHpHwk',
    'kwHHHHHHHwk',
    '.kwHwpwHwk.',
    '..kwHHHwk..',
    '...kwHwk...',
    '....kwk....',
    '.....k.....',
    ...Array.from({ length: 12 }, () => '....ksk....'),
  ],
]);
/** Column of the sign's stick, and the visitors' back hand (Lederhosen and Dirndl art: row 10, columns 10-11). */
const STICK_COL = 5;
const BACK_HAND = { x: 10, y: 10 };

/** Second-row fans (shaded, a bit shorter), 8 wide, standing on the street. */
const BACK_FAN = sprite({ k: '#2a2226', h: '#4a3020', s: '#b88c62', r: '#a01820', w: '#c8c4bc', j: '#2c3b5c' }, [
  [
    '..kkkk..',
    '.khhhhk.',
    '.kssssk.',
    '.kssssk.',
    '..kssk..',
    'krwrwrwk',
    'kwrwrwrk',
    'krrrrrrk',
    'kwwwwwwk',
    'kwwwwwwk',
    'kwwwwwwk',
    '.kwwwwk.',
    '.kjjjjk.',
    '.kjjjjk.',
    '.kjjkjk.',
    '.kjjkjk.',
    '.kjjkjk.',
    '.kjjkjk.',
    '.kjjkjk.',
    '.kkkkkk.',
  ],
]);
const BACK_GUEST = sprite({ k: '#2a2226', G: '#2f4a2c', s: '#b88c62', c: '#c8c4bc', C: '#962830', L: '#5c3a1c', y: '#c4a848', B: '#8a2830' }, [
  [
    '..kkkk..',
    '.kGGGGk.',
    'kkkkkkkk',
    '.kssssk.',
    '.kssssk.',
    '..kssk..',
    'kcCcCcck',
    'kcLcCLck',
    'kcLcCLck',
    'kLLLLLLk',
    'kLLLLLLk',
    '.kLLLLk.',
    '.kLLkLk.',
    '.kssksk.',
    '.kssksk.',
    '.kssksk.',
    '.kccckk.',
    '.kccckk.',
    '.kkkkkk.',
  ],
]);

function struck(e: Entity): boolean {
  return typeof e.data?.stompedAt === 'number' || e.data?.hit === true;
}

/** The second-row fan in the gap left of a front fan (seat 1 on), when the gap has room for one. */
function drawBackRow(g: CanvasRenderingContext2D, e: Entity, x: number): void {
  const seat = Number(e.data?.seat ?? 0);
  const gap = Number(e.data?.gap ?? 0);
  const back = crowdOf(e) === 'vfb' ? BACK_FAN : BACK_GUEST;
  const free = gap - e.w;
  if (seat < 1 || free < back.width) return;
  back.draw(g, 0, x - Math.round((free + back.width) / 2), GROUND_Y - back.height);
}

/**
 * Draws a fan of a crowd at integer screen x `x` (people-art.ts draws
 * everyone else). Returns false for anyone who is not in a crowd.
 */
export function drawCrowdFan(g: CanvasRenderingContext2D, e: Entity, x: number, time: number, kidMode: boolean, lead: number): boolean {
  const theme = crowdOf(e);
  if (!theme) return false;
  drawBackRow(g, e, x);
  if (struck(e)) {
    drawPerson(g, e, time, kidMode, lead);
    return true;
  }
  const y = Math.round(e.y);
  const seat = Number(e.data?.seat ?? 0);
  const banner = e.data?.banner === true;
  if (theme === 'vfb') {
    // The chant runs along the row: arms up for one step, down for the next, a seat later each.
    const up = banner || Math.floor(time / CHANT_PERIOD + seat * 0.5) % 2 === 0;
    FAN.draw(g, up ? 2 : 1, x, y);
    if (banner) FLAG.draw(g, Math.floor(time / CHANT_PERIOD), x + 11 - (FLAG.width - 1), y - FLAG.height + 1);
    else if (up && Number(e.data?.variant ?? 0) === 0) SCARF.draw(g, 0, x, y - SCARF.height + 1);
    return true;
  }
  // Schunkeln: the whole row sways together.
  const look = guestLook(e, 'gingerbread');
  look.draw(g, Math.floor(time / SWAY_PERIOD) % 2, x, y);
  if (banner) HEART_SIGN.draw(g, 0, x + BACK_HAND.x - STICK_COL, y + BACK_HAND.y + 1 - HEART_SIGN.height);
  return true;
}
