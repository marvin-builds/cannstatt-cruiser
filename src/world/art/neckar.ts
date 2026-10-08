import { GROUND_Y } from '../../core/config';
import { BACK, FAR, MID, NEAR } from '../palette';
import type { ZoneSpec } from '../scene';
import { MID_TREE, treeCluster } from './city';
import { farHills, hillProp, housesHillProp } from './hills';
import { crossingX } from '../crossing';
import { baseTile, lazyCanvas, noise, type Painter, type Prop, staticProp } from './paint';
import { skyCanvas } from './sky';
import { stadtbahn } from './stadtbahn';
import { STREET, tree } from './street';

/** View y of the far river bank's grass; bank props stand on it. */
export const BANK_Y = 122;
/** View y where the water surface starts. */
export const WATER_Y = 127;

/** Mercedes-Benz Arena: low oval bowl with a white membrane roof on masts. */
const arena = staticProp(88, 26, BANK_Y + 2, (p) => {
  p.rect(FAR.concreteShade, 6, 14, 76, 12);
  p.rect(FAR.concrete, 4, 12, 80, 3);
  p.rect(FAR.glass, 8, 17, 72, 2);
  for (let x = 10; x < 80; x += 4) p.px(FAR.concrete, x, 17);
  p.rect(FAR.white, 2, 10, 84, 2);
  p.rect(FAR.white, 8, 9, 72, 1);
  for (const x of [6, 22, 44, 66, 82]) {
    p.rect(FAR.steel, x, 1, 1, 9);
    p.line(FAR.steel, x, 1, x + (x < 44 ? 8 : -8), 9);
  }
  p.rect(FAR.hillShade, 0, 24, 88, 2);
});

/** The Gaskessel: a lattice gasholder cylinder. */
const gasometer = staticProp(30, 38, BANK_Y + 1, (p) => {
  p.rect(FAR.steel, 2, 4, 26, 34);
  p.rect(FAR.steelDark, 22, 4, 6, 34);
  for (let x = 4; x < 28; x += 4) p.rect(FAR.steelDark, x, 4, 1, 34);
  for (let y = 8; y < 38; y += 8) p.rect(FAR.steelDark, 2, y, 26, 1);
  p.rect(FAR.concrete, 3, 2, 24, 2);
  p.rect(FAR.concrete, 6, 1, 18, 1);
});

/** Industry hint: sawtooth halls and a chimney. */
const factory = staticProp(52, 40, BANK_Y + 1, (p) => {
  p.rect(FAR.concreteShade, 40, 0, 4, 40);
  p.rect(FAR.concrete, 40, 0, 2, 40);
  p.rect(FAR.antennaRed, 40, 3, 4, 2);
  for (let i = 0; i < 4; i++) {
    const x = i * 10;
    for (let r = 0; r < 6; r++) p.rect(FAR.wall, x + r, 22 + 6 - r, 10 - r, 1);
    p.rect(FAR.glass, x, 22, 1, 6);
  }
  p.rect(FAR.wall, 0, 28, 52, 12);
  for (let x = 3; x < 50; x += 5) p.rect(FAR.glass, x, 31, 2, 3);
});

/** Shimmering river with the far bank's quay wall; 4 frames of moving glints. */
const river = baseTile(
  64,
  BANK_Y,
  GROUND_Y - BANK_Y,
  (p, frame) => {
    const top = BANK_Y;
    for (let x = 0; x < 64; x++) {
      p.px(MID.greenDark, x, 0);
      p.px(MID.green, x, 1);
      for (let y = 2; y < WATER_Y - top; y++) p.px(noise(x >> 2, y, 7) < 0.3 ? MID.stoneShade : MID.stone, x, y);
      if (x % 8 === 0) p.rect(MID.stoneShade, x, 2, 1, WATER_Y - top - 2);
    }
    p.rect(MID.stoneShade, 0, WATER_Y - top - 1, 64, 1);
    for (let y = WATER_Y - top; y < GROUND_Y - top; y++) {
      const d = y - (WATER_Y - top);
      p.rect(d < 4 ? MID.greenShade : d < 12 ? MID.water : d < 18 ? MID.waterMid : MID.waterDeep, 0, y, 64, 1);
    }
    // Reflection of the bank and moving glints (period 64 -> seamless).
    for (let x = 0; x < 64; x += 2) if (noise(x, 1, 9) < 0.5) p.px(MID.water, x, WATER_Y - top + 1);
    for (let i = 0; i < 14; i++) {
      const y = WATER_Y - top + 4 + Math.floor(noise(i, 3, 11) * 19);
      const x = (Math.floor(noise(i, 4, 11) * 64) + frame * (1 + (i % 3))) % 64;
      const len = 2 + (i % 3);
      for (let k = 0; k < len; k++) p.px(i % 4 === 0 ? MID.waterGlint : MID.waterLight, (x + k) % 64, y);
    }
  },
  4,
  3,
);

/** Arched river part of the bridge. */
const SPANS_W = 212;
/** Embankment with a tree grove at each end, where the track meets the bank. */
const RAMP_W = 36;
const BRIDGE_W = SPANS_W + RAMP_W * 2;
/** Rows above the catenary for the grove crowns. */
const BRIDGE_H = 60;
/** Local y of the deck (track bed top + 2), view y 108. */
const DECK = 18;
/** Local x where the tram is clipped; the grove fully hides it there. */
const GROVE_CLIP = 22;
const BRIDGE_TRAIN = stadtbahn(22, 7, false);

/** Stone arches between the abutments, catenary masts above the deck. */
function paintSpans(p: Painter, sx: number): void {
  const spanCount = 4;
  const abut = 10;
  const pier = 6;
  const span = (SPANS_W - abut * 2 - pier * (spanCount - 1)) / spanCount;
  const waterTop = WATER_Y - (GROUND_Y - BRIDGE_H);
  for (let i = 0; i < SPANS_W; i++) {
    const x = sx + i;
    const inner = i - abut;
    const slot = Math.floor(inner / (span + pier));
    const within = inner - slot * (span + pier);
    let openTop = BRIDGE_H;
    if (inner >= 0 && i < SPANS_W - abut && within < span) {
      const u = ((within + 0.5) / span) * 2 - 1;
      openTop = Math.round(DECK + 10 + (BRIDGE_H - DECK - 10) * (1 - Math.sqrt(Math.max(0, 1 - u * u))) * 0.9);
      openTop = Math.max(openTop, DECK + 10);
    }
    p.rect(MID.sand, x, DECK, 1, openTop - DECK);
    if (openTop < BRIDGE_H) p.rect(MID.sandShade, x, openTop - 2, 1, 2);
    else p.rect(MID.stoneShade, x, waterTop, 1, BRIDGE_H - waterTop);
    if (noise(i, 0, 21) < 0.15) p.px(MID.sandShade, x, DECK + 3 + Math.floor(noise(i, 1, 21) * 6));
  }
  p.rect(MID.sandLight, sx, DECK, SPANS_W, 1);
  p.rect(MID.sandShade, sx, DECK + 5, SPANS_W, 1);
  for (let x = sx + 4; x < sx + SPANS_W; x += 28) {
    p.rect(NEAR.iron, x, DECK - 13, 1, 11);
    p.rect(NEAR.iron, x, DECK - 12, 4, 1);
  }
}

/** Grassy embankment from the bank up to the deck; `dir` 1 rises to the right, -1 to the left. */
function paintEmbankment(p: Painter, x0: number, dir: 1 | -1): void {
  const bank = BANK_Y - (GROUND_Y - BRIDGE_H);
  const slope = 20;
  for (let i = 0; i < RAMP_W; i++) {
    const x = dir === 1 ? x0 + i : x0 + RAMP_W - 1 - i;
    const top = i < slope ? Math.round(bank - ((bank - (DECK - 2)) * (i + 1)) / slope) : DECK - 2;
    p.rect(MID.green, x, top, 1, bank + 2 - top);
    p.px(MID.greenDark, x, top);
    for (let y = top + 1; y < bank + 2; y++) if (noise(x, y, 23) < 0.18) p.px(MID.greenShade, x, y);
  }
}

/** Tree grove on an embankment, painted over the tram so it drives in and out behind it. */
function paintGrove(p: Painter, x0: number, dir: 1 | -1): void {
  const at = (x: number) => (dir === 1 ? x0 + x : x0 + RAMP_W - 1 - x);
  for (const [x, y, r] of [[9, DECK - 4, 7], [28, DECK - 4, 6], [19, DECK - 8, 9]] as const) {
    p.rect(MID.stoneShade, at(x), y + r - 1, 1, 5);
    p.disc(MID.greenDark, at(x), y, r);
    p.disc(MID.green, at(x) - 1, y - 1, r - 2);
    p.disc(MID.greenShade, at(x) - Math.round(r * 0.4), y - Math.round(r * 0.4), Math.round(r * 0.35));
    for (let i = 0; i < r * 2; i++) {
      const a = i * 2.39996;
      const d = r * 0.7 * Math.sqrt((i + 1) / (r * 2));
      p.px(i % 3 === 0 ? MID.greenShade : MID.greenDark, at(x) + Math.round(Math.cos(a) * d), y + Math.round(Math.sin(a) * d));
    }
  }
}

/**
 * Stone arch bridge with catenary, reached over a grassy embankment at each
 * end. A small Stadtbahn crosses now and then, coming out of the tree grove on
 * one embankment and disappearing into the grove on the other.
 */
function bridge(): Prop {
  const body = lazyCanvas(BRIDGE_W, BRIDGE_H, (p) => {
    paintEmbankment(p, 0, 1);
    paintEmbankment(p, BRIDGE_W - RAMP_W, -1);
    paintSpans(p, RAMP_W);
    p.rect(MID.stone, GROVE_CLIP - 6, DECK - 2, BRIDGE_W - (GROVE_CLIP - 6) * 2, 2);
    p.rect(NEAR.ironLight, GROVE_CLIP - 6, DECK - 13, BRIDGE_W - (GROVE_CLIP - 6) * 2, 1);
  });
  const groves = lazyCanvas(BRIDGE_W, BRIDGE_H, (p) => {
    paintGrove(p, 0, 1);
    paintGrove(p, BRIDGE_W - RAMP_W, -1);
  });
  const run = { period: 10, duration: 8, from: BRIDGE_W - GROVE_CLIP, to: GROVE_CLIP - BRIDGE_TRAIN.width };
  return {
    width: BRIDGE_W,
    draw: (g, x, time) => {
      const top = GROUND_Y - BRIDGE_H;
      g.drawImage(body(), x, top);
      const tx = crossingX(time, run);
      if (tx !== null) {
        g.save();
        g.beginPath();
        g.rect(x + GROVE_CLIP, top, BRIDGE_W - GROVE_CLIP * 2, DECK);
        g.clip();
        g.drawImage(BRIDGE_TRAIN.canvas(), x + tx, top + DECK - 2 - BRIDGE_TRAIN.height + 1);
        g.restore();
      }
      g.drawImage(groves(), x, top);
    },
    warm: () => {
      body();
      groves();
      BRIDGE_TRAIN.canvas();
    },
  };
}

/** Neckar passenger ship: white hull, blue stripe, two decks. */
const ship = staticProp(60, 16, 142, (p) => {
  for (let r = 0; r < 5; r++) p.rect(MID.white, r, 11 + r - 1, 60 - r * 2, 1);
  p.rect(MID.blue, 1, 12, 58, 1);
  p.rect(MID.white, 8, 5, 44, 6);
  p.rect(MID.window, 10, 7, 40, 2);
  p.rect(MID.white, 16, 2, 26, 3);
  p.rect(MID.window, 18, 3, 22, 1);
  p.rect(MID.stoneShade, 8, 10, 44, 1);
  p.rect(MID.roofShade, 44, 0, 2, 2);
  p.rect(MID.waterLight, 0, 15, 60, 1);
});

/** Lombardy poplar on the bank. */
const poplar = staticProp(9, 34, BANK_Y + 1, (p) => {
  p.rect(MID.stoneShade, 4, 28, 1, 6);
  p.ellipse(MID.greenDark, 4, 15, 4, 14);
  p.ellipse(MID.green, 3, 13, 3, 11);
});

const boathouse = staticProp(30, 18, BANK_Y + 1, (p) => {
  p.rect(MID.plaster, 2, 6, 26, 12);
  p.rect(MID.plasterShade, 24, 6, 4, 12);
  p.gable(MID.roof, 0, 0, 30, 7);
  p.rect(MID.roofShade, 1, 6, 28, 1);
  for (const x of [6, 13, 20]) p.rect(MID.window, x, 9, 3, 3);
  p.rect(MID.windowDark, 13, 13, 4, 5);
});

/** Promenade railing over the water (light back-scenery iron), with the quay edge at the bottom. */
const railing = baseTile(16, GROUND_Y - 15, 15, (p) => {
  p.rect(BACK.iron, 0, 0, 16, 2);
  p.rect(BACK.ironLight, 0, 0, 16, 1);
  p.rect(BACK.iron, 0, 6, 16, 1);
  p.rect(BACK.iron, 0, 2, 2, 10);
  p.rect(BACK.ironLight, 0, 2, 1, 10);
  for (let x = 5; x < 16; x += 4) p.rect(BACK.iron, x, 2, 1, 10);
  p.rect(NEAR.quay, 0, 12, 16, 3);
  p.rect(NEAR.quayShade, 0, 14, 16, 1);
  p.rect(NEAR.quayShade, 15, 12, 1, 3);
});

export function neckarZone(): ZoneSpec {
  return {
    name: 'Neckar',
    sky: skyCanvas(1),
    layers: [
      {
        base: farHills(110, [[6, 2, 0.5], [3, 5, 0], [1.5, 9, 2]], [[1, 1, 2], [0.5, 3, 0]], 2),
        props: {
          catalogue: { arena, gasometer, factory, vineHill: hillProp(80, 26, true, 6), housesHill: housesHillProp(70, 22, 8) },
          stream: {
            intro: ['arena', 'gasometer'],
            landmarks: ['arena', 'gasometer'],
            fillers: ['factory', 'vineHill', 'housesHill'],
            gap: [4, 30],
            fillersBetween: [3, 4],
          },
          startAt: 236,
        },
      },
      {
        base: river,
        props: {
          catalogue: {
            bridge: bridge(),
            ship,
            bankTrees: treeCluster(BANK_Y + 1),
            bankTree: tree(8, 5, BANK_Y + 1, MID_TREE),
            poplar,
            boathouse,
          },
          stream: {
            intro: ['bankTree', 'bridge'],
            landmarks: ['bridge', 'ship'],
            fillers: ['bankTrees', 'bankTree', 'poplar', 'boathouse'],
            gap: [6, 28],
            fillersBetween: [2, 4],
          },
          startAt: 10,
        },
      },
      {
        base: railing,
        props: {
          catalogue: STREET,
          stream: {
            intro: ['willow'],
            landmarks: [],
            fillers: ['lamp', 'willow', 'tree', 'lamp', 'treeSmall'],
            gap: [24, 70],
            fillersBetween: [0, 0],
          },
          startAt: 4,
        },
      },
    ],
  };
}
