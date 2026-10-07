import { GROUND_Y } from '../../core/config';
import { FAR, MID, NEAR } from '../palette';
import type { ZoneSpec } from '../scene';
import { CLOUD_LAYER, FAR_FACTOR, MID_FACTOR, NEAR_FACTOR } from './layout';
import { treeCluster } from './city';
import { farHills, hillProp, housesHillProp } from './hills';
import { baseTile, lazyCanvas, noise, type Painter, type Prop, staticProp } from './paint';
import { skyCanvas } from './sky';
import { STREET } from './street';

/** Volksfest colours at mid-layer strength. */
const WASEN = {
  steel: '#aab4bf',
  rim: '#8794a3',
  gondolas: ['#cf6f5e', '#e2b948', '#6f97c9', '#86b26f'],
  tentWhite: '#f1ece0',
  tentBlue: '#6f8fbf',
  tentRed: '#c96a5c',
  tentShade: '#d2cbbb',
  column: '#e2d5bb',
  columnShade: '#c4b596',
  fruit: ['#d0573f', '#e8bd3f', '#7aa64f', '#e38a3a'],
} as const;

const WASEN_W = 212;
const WASEN_H = 104;
const WHEEL = { cx: 40, cy: 44, r: 37, spokes: 10 } as const;

/** Striped beer tent with a peaked roof, `stripe` alternating with white. */
function paintTent(p: Painter, x: number, w: number, h: number, stripe: string): void {
  const bottom = WASEN_H;
  const wallTop = bottom - Math.round(h * 0.45);
  p.rect(WASEN.tentWhite, x, wallTop, w, bottom - wallTop);
  p.rect(WASEN.tentShade, x, wallTop, w, 1);
  p.rect(MID.windowDark, x + Math.floor(w / 2) - 4, bottom - 9, 8, 9);
  for (let i = x + 3; i < x + w - 3; i += 6) p.rect(MID.window, i, wallTop + 3, 3, 3);
  for (let i = 0; i < w; i++) {
    const roofTop = bottom - h + Math.round(Math.abs(i - w / 2) * ((h * 0.55) / (w / 2)) * 0.6);
    p.rect(Math.floor(i / 4) % 2 === 0 ? stripe : WASEN.tentWhite, x + i, roofTop, 1, wallTop - roofTop);
  }
  p.rect(WASEN.tentShade, x + Math.floor(w / 2), bottom - h - 6, 1, 6);
  p.rect(stripe, x + Math.floor(w / 2) + 1, bottom - h - 6, 3, 2);
}

/** Cannstatter Wasen: turning Riesenrad, striped tents and the Fruchtsäule. */
function wasen(): Prop {
  const scenery = lazyCanvas(WASEN_W, WASEN_H, (p) => {
    // Wheel stand (A-frame) behind the wheel.
    for (const dx of [-18, 18]) {
      p.line(WASEN.rim, WHEEL.cx, WHEEL.cy, WHEEL.cx + dx, WASEN_H - 1);
      p.line(WASEN.rim, WHEEL.cx + 1, WHEEL.cy, WHEEL.cx + dx + 1, WASEN_H - 1);
    }
    p.rect(WASEN.rim, WHEEL.cx - 22, WASEN_H - 3, 45, 3);
    paintTent(p, 84, 56, 34, WASEN.tentBlue);
    // Fruchtsäule: fluted column on a pedestal, crowned by a bowl of fruit.
    const fx = 152;
    p.rect(WASEN.columnShade, fx - 5, WASEN_H - 9, 11, 9);
    p.rect(WASEN.column, fx - 5, WASEN_H - 9, 9, 8);
    p.rect(WASEN.column, fx - 2, WASEN_H - 56, 5, 47);
    p.rect(WASEN.columnShade, fx + 2, WASEN_H - 56, 1, 47);
    p.rect(WASEN.columnShade, fx, WASEN_H - 54, 1, 43);
    p.rect(WASEN.column, fx - 4, WASEN_H - 58, 9, 2);
    p.rect(WASEN.columnShade, fx - 5, WASEN_H - 60, 11, 2);
    for (let i = 0; i < 11; i++) p.px(WASEN.fruit[i % 4]!, fx - 5 + i, WASEN_H - 61 - (i % 2));
    for (let i = 0; i < 7; i++) p.px(WASEN.fruit[(i + 2) % 4]!, fx - 3 + i, WASEN_H - 63 + (i % 2));
    for (let i = 0; i < 3; i++) p.px(WASEN.fruit[(i + 1) % 4]!, fx - 1 + i, WASEN_H - 64);
    paintTent(p, 160, 52, 32, WASEN.tentRed);
  });
  const frames = 12;
  const wheels = Array.from({ length: frames }, (_, f) =>
    lazyCanvas(WHEEL.r * 2 + 3, WHEEL.r * 2 + 3, (p) => {
      const c = WHEEL.r + 1;
      const turn = ((f / frames) * Math.PI * 2) / WHEEL.spokes;
      for (let s = 0; s < WHEEL.spokes; s++) {
        const a = turn + (s / WHEEL.spokes) * Math.PI * 2;
        p.line(WASEN.steel, c, c, c + Math.round(Math.cos(a) * WHEEL.r), c + Math.round(Math.sin(a) * WHEEL.r));
      }
      for (let i = 0; i < 160; i++) {
        const a = (i / 160) * Math.PI * 2;
        p.px(WASEN.rim, c + Math.round(Math.cos(a) * WHEEL.r), c + Math.round(Math.sin(a) * WHEEL.r));
        p.px(WASEN.steel, c + Math.round(Math.cos(a) * (WHEEL.r - 3)), c + Math.round(Math.sin(a) * (WHEEL.r - 3)));
      }
      p.disc(WASEN.rim, c, c, 2);
    }),
  );
  /** Radians per second: one slow turn every ~40 s. */
  const speed = 0.16;
  return {
    width: WASEN_W,
    draw: (g, x, time) => {
      const top = GROUND_Y - WASEN_H;
      const angle = time * speed;
      const step = (Math.PI * 2) / WHEEL.spokes;
      const f = Math.floor(((angle % step) / step) * frames) % frames;
      g.drawImage(wheels[f]!(), x + WHEEL.cx - WHEEL.r - 1, top + WHEEL.cy - WHEEL.r - 1);
      // Gondolas hang straight down from the rim, so they are drawn per frame.
      for (let s = 0; s < WHEEL.spokes; s++) {
        const a = (f / frames) * step + s * step;
        const gx = x + WHEEL.cx + Math.round(Math.cos(a) * WHEEL.r);
        const gy = top + WHEEL.cy + Math.round(Math.sin(a) * WHEEL.r);
        g.fillStyle = WASEN.gondolas[s % 4]!;
        g.fillRect(gx - 2, gy + 1, 5, 4);
      }
      g.drawImage(scenery(), x, top);
    },
    warm: () => {
      scenery();
      wheels.forEach((w) => w());
    },
  };
}

/** Wilhelma hint: Moorish glasshouse with a ribbed dome and slim corner towers. */
const wilhelma = staticProp(70, 44, GROUND_Y - 18, (p) => {
  const glass = '#b4cac8';
  const rib = '#98b1b0';
  const wall = '#ddd3bf';
  p.ellipse(FAR.forest, 35, 44, 36, 6);
  p.rect(wall, 8, 26, 54, 14);
  for (let x = 11; x < 60; x += 6) {
    p.rect(glass, x, 30, 4, 8);
    p.px(wall, x, 30);
    p.px(wall, x + 3, 30);
  }
  p.rect(wall, 25, 20, 20, 6);
  p.ellipse(glass, 35, 20, 10, 11);
  p.rect(wall, 24, 20, 22, 7);
  for (let x = 27; x < 44; x += 3) p.line(rib, x, 19, 35, 9);
  p.rect(wall, 34, 6, 2, 4);
  p.px(FAR.antennaRed, 35, 5);
  for (const x of [5, 63]) {
    p.rect(wall, x, 16, 3, 24);
    p.disc(glass, x + 1, 15, 2);
    p.px(wall, x + 1, 12);
  }
});

/** Half-timbered house: stone ground floor, jettied plaster floors with beams and braces, steep gable. */
function paintFachwerk(p: Painter, x: number, w: number, floors: number, roofH: number, salt: number, h: number): void {
  const floorH = 9;
  const ground = 10;
  const bodyTop = h - ground - floors * floorH;
  p.rect(MID.sand, x + 1, h - ground, w - 2, ground);
  p.rect(MID.sandShade, x + w - 3, h - ground, 2, ground);
  p.rect(MID.windowDark, x + 4, h - 8, 4, 8);
  p.rect(MID.window, x + w - 10, h - 7, 4, 3);
  for (let f = 0; f < floors; f++) {
    const y = bodyTop + f * floorH;
    p.rect(MID.plaster, x, y, w, floorH);
    p.rect(MID.beam, x, y, w, 1);
    p.rect(MID.beam, x, y + floorH - 1, w, 1);
    for (let bx = x; bx < x + w; bx += 6) p.rect(MID.beam, bx, y, 1, floorH);
    p.rect(MID.beam, x + w - 1, y, 1, floorH);
    // Braces in the outer panels, windows in the inner ones.
    p.line(MID.beam, x, y + floorH - 1, x + 5, y + 1);
    p.line(MID.beam, x + w - 1, y + floorH - 1, x + w - 6, y + 1);
    for (let bx = x + 7; bx < x + w - 7; bx += 6) {
      if (noise(bx, f, salt) < 0.75) {
        p.rect(MID.windowDark, bx + 1, y + 3, 3, 3);
        p.px(MID.white, bx + 1, y + 6);
      }
    }
  }
  p.gable(MID.roof, x - 1, bodyTop - roofH, w + 2, roofH);
  p.rect(MID.roofShade, x - 1, bodyTop - 1, w + 2, 1);
  for (let r = 3; r < roofH - 2; r += 4) p.rect(MID.roofShade, x + Math.floor(w / 2) - Math.floor((r * w) / (2 * roofH)) + 1, bodyTop - roofH + r, Math.floor((r * w) / roofH) - 1, 1);
  if (roofH > 10) p.rect(MID.windowDark, x + Math.floor(w / 2) - 1, bodyTop - Math.floor(roofH / 2), 2, 3);
}

function fachwerk(houses: ReadonlyArray<readonly [w: number, floors: number, roofH: number]>): Prop {
  const w = houses.reduce((sum, [hw]) => sum + hw, 0);
  const h = Math.max(...houses.map(([, floors, roofH]) => 10 + floors * 9 + roofH)) + 1;
  return staticProp(w, h, GROUND_Y, (p) => {
    let x = 0;
    houses.forEach(([hw, floors, roofH], i) => {
      paintFachwerk(p, x, hw, floors, roofH, i + 1, h);
      x += hw;
    });
  });
}

/** Kursaal: classicist building with a columned portico and pediment. */
const kursaal = staticProp(100, 48, GROUND_Y, (p) => {
  const cream = '#ede1c3';
  const shade = '#d3c4a1';
  const column = '#f7f0dd';
  p.rect(MID.stone, 0, 44, 100, 4);
  p.rect(MID.stoneShade, 0, 47, 100, 1);
  p.rect(cream, 4, 18, 92, 26);
  p.rect(shade, 4, 18, 92, 2);
  p.rect(shade, 92, 18, 4, 26);
  for (let x = 8; x < 30; x += 6) p.rect(MID.windowDark, x, 26, 3, 10);
  for (let x = 72; x < 92; x += 6) p.rect(MID.windowDark, x, 26, 3, 10);
  // Portico.
  p.rect(MID.windowDark, 32, 22, 36, 22);
  for (let x = 33; x < 68; x += 5) {
    p.rect(column, x, 22, 2, 22);
    p.px(shade, x + 1, 23);
  }
  p.rect(column, 30, 18, 40, 4);
  p.rect(shade, 30, 21, 40, 1);
  p.gable(column, 30, 8, 40, 10);
  p.gable(shade, 36, 12, 28, 5);
  p.rect(MID.roofShade, 4, 16, 92, 2);
  p.rect(column, 2, 15, 96, 1);
});

/** Stadtkirche tower with its pointed spire. */
const stadtkirche = staticProp(22, 84, GROUND_Y, (p) => {
  p.rect(MID.sand, 5, 30, 12, 54);
  p.rect(MID.sandShade, 14, 30, 3, 54);
  p.rect(MID.windowDark, 9, 40, 3, 7);
  p.rect(MID.windowDark, 9, 60, 3, 9);
  p.rect(MID.sandLight, 4, 28, 14, 2);
  for (let r = 0; r < 28; r++) {
    const half = Math.round((r / 28) * 6);
    p.rect(r % 4 === 3 ? MID.stoneShade : MID.stone, 11 - half, r, half * 2 + 1, 1);
  }
  p.px(MID.stoneShade, 11, 0);
});

/** Park hedge with flowers along the Kursaal grounds. */
const hedge = baseTile(32, GROUND_Y - 8, 8, (p) => {
  for (let x = 0; x < 32; x++) {
    const top = 1 + Math.round(1 + Math.sin((Math.PI * 2 * x) / 16));
    p.rect(NEAR.leafDark, x, top, 1, 8 - top);
    p.px(NEAR.leaf, x, top);
    for (let y = top + 1; y < 8; y++) if (noise(x, y, 31) < 0.3) p.px(NEAR.leaf, x, y);
    if (noise(x, 0, 32) < 0.12) p.px(noise(x, 1, 32) < 0.5 ? NEAR.flowerRed : NEAR.flowerYellow, x, top + 1);
  }
  p.rect(NEAR.grassDark, 0, 7, 32, 1);
});

export function cannstattZone(): ZoneSpec {
  return {
    name: 'Bad Cannstatt',
    sky: skyCanvas(2),
    layers: [
      CLOUD_LAYER,
      {
        factor: FAR_FACTOR,
        base: farHills(116, [[5, 1, 2], [2, 4, 0], [1, 9, 1]], [[1, 2, 1]], 3),
        props: {
          catalogue: { wilhelma, vineHill: hillProp(70, 24, true, 9), housesHill: housesHillProp(80, 24, 10) },
          stream: {
            intro: ['housesHill', 'wilhelma'],
            landmarks: ['wilhelma'],
            fillers: ['vineHill', 'housesHill'],
            gap: [-10, 24],
            fillersBetween: [5, 7],
          },
          startAt: 150,
        },
      },
      {
        factor: MID_FACTOR,
        props: {
          catalogue: {
            fachwerkRow: fachwerk([[24, 3, 14], [30, 3, 18], [26, 2, 16]]),
            fachwerkA: fachwerk([[26, 2, 15]]),
            fachwerkB: fachwerk([[20, 3, 12], [26, 2, 16]]),
            kursaal,
            stadtkirche,
            wasen: wasen(),
            trees: treeCluster(),
          },
          stream: {
            intro: ['fachwerkRow', 'wasen', 'kursaal'],
            landmarks: ['kursaal', 'fachwerkRow', 'stadtkirche', 'wasen'],
            fillers: ['fachwerkA', 'fachwerkB', 'trees'],
            gap: [2, 14],
            fillersBetween: [3, 5],
          },
          startAt: 44,
        },
      },
      {
        factor: NEAR_FACTOR,
        base: hedge,
        props: {
          catalogue: STREET,
          stream: {
            intro: ['sprudler', 'lamp'],
            landmarks: ['sprudler', 'litfass'],
            fillers: ['lamp', 'tree', 'treeSmall', 'fence'],
            gap: [12, 44],
            fillersBetween: [2, 4],
          },
          startAt: 240,
        },
      },
    ],
  };
}
