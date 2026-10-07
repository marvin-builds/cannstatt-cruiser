/**
 * People obstacles (catalogue `motion`): VfB fans in red and white (scarf and
 * jersey with the red chest band, no crest) and tipsy Wasen visitors in
 * Lederhosen or Dirndl with a Maßkrug. All face left, towards the skater,
 * have a dark outline like the other obstacles and are about the skater's
 * height. After a crash they react kindly: fans cheer with both arms up,
 * visitors spill some beer. Sizes match catalogue.ts (checked by art.test.ts).
 */
import { PLAYER_X } from '../core/config';
import { type Sprite, sprite } from '../core/sprite';
import type { Entity } from '../types';
import { anchorOf, motionOf, motionOffset } from './motion';

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
  kwwwwwwwwwwk
  kwrrrrrrrrwk
  kwRRRRRRRRwk
  kskwwwwwwksk
  kkkwwwwwwkkk
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

const FAN_PALETTE = { k: K, ...SKIN, o: '#8a2a2a', h: '#5a3a22', r: '#d8202c', R: '#9a1420', w: '#f4f1ea', j: '#3a4f7a', b: '#2a2a2e' };
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
};
/** Per outfit, frames: 0 upright, 1 leaning, 2 spilling. */
const GUESTS = [LEDERHOSEN, DIRNDL].map((art) => sprite(GUEST_PALETTE, [art, lean(art), spill(art)]));

/** Street pixels per walking step of a fan. */
const STEP_LENGTH = 6;

function hit(e: Entity): boolean {
  return e.done && e.data?.hit === true;
}

export function drawPerson(g: CanvasRenderingContext2D, e: Entity): void {
  const x = Math.round(e.x);
  const y = Math.round(e.y);
  if (e.kind === 'vfbFan') {
    // The legs swing with the distance walked, so the steps match the motion.
    const walked = Math.max(0, Math.floor((e.x - anchorOf(e)) / STEP_LENGTH));
    FAN.draw(g, hit(e) ? 2 : walked % 2, x, y);
    return;
  }
  const outfit = GUESTS[Number(e.data?.variant ?? 0) % GUESTS.length]!;
  const m = motionOf(e);
  const leaning = !!m && motionOffset({ ...m, walk: 0 }, anchorOf(e) - PLAYER_X) > 0;
  outfit.draw(g, hit(e) ? 2 : leaning ? 1 : 0, x, y);
}

export function personSize(kind: 'vfbFan' | 'wasenGuest'): { w: number; h: number } {
  const s: Sprite = kind === 'vfbFan' ? FAN : GUESTS[0]!;
  return { w: s.width, h: s.height };
}
