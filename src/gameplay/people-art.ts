/**
 * People obstacles (catalogue `motion`): VfB fans in red and white (scarf and
 * jersey with the red chest band, no crest) with a football under the arm,
 * and tipsy Wasen visitors in Lederhosen or Dirndl holding their item
 * (items.ts): a Maßkrug or a Brezel, in kid mode a Lebkuchenherz around the
 * neck instead of the Maßkrug. All face left, towards the skater, have a dark
 * outline like the other obstacles and are about the skater's height. After a
 * crash they react kindly: fans cheer with both arms up, visitors spill some
 * beer. After a stomp they tumble onto their back, sit up dazed with stars
 * circling their head and then laugh. Sizes match catalogue.ts (art.test.ts).
 */
import { GROUND_Y, PLAYER_X } from '../core/config';
import { type Sprite, sprite } from '../core/sprite';
import type { CarriedItem, Entity } from '../types';
import { itemOf } from './items';
import { anchorOf, swayOffset } from './motion';

const K = '#1a1418';
const SKIN = { s: '#f0c08a', S: '#c98d5c' };

function rows(art: string): string[] {
  return art
    .trim()
    .split('\n')
    .map((r) => r.trim());
}

const FAN_HEAD = rows(`
  ....kkkk....
  ...khhhhk...
  ..khhhhhhk..
  ..khssssk...
  ..kskssssk..
  ..kssssssk..
  ...kSsssk...
`);
const FAN_BODY = rows(`
  ..krwrwrwk..
  .kwrwrwrwrk.
  .kwwwwwwwwk.
  .kkkkwwwwwwk
  kwqwkrrrrrwk
  kqqqkRRRRRwk
  kwqwskwwwksk
  .kkkkwwwwkkk
  ..kwwwwwwk..
`);
/** Both arms up: the friendly reaction to being bumped into. */
const FAN_CHEER = rows(`
  ks..kkkk..sk
  kwkkhhhhkkwk
  kwkhhhhhhkwk
  kwkhsssskkwk
  kwksksssskwk
  kwksoossskwk
  kwkkSssskkwk
  kwkrwrwrwkwk
  kwwrwrwrwrwk
  .kwwwwwwwwk.
  ..kwwwwwwk..
  ..krrrrrrk..
  ..kRRRRRRk..
  ..kwwwwwwk..
  ..kwwwwwwk..
  ..kwwwwwwk..
`);
const FAN_STRIDE = rows(`
  ..kjjjjjjk..
  ..kjjjjjjk..
  ..kjjjkjjk..
  .kjjjk.kjjk.
  .kjjk..kjjk.
  .kjjk...kjjk
  kjjk....kjjk
  kjjk....kjjk
  kbbbk...kbbk
  kkkkk...kkkk
`);
const FAN_STEP = rows(`
  ..kjjjjjjk..
  ..kjjjjjjk..
  ..kjjjjjjk..
  ...kjjjjk...
  ...kjjjjk...
  ...kjjkjk...
  ...kjjkjjk..
  ...kjjkjjk..
  ..kbbbkbbk..
  ..kkkkkkkkk.
`);

const FAN_PALETTE = { k: K, ...SKIN, o: '#8a2a2a', h: '#5a3a22', r: '#d8202c', R: '#9a1420', w: '#f4f1ea', j: '#3a4f7a', b: '#2a2a2e', q: '#2a2a2e' };
/** Frames: 0/1 walking, 2 cheering. */
const FAN = sprite(FAN_PALETTE, [
  [...FAN_HEAD, ...FAN_BODY, ...FAN_STRIDE],
  [...FAN_HEAD, ...FAN_BODY, ...FAN_STEP],
  [...FAN_CHEER, ...FAN_STEP],
]);

const LEDERHOSEN = rows(`
  .....kkkk.....
  ....kGGGGkf...
  ...kkkkkkkkk..
  ....kssshhk...
  ....ksksshk...
  ....kpssssk...
  .....kSssk....
  ....kcCcCck...
  ...kcLcCcLck..
  ..kcCLCcCLCck.
  .kmmkLcCcLksk.
  kmFFmkLLLLkk..
  kmYYmklllllk..
  kmYYmkLLLLLk..
  kmmmkkLLkLLk..
  .kkk.kLLkLLk..
  .....kLLkLLk..
  .....kssksk...
  .....kssksk...
  .....kggkggk..
  .....kggkggk..
  .....kggkggk..
  ....kbbkkbbk..
  ....kkk..kkk..
  ..............
  ..............
`);
const DIRNDL = rows(`
  .....kkkk.....
  ....kyyyyk....
  ...kyyyyyyk...
  ...kyssssyk...
  ...ksksssyk...
  ...kpssssyk...
  ....kSsskyk...
  ...kcccccky...
  ..kcBcccBck...
  ..kcBBBBBck...
  .kmmkBBBBksk..
  kmFFmkBBBkk...
  kmYYmkAAAk....
  kmYYmDAAADk...
  kmmmkDAAADk...
  .kkkkDAAADDk..
  ....kDAAADDk..
  ...kDDDDDDDDk.
  ...kkkkkkkkkk.
  .....kssksk...
  .....kssksk...
  .....kwwkwk...
  .....kwwkwk...
  ....kbbkkbbk..
  ....kkk..kkk..
  ..............
`);

/**
 * Paints `patch` over `art` with its top-left at (row, col): '.' keeps the
 * pixel underneath, '_' clears it, anything else replaces it.
 */
function paint(art: string[], row: number, col: number, patch: string[]): string[] {
  return art.map((r, y) => {
    const p = patch[y - row];
    if (p === undefined) return r;
    const chars = [...r];
    [...p].forEach((c, i) => {
      if (c !== '.') chars[col + i] = c === '_' ? '.' : c;
    });
    return chars.join('');
  });
}

/** The Maßkrug's corner (rows 10-15, columns 0-4) without the mug: the hand hangs empty. */
const NO_MUG = ['____k', '___ks', '_____', '_____', '_____', '_____'];
/** A Brezel held low in the front hand. */
const PRETZEL = ['____k', '.PPPs', 'PQPQP', 'P_P_P', '_PPP_', '_____'];
/** A Lebkuchenherz on a string around the neck (7 wide, from the collar down), outlined so it stands out. */
const HEART = ['.k...k.', 'kHHkHHk', 'kHrwrHk', 'kHwrwHk', '.kHHHk.', '..kHk..', '...k...'];

/** Art per item a visitor holds: the Maßkrug is drawn in the base art. */
function withItem(art: string[], item: CarriedItem, heartCol: number): string[] {
  if (item === 'pretzel') return paint(art, 10, 0, PRETZEL);
  if (item === 'gingerbread') return paint(paint(art, 10, 0, NO_MUG), 7, heartCol, HEART);
  return art;
}

/** Rows above this lean with the sway (the legs stay put). */
const LEAN_ROWS = 12;

/** The upper body shifted one pixel to the right: leaning while swaying. */
function lean(art: string[]): string[] {
  return art.map((r, i) => (i < LEAN_ROWS ? `.${r.slice(0, -1)}` : r));
}

/** Beer sloshes out of the Maßkrug: foam gone, a splash of drops flying up in front. */
function spill(art: string[]): string[] {
  const drops: Record<number, string> = { 3: 'F.Y', 4: '.YF', 5: 'Y.Y', 6: '.YY', 7: 'Y.F', 8: 'YY', 9: '.Y' };
  return art.map((r, i) => {
    const row = r.replaceAll('F', 'Y');
    const splash = drops[i];
    return splash ? splash + row.slice(splash.length) : row;
  });
}

const GUEST_PALETTE = {
  k: K,
  ...SKIN,
  p: '#e8828a',
  h: '#6a4a2a',
  y: '#f0d060',
  G: '#3f5a3a',
  f: '#f4f1ea',
  c: '#f4f1ea',
  C: '#c8323c',
  L: '#7a4a24',
  l: '#9a6438',
  g: '#b9b4aa',
  b: '#3a2a20',
  m: '#d8e4e8',
  Y: '#f2b632',
  F: '#fffbe8',
  B: '#b8323c',
  A: '#f0a0b8',
  D: '#2c4a7a',
  w: '#f4f1ea',
  P: '#9a5420',
  Q: '#d89048',
  H: '#a0582a',
  r: '#d8202c',
};
type GuestItem = Exclude<CarriedItem, 'football'>;
const GUEST_ITEMS: GuestItem[] = ['beer', 'pretzel', 'gingerbread'];
/** Per outfit (Lederhosen, Dirndl) and item, frames: 0 upright, 1 leaning, 2 bumped (a Maßkrug spills). */
const GUESTS = [
  { art: LEDERHOSEN, heartCol: 4 },
  { art: DIRNDL, heartCol: 3 },
].map(({ art, heartCol }) => {
  const looks = {} as Record<GuestItem, Sprite>;
  for (const item of GUEST_ITEMS) {
    const a = withItem(art, item, heartCol);
    looks[item] = sprite(GUEST_PALETTE, [a, lean(a), item === 'beer' ? spill(a) : lean(a)]);
  }
  return looks;
});

/** Street pixels per walking step of a fan. */
const STEP_LENGTH = 6;

function hit(e: Entity): boolean {
  return e.done && e.data?.hit === true;
}

/** Draws a person at integer coordinates (`lead`: RenderContext.scrollLead). */
export function drawPerson(g: CanvasRenderingContext2D, e: Entity, time: number, kidMode: boolean, lead = 0): void {
  const x = Math.round(e.x - lead);
  const y = Math.round(e.y);
  if (typeof e.data?.stompedAt === 'number') {
    drawStomped(g, e, x, time - e.data.stompedAt);
    return;
  }
  if (e.kind === 'vfbFan') {
    // The legs swing with the distance walked, so the steps match the motion.
    const walked = Math.max(0, Math.floor((e.x - anchorOf(e)) / STEP_LENGTH));
    FAN.draw(g, hit(e) ? 2 : walked % 2, x, y);
    return;
  }
  const look = GUESTS[outfitOf(e)]![itemOf(e, kidMode) as GuestItem];
  const leaning = swayOffset(e, anchorOf(e) - PLAYER_X) > 0;
  look.draw(g, hit(e) ? 2 : leaning ? 1 : 0, x, y);
}

function outfitOf(e: Entity): number {
  return Number(e.data?.variant ?? 0) % GUESTS.length;
}

export function personSize(kind: 'vfbFan' | 'wasenGuest'): { w: number; h: number } {
  const s: Sprite = kind === 'vfbFan' ? FAN : GUESTS[0]!.beer;
  return { w: s.width, h: s.height };
}

// --- After a stomp: tumble onto the back, sit up dazed, laugh. ---

/** Seconds lying on the back before sitting up. */
const TUMBLE_TIME = 0.35;
/** Seconds of circling stars (dazed) before the laughing starts. */
const DAZED_TIME = 1.4;
/** Seconds per laughing bob. */
const LAUGH_PERIOD = 0.25;

/** The art turned a quarter clockwise: the head ends up on the right (fallen backwards, away from the skater). */
function lyingDown(art: string[]): string[] {
  const h = art.length;
  const w = art[0]!.length;
  return Array.from({ length: w }, (_, x) => Array.from({ length: h }, (_, y) => art[h - 1 - y]![x]).join(''));
}

/** Sitting on the street, legs stretched towards the skater. Frames: 0 dazed (wide eyes), 1 laughing. */
const SITTING = [
  `
  ......kkkk....
  .....kHHHHk...
  ....kHHHHHHk..
  ....kssssssk..
  ....kwkwsssk..
  ....ksssssk...
  ....ksmssk....
  .....kSsk.....
  ....kTTTTk....
  ...kTtTtTTk...
  ..ksTTTTTTk...
  .kbkTTTTTTk...
  kbbkPPPPPPk...
  kbPPPPPPPPk...
  kkkkkkkkkkk...
  `,
  `
  ......kkkk....
  .....kHHHHk...
  ....kHHHHHHk..
  ....kssssssk..
  ....kkskksk...
  ....ksssssk...
  ....kooosk....
  .....kSsk.....
  ....kTTTTk....
  ...kTtTtTTk...
  ..ksTTTTTTk...
  .kbkTTTTTTk...
  kbbkPPPPPPk...
  kbPPPPPPPPk...
  kkkkkkkkkkk...
  `,
];

const SIT_BASE = { k: K, ...SKIN, w: '#ffffff', m: '#8a2a2a', o: '#8a2a2a', b: '#2a2a2e' };
const FAN_SIT = sprite({ ...SIT_BASE, H: '#5a3a22', T: '#f4f1ea', t: '#d8202c', P: '#3a4f7a' }, SITTING);
const GUEST_SIT = [
  sprite({ ...SIT_BASE, H: '#3f5a3a', T: '#f4f1ea', t: '#c8323c', P: '#7a4a24', b: '#3a2a20' }, SITTING),
  sprite({ ...SIT_BASE, H: '#f0d060', T: '#b8323c', t: '#f0a0b8', P: '#2c4a7a', b: '#3a2a20' }, SITTING),
];
const FAN_LYING = sprite(FAN_PALETTE, [lyingDown([...FAN_HEAD, ...FAN_BODY, ...FAN_STEP])]);
/** Lying without the item (it was tossed). */
const GUEST_LYING = [LEDERHOSEN, DIRNDL].map((art) => sprite(GUEST_PALETTE, [lyingDown(paint(art, 10, 0, NO_MUG))]));
const DIZZY = '#ffd84a';

function drawStomped(g: CanvasRenderingContext2D, e: Entity, x: number, since: number): void {
  const fan = e.kind === 'vfbFan';
  if (since < TUMBLE_TIME) {
    const lying = fan ? FAN_LYING : GUEST_LYING[outfitOf(e)]!;
    lying.draw(g, 0, x - 4, GROUND_Y - lying.height);
    return;
  }
  const sitting = fan ? FAN_SIT : GUEST_SIT[outfitOf(e)]!;
  const sy = GROUND_Y - sitting.height;
  if (since < TUMBLE_TIME + DAZED_TIME) {
    sitting.draw(g, 0, x - 2, sy);
    drawDizzyStars(g, x + 6, sy - 2, since);
    return;
  }
  const laughing = Math.floor(since / LAUGH_PERIOD) % 2;
  sitting.draw(g, 1, x - 2, sy - laughing);
}

/** Two tiny stars circling above the head (cx, cy). */
function drawDizzyStars(g: CanvasRenderingContext2D, cx: number, cy: number, t: number): void {
  g.fillStyle = DIZZY;
  for (let i = 0; i < 2; i++) {
    const a = t * 9 + i * Math.PI;
    const sx = Math.round(cx + Math.cos(a) * 5);
    const sy = Math.round(cy + Math.sin(a) * 2);
    g.fillRect(sx - 1, sy, 3, 1);
    g.fillRect(sx, sy - 1, 1, 3);
  }
}
