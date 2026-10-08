/**
 * NorDIY decor behind the park line (laid out by layoutDecor in ../park.ts):
 * the concrete floor with weeds, the crowd chilling on a pallet sofa with a
 * boombox and two more at a cable spool table (bottles from crowdBottles: lemonade in kid mode; arms up while
 * CrowdCheer says so), the ramp under construction (wooden formwork, someone
 * smoothing fresh concrete, wheelbarrow, small mixer), someone skating a bank
 * and a small tree. Everything stands a little behind the street plane
 * (feet at FEET) and is painted once; animation picks pre-rendered frames.
 */
import { GROUND_Y } from '../../core/config';
import { type BottleLook, type CrowdCheer, crowdBottles } from '../crowd';
import { type DecorSlot, parkX } from '../park';
import { lazyCanvas, noise, type Painter } from './paint';

/** View row the decor stands on (on the park floor, just behind the riding line). */
const FEET = GROUND_Y - 3;
const FLOOR = { top: '#cfccc3', base: '#b5b2a9', joint: '#8f8c84' } as const;
const GREEN = { dark: '#3f6b35', base: '#5e9445', light: '#8cc063' } as const;
const WOOD = { base: '#b88a52', light: '#d6a96a', shade: '#8c6538', dark: '#5e4426' } as const;
const CONCRETE = { light: '#d2cfc6', base: '#b3b0a7', shade: '#94918a', wet: '#8a8a88', wetLight: '#a3a3a0' } as const;
const K = '#1f1a1c';

interface Look {
  skin: string;
  hair: string;
  shirt: string;
  pants: string;
}

const CROWD: readonly Look[] = [
  { skin: '#e0b48f', hair: '#3b2a20', shirt: '#e2574c', pants: '#3e4f6e' },
  { skin: '#9a6a48', hair: '#1f1a1a', shirt: '#f2c94c', pants: '#2f3a33' },
  { skin: '#f0c9a8', hair: '#d9a441', shirt: '#4fa3d9', pants: '#54485e' },
  { skin: '#c8956b', hair: '#7a3b2a', shirt: '#9b6bd9', pants: '#3a3f4a' },
  { skin: '#7a5238', hair: '#141212', shirt: '#4fbf8f', pants: '#5a4a3a' },
];
/** Who sits (on the pallet sofa): the first two; the others stand. */
const SITTING = 2;
const WORKER: Look = { skin: '#d9a77f', hair: '#6b4a2f', shirt: '#ff8c2e', pants: '#3a4a5c' };
const SKATER: Look = { skin: '#c48e66', hair: '#2a2020', shirt: '#7bd389', pants: '#2e3440' };

/** Crowd people's x in the crowd slot (two on the sofa, one standing beside it), then at the spool table. */
const CROWD_X = [10, 20, 34] as const;
const SPOOL_X = [0, 22] as const;
/** The first person at the spool table (index into the crowd). */
const SPOOL_FIRST = CROWD_X.length;
const PERSON_W = 14;
const PERSON_H = 30;

/** Pre-rendered crowd people: [person][kid mode 0/1][arms up 0/1]. */
const people = CROWD.map((look, i) =>
  [false, true].map((kid) => {
    const bottles = crowdBottles(kid);
    const bottle = bottles[i % bottles.length]!;
    return [false, true].map((up) => lazyCanvas(PERSON_W, PERSON_H, (p) => paintPerson(p, look, bottle, i < SITTING, up)));
  }),
);

const sofa = lazyCanvas(36, 20, paintSofa);
const boombox = [0, 1].map((f) => lazyCanvas(10, 8, (p) => paintBoombox(p, f)));
const build = lazyCanvas(74, 24, paintBuild);
const worker = [0, 1].map((f) => lazyCanvas(16, 18, (p) => paintWorker(p, f)));
const mixer = [0, 1, 2].map((f) => lazyCanvas(16, 18, (p) => paintMixer(p, f)));
const bank = lazyCanvas(40, 15, paintSkateBank);
const skater = lazyCanvas(8, 14, paintSkater);
const tree = lazyCanvas(18, 36, paintTree);
const spool = lazyCanvas(18, 13, paintSpool);

export function warmDecor(): void {
  for (const person of people) for (const mode of person) for (const pose of mode) pose();
  for (const c of [sofa, build, bank, skater, tree, spool, ...boombox, ...worker, ...mixer]) c();
}

/** The park's concrete floor between screen x `from` and `to`, with joints and weeds that move with it. */
export function drawFloor(g: CanvasRenderingContext2D, from: number, to: number): void {
  g.fillStyle = FLOOR.base;
  g.fillRect(from, FEET - 2, to - from, GROUND_Y - FEET + 2);
  g.fillStyle = FLOOR.top;
  g.fillRect(from, FEET - 2, to - from, 1);
  for (let x = from + 23; x < to; x += 29) {
    g.fillStyle = FLOOR.joint;
    g.fillRect(x, FEET - 1, 1, GROUND_Y - FEET + 1);
    // Weeds growing from some joints.
    if (noise(x - from, 1, 2) < 0.5) continue;
    g.fillStyle = GREEN.base;
    g.fillRect(x - 1, FEET - 4, 1, 3);
    g.fillRect(x + 1, FEET - 5, 1, 4);
    g.fillStyle = GREEN.light;
    g.fillRect(x, FEET - 3, 1, 2);
  }
}

/** Draws every decor slot at its run distance (like the pieces), animated by `time`. */
export function drawDecor(
  g: CanvasRenderingContext2D,
  slots: readonly DecorSlot[],
  distance: number,
  lead: number,
  time: number,
  crowd: CrowdCheer,
  kidMode: boolean,
): void {
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    const x = parkX(slot.at, distance, lead);
    if (slot.item === 'crowd') drawCrowd(g, x, time, crowd, kidMode);
    else if (slot.item === 'build') drawBuild(g, x, time);
    else if (slot.item === 'skater') drawSkateBank(g, x, time);
    else if (slot.item === 'spool') drawSpool(g, x, crowd, kidMode);
    else g.drawImage(tree(), x, FEET - 36 + 1);
  }
}

function drawCrowd(g: CanvasRenderingContext2D, x: number, time: number, crowd: CrowdCheer, kidMode: boolean): void {
  g.drawImage(sofa(), x, FEET - 20 + 1);
  g.drawImage(boombox[Math.floor(time * 4) % 2]!(), x + 1, FEET - 17);
  for (let i = 0; i < CROWD_X.length; i++) drawPerson(g, i, x + CROWD_X[i]!, crowd, kidMode);
}

/** Two people standing at a cable spool used as a table. */
function drawSpool(g: CanvasRenderingContext2D, x: number, crowd: CrowdCheer, kidMode: boolean): void {
  g.drawImage(spool(), x + 10, FEET - 13 + 1);
  for (let i = 0; i < SPOOL_X.length; i++) drawPerson(g, SPOOL_FIRST + i, x + SPOOL_X[i]!, crowd, kidMode);
}

function drawPerson(g: CanvasRenderingContext2D, who: number, x: number, crowd: CrowdCheer, kidMode: boolean): void {
  g.drawImage(people[who]![kidMode ? 1 : 0]![crowd.armsUp(who) ? 1 : 0]!(), x, FEET - PERSON_H + 1);
}

function drawBuild(g: CanvasRenderingContext2D, x: number, time: number): void {
  g.drawImage(build(), x, FEET - 24 + 1);
  g.drawImage(worker[Math.floor(time * 3) % 2]!(), x + 28, FEET - 18 + 1);
  g.drawImage(mixer[Math.floor(time * 6) % 3]!(), x + 58, FEET - 18 + 1);
}

/** Someone rolling up and down the background bank (one lap every 4 s). */
function drawSkateBank(g: CanvasRenderingContext2D, x: number, time: number): void {
  g.drawImage(bank(), x, FEET - 15 + 1);
  const t = (time / 4) % 1;
  const along = 0.5 - 0.5 * Math.cos(t * 2 * Math.PI);
  const sx = Math.round(2 + along * 30);
  g.drawImage(skater(), x + sx, FEET - 14 + 1 - bankHeight(sx + 4));
}

/** Height of the background bank's surface at local x (slopes up, flat top, slopes down). */
function bankHeight(x: number): number {
  if (x < 12) return Math.round((x / 12) * 10);
  if (x < 28) return 10;
  return Math.max(0, Math.round(((40 - x) / 12) * 10));
}

/** A person (feet on the bottom row), standing or sitting (thighs forward), bottle held low or raised. */
function paintPerson(p: Painter, look: Look, bottle: BottleLook, sitting: boolean, up: boolean): void {
  const b = PERSON_H - 1;
  const hip = sitting ? b - 8 : b - 9;
  const shoulder = hip - 7;
  const head = shoulder - 6;
  // Legs.
  if (sitting) {
    p.rect(look.pants, 3, hip - 1, 9, 3);
    p.rect(look.pants, 10, hip + 2, 2, b - hip - 2);
    p.rect(K, 10, b, 4, 1);
  } else {
    p.rect(look.pants, 4, hip, 2, b - hip);
    p.rect(look.pants, 7, hip, 2, b - hip);
    p.rect(K, 3, b, 3, 1);
    p.rect(K, 7, b, 3, 1);
  }
  // Torso, back arm, head.
  p.rect(look.shirt, 3, shoulder, 6, hip - shoulder);
  p.rect(look.shirt, 2, shoulder + 1, 1, 4);
  p.px(look.skin, 2, shoulder + 5);
  p.rect(look.skin, 4, head + 1, 5, 5);
  p.rect(look.hair, 4, head, 5, 2);
  p.px(look.hair, 4, head + 2);
  p.px(K, 7, head + 3);
  // Front arm and bottle.
  if (up) {
    p.rect(look.shirt, 9, shoulder - 1, 1, 2);
    p.rect(look.skin, 10, head - 3, 1, shoulder - head + 3);
    paintBottle(p, 10, head - 8, bottle);
    p.px(look.skin, 9, head - 3);
  } else {
    p.rect(look.shirt, 9, shoulder, 1, 3);
    p.rect(look.skin, 10, shoulder + 2, 1, 3);
    paintBottle(p, 11, shoulder, bottle);
  }
}

/** A 2 x 6 bottle with its top at (x, y): cap, neck, label, drink. */
function paintBottle(p: Painter, x: number, y: number, bottle: BottleLook): void {
  p.px(bottle.glass, x, y);
  p.px(bottle.glass, x, y + 1);
  p.rect(bottle.drink, x, y + 2, 2, 4);
  p.rect(bottle.label, x, y + 3, 2, 1);
  p.px(bottle.glass, x + 1, y + 2);
}

/** Two pallets as the seat, one upright as the backrest, cushions on top. */
function paintSofa(p: Painter): void {
  const pallet = (y: number, h: number) => {
    p.rect(WOOD.base, 0, y, 36, h);
    p.rect(WOOD.light, 0, y, 36, 1);
    for (let x = 0; x < 36; x += 6) p.rect(WOOD.dark, x + 4, y + 1, 2, h - 2);
    p.rect(WOOD.shade, 0, y + h - 1, 36, 1);
  };
  // Backrest planks.
  for (let x = 2; x < 34; x += 4) {
    p.rect(WOOD.base, x, 0, 3, 11);
    p.px(WOOD.light, x, 0);
    p.rect(WOOD.shade, x + 2, 1, 1, 10);
  }
  p.rect(WOOD.shade, 1, 3, 34, 1);
  pallet(12, 4);
  pallet(16, 4);
  // Cushions.
  p.rect('#5a9e8f', 9, 10, 12, 2);
  p.rect('#d9707a', 22, 10, 11, 2);
}

function paintBoombox(p: Painter, frame: number): void {
  p.rect('#3a3d44', 0, 2, 10, 6);
  p.rect('#9a9fa6', 2, 0, 6, 1);
  p.px('#9a9fa6', 2, 1);
  p.px('#9a9fa6', 7, 1);
  const r = frame === 0 ? '#6b7079' : '#878d96';
  p.rect(r, 1, 3, 3, 3);
  p.rect(r, 6, 3, 3, 3);
  p.px(K, 2, 4);
  p.px(K, 7, 4);
  p.px('#7bd389', 4, 3 + frame);
}

/** Sand pile with a shovel, wheelbarrow with concrete, the formwork ramp half filled. */
function paintBuild(p: Painter): void {
  const b = 23;
  // Sand pile and shovel.
  p.profile('#d9b977', 0, 11, b + 1, (c) => b - 5 * Math.sin(((c + 0.5) / 11) * Math.PI));
  p.line(WOOD.dark, 7, b - 12, 5, b - 4);
  p.rect('#8d96a2', 4, b - 4, 3, 2);
  // Wheelbarrow: tub, wheel, handles.
  p.profile('#4f8a5a', 11, 14, b - 3, (c) => b - 9 + (c < 2 ? 2 - c : 0));
  p.rect(CONCRETE.wet, 13, b - 10, 10, 1);
  p.rect('#3c6b46', 11, b - 4, 14, 1);
  p.disc(K, 13, b - 1, 1);
  p.line(WOOD.dark, 24, b - 7, 28, b - 4);
  p.line(K, 22, b - 3, 22, b);
  // Formwork ramp: plywood side boards rising to the right, stakes, fresh concrete inside.
  const x0 = 30;
  const w = 26;
  const curve = (c: number) => b - Math.round(15 * Math.pow((c + 1) / w, 1.5));
  p.profile(CONCRETE.wet, x0, w, b + 1, curve);
  for (let c = 0; c < 12; c++) p.px(CONCRETE.wetLight, x0 + c, curve(c));
  for (let c = 12; c < w; c++) {
    p.px(WOOD.light, x0 + c, curve(c));
    p.px(WOOD.light, x0 + c, curve(c) - 1);
  }
  p.rect(WOOD.base, x0 + 10, b - 3, w - 10, 4);
  p.rect(WOOD.shade, x0 + 10, b - 3, w - 10, 1);
  p.rect(WOOD.base, x0 + w, b - 16, 2, 17);
  p.rect(WOOD.dark, x0 + w + 1, b - 16, 1, 17);
  for (const sx of [x0 + 14, x0 + 21]) p.rect(WOOD.dark, sx, b - 6, 1, 7);
  p.rect(WOOD.light, x0 + w - 1, b - 17, 4, 1);
}

/** Kneeling worker smoothing the fresh concrete with a trowel (two frames). */
function paintWorker(p: Painter, frame: number): void {
  const look = WORKER;
  const b = 17;
  p.rect(look.pants, 2, b - 3, 7, 3);
  p.rect(look.pants, 2, b - 6, 3, 3);
  p.rect(look.shirt, 2, b - 11, 6, 6);
  p.rect('#ffd23f', 3, b - 9, 4, 1);
  p.rect(look.skin, 4, b - 16, 4, 4);
  p.rect('#ffd23f', 3, b - 17, 6, 2);
  const reach = frame === 0 ? 0 : 3;
  p.rect(look.skin, 8, b - 9, 3 + reach, 1);
  p.rect('#8d96a2', 10 + reach, b - 7, 4, 1);
  p.px(K, 11 + reach, b - 8);
}

/** Small orange concrete mixer: tilted drum on a stand with a wheel; the drum's stripes turn. */
function paintMixer(p: Painter, frame: number): void {
  p.line('#5d646e', 3, 17, 7, 9);
  p.line('#5d646e', 12, 17, 8, 9);
  p.disc(K, 12, 16, 1);
  p.ellipse('#e8742a', 8, 7, 6, 5);
  p.ellipse('#c55a1c', 9, 9, 4, 2);
  for (let i = 0; i < 3; i++) {
    const sx = 3 + ((i * 4 + frame * 2) % 11);
    p.rect('#f39a52', sx, 4 + (sx > 8 ? 1 : 0), 1, 5);
  }
  p.ellipse('#3a3734', 3, 3, 2, 2);
  p.px(CONCRETE.wet, 3, 3);
}

/** A smooth concrete bank in the background: up, flat top, down (with a coping line). */
function paintSkateBank(p: Painter): void {
  p.profile(CONCRETE.base, 0, 40, 15, (c) => 14 - bankHeight(c));
  for (let c = 0; c < 40; c++) p.px(CONCRETE.light, c, 14 - bankHeight(c));
  p.rect(CONCRETE.shade, 28, 5, 12, 1);
  p.rect(CONCRETE.shade, 0, 14, 40, 1);
}

/** The small background skater on a board (bottom row = the board). */
function paintSkater(p: Painter): void {
  const look = SKATER;
  p.rect(look.pants, 2, 8, 2, 4);
  p.rect(look.pants, 5, 9, 2, 3);
  p.rect(look.shirt, 2, 4, 4, 4);
  p.px(look.skin, 1, 5);
  p.px(look.skin, 6, 4);
  p.rect(look.skin, 3, 1, 3, 3);
  p.rect(look.hair, 3, 0, 3, 1);
  p.rect('#d9707a', 0, 12, 8, 1);
  p.px(K, 1, 13);
  p.px(K, 6, 13);
}

/** A wooden cable spool standing on end as a table: top disc, drum, bottom disc. */
function paintSpool(p: Painter): void {
  p.rect(WOOD.base, 0, 0, 18, 2);
  p.rect(WOOD.light, 0, 0, 18, 1);
  p.rect(WOOD.shade, 4, 2, 10, 9);
  p.rect(WOOD.dark, 4, 4, 10, 1);
  p.rect(WOOD.dark, 4, 8, 10, 1);
  p.rect(WOOD.base, 0, 11, 18, 2);
  p.rect(WOOD.dark, 0, 12, 18, 1);
}

/** A small tree with a round, dappled crown. */
function paintTree(p: Painter): void {
  p.rect(WOOD.shade, 8, 16, 2, 20);
  p.rect(WOOD.dark, 9, 18, 1, 18);
  p.line(WOOD.shade, 9, 20, 13, 15);
  p.disc(GREEN.dark, 9, 10, 8);
  p.disc(GREEN.base, 8, 9, 7);
  for (let y = 2; y < 18; y++) {
    for (let x = 1; x < 17; x++) {
      if ((x - 9) ** 2 + (y - 10) ** 2 >= 49) continue;
      const n = noise(x, y, 21);
      if (n < 0.12) p.px(GREEN.light, x, y);
      else if (n > 0.9) p.px(GREEN.dark, x, y);
    }
  }
  p.disc(GREEN.light, 6, 6, 2);
}
