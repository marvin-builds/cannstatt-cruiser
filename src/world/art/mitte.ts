import { GROUND_Y } from '../../core/config';
import type { ZoneSpec } from '../scene';
import type { TrainRunner } from '../train';
import { FAR, MID, NEAR } from '../palette';
import { TRAIN_RAIL_Y } from './layout';
import { farHills, hillProp, housesHillProp, paintHill } from './hills';
import { baseTile, lazyCanvas, noise, type Painter, type Prop, staticProp } from './paint';
import { skyCanvas } from './sky';
import { stadtbahn } from './stadtbahn';
import { STREET } from './street';
import { terrace, treeCluster } from './city';
import { TRANS_FLAG, flagSpan, withFlag } from './flags';

/** Fernsehturm on its wooded hill: tapering shaft, basket with window band, red-white antenna. */
const fernsehturm = staticProp(100, 132, GROUND_Y, (p) => {
  const h = 132;
  const top = paintHill(p, 100, h, 46, false, 11);
  const cx = 50;
  const foot = top(cx) + 1;
  for (let y = 40; y < foot; y++) {
    const wide = y > foot - 16 ? 4 : 3;
    p.rect(FAR.concrete, cx - 1, y, wide - 1, 1);
    p.px(FAR.concreteShade, cx - 2 + wide, y);
  }
  p.rect(FAR.concrete, cx - 3, 39, 7, 1);
  p.rect(FAR.concrete, cx - 4, 32, 9, 7);
  p.rect(FAR.glass, cx - 4, 34, 9, 2);
  p.rect(FAR.concreteShade, cx + 3, 32, 2, 7);
  p.rect(FAR.concrete, cx - 3, 30, 7, 2);
  for (let y = 10; y < 30; y++) p.px(Math.floor(y / 3) % 2 === 0 ? FAR.antennaRed : FAR.white, cx, y);
  p.rect(FAR.concreteShade, cx - 1, 24, 3, 6);
});

/** Hauptbahnhof tower (Bonatzbau) with the rotating Mercedes star and the low station hall. */
function hauptbahnhof(): Prop {
  const w = 74;
  const h = 104;
  const body = lazyCanvas(w, h, (p) => {
    const tx = 6;
    const ty = 18;
    const tw = 24;
    p.rect(MID.sand, tx, ty, tw, h - ty);
    p.rect(MID.sandShade, tx + tw - 4, ty, 4, h - ty);
    p.rect(MID.sandLight, tx - 1, ty, tw + 2, 2);
    p.rect(MID.sandShade, tx - 1, ty + 2, tw + 2, 1);
    for (let col = 0; col < 3; col++) {
      const wx = tx + 4 + col * 6;
      p.rect(MID.windowDark, wx, ty + 8, 2, 46);
      for (let y = ty + 12; y < ty + 54; y += 6) p.px(MID.sandShade, wx, y);
    }
    p.rect(MID.sandShade, tx + 2, ty + 60, tw - 4, 1);
    // Station hall with tall arcade windows.
    p.rect(MID.sand, tx + tw, 68, w - tx - tw, h - 68);
    p.rect(MID.sandLight, tx + tw, 68, w - tx - tw, 1);
    p.rect(MID.sandShade, tx + tw, 69, w - tx - tw, 1);
    for (let x = tx + tw + 3; x < w - 3; x += 7) {
      p.rect(MID.windowDark, x, 74, 4, 18);
      p.rect(MID.window, x, 74, 4, 2);
    }
    p.rect(MID.sandShade, tx + tw, h - 6, w - tx - tw, 1);
    // Mount for the star.
    p.rect(MID.stoneShade, tx + 11, ty - 3, 2, 3);
  });
  const stars = Array.from({ length: 8 }, (_, f) => lazyCanvas(15, 15, (p) => paintStar(p, (f * Math.PI) / 8)));
  return {
    width: w,
    draw: (g, x, time) => {
      g.drawImage(body(), x, GROUND_Y - h);
      g.drawImage(stars[Math.floor(time * 3) % stars.length]!(), x + 11, GROUND_Y - h);
    },
    warm: () => {
      body();
      stars.forEach((s) => s());
    },
  };
}

/** Mercedes star in its ring, turned by `angle` around the vertical axis. */
function paintStar(p: Painter, angle: number): void {
  const sx = Math.cos(angle);
  const c = 7;
  const r = 6;
  for (let a = 0; a < 64; a++) {
    const t = (a / 64) * Math.PI * 2;
    p.px('#9aa5b1', c + Math.round(Math.cos(t) * r * sx), c + Math.round(Math.sin(t) * r));
  }
  const arms = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
  for (const t of arms) p.line('#eef1f4', c, c, c + Math.round(Math.cos(t) * (r - 1) * sx), c + Math.round(Math.sin(t) * (r - 1)));
  p.px('#ffffff', c, c);
}

/** Stäffele: a hillside with stair lanes zig-zagging between small houses and vines. */
const staeffele = staticProp(116, 62, GROUND_Y, (p) => {
  const w = 116;
  const h = 62;
  const top = (x: number) => h - Math.round(58 * Math.pow(Math.sin((Math.PI * (x + 0.5)) / w), 0.7));
  for (let x = 0; x < w; x++) {
    const t = top(x);
    p.rect(MID.green, x, t, 1, h - t);
    p.px(MID.greenDark, x, t);
    for (let y = t + 2; y < h; y++) {
      if ((y + Math.floor(x / 7)) % 3 === 0) p.px(MID.greenShade, x, y);
      else if (noise(x, y, 5) < 0.06) p.px(MID.greenDark, x, y);
    }
  }
  // Two stair lanes: diagonal steps with a light handrail edge.
  const lane = (x0: number, y0: number, dir: number, steps: number) => {
    let x = x0;
    let y = y0;
    for (let i = 0; i < steps; i++) {
      p.rect(MID.stair, x, y, 2, 1);
      p.px(MID.stoneShade, x, y + 1);
      x += dir;
      if (i % 2 === 1) y -= 1;
    }
  };
  lane(14, h - 2, 1, 40);
  lane(54, h - 22, -1, 22);
  lane(60, h - 3, 1, 46);
  lane(100, h - 2, -1, 36);
  const house = (x: number, y: number, w2: number, h2: number, wall: string) => {
    p.rect(wall, x, y, w2, h2);
    p.rect(MID.sandShade, x + w2 - 1, y, 1, h2);
    p.gable(MID.roof, x - 1, y - 4, w2 + 2, 4);
    p.rect(MID.roofShade, x - 1, y - 1, w2 + 2, 1);
    for (let wx = x + 2; wx < x + w2 - 2; wx += 3) p.rect(MID.window, wx, y + 2, 1, 2);
  };
  house(30, h - 34, 10, 8, MID.plaster);
  house(46, h - 48, 9, 7, MID.sandLight);
  house(70, h - 46, 11, 8, MID.plaster);
  house(84, h - 30, 9, 7, MID.ochre);
  house(18, h - 16, 9, 7, MID.sandLight);
  house(96, h - 14, 10, 8, MID.plaster);
});

/** Gravel track bed with sleepers and the Stadtbahn rail. */
const trackBed = baseTile(32, GROUND_Y - 9, 9, (p) => {
  for (let x = 0; x < 32; x++) {
    p.px(noise(x, 0, 3) < 0.5 ? NEAR.grass : NEAR.grassDark, x, 0);
    p.px(NEAR.grass, x, 1);
    for (let y = 2; y < 8; y++) p.px(noise(x, y, 4) < 0.3 ? NEAR.gravelDark : NEAR.gravel, x, y);
    p.px(NEAR.grassDark, x, 8);
  }
  for (let x = 2; x < 32; x += 8) p.rect(NEAR.sleeper, x, 5, 4, 2);
  p.rect(NEAR.rail, 0, TRAIN_RAIL_Y - (GROUND_Y - 9) - 1, 32, 1);
  p.rect(NEAR.railShade, 0, TRAIN_RAIL_Y - (GROUND_Y - 9), 32, 1);
});

/** The near-layer Stadtbahn image (also sizes the TrainRunner). */
export const MITTE_TRAIN = stadtbahn(56, 22, true);

/** The tall Mitte terrace. */
function housesB(): Prop {
  return terrace([[20, 40, MID.plaster, 'mansard'], [16, 32, MID.sandLight, 'gable']]);
}

/**
 * Terrace-local x of the trans pride flag, hung once per Mitte visit (intro)
 * from the plaster house's middle top-floor window (window at x 8-9, rows
 * 12-14, sill row 15 of the 48 px high terrace).
 */
export const MITTE_FLAG_X = 6;

function flaggedHousesB(): Prop {
  return withFlag(housesB(), 48, TRANS_FLAG, MITTE_FLAG_X, 16);
}

export function mitteZone(train: TrainRunner): ZoneSpec {
  return {
    name: 'Stuttgart-Mitte',
    sky: skyCanvas(0),
    layers: [
      {
        base: farHills(108, [[7, 1, 0], [4, 3, 1.3], [1.5, 7, 0]], [[1, 2, 0.4]], 1),
        props: {
          catalogue: {
            fernsehturm,
            vineHill: hillProp(76, 30, true, 2),
            forestHill: hillProp(60, 24, false, 3),
            housesHill: housesHillProp(84, 30, 4),
          },
          stream: {
            intro: ['fernsehturm'],
            landmarks: ['fernsehturm'],
            fillers: ['vineHill', 'forestHill', 'housesHill'],
            gap: [-20, 10],
            fillersBetween: [5, 7],
          },
          startAt: 150,
        },
      },
      {
        props: {
          catalogue: {
            hbf: hauptbahnhof(),
            staeffele,
            housesA: terrace([[16, 30, MID.sand, 'gable'], [18, 36, MID.plaster, 'mansard'], [14, 26, MID.ochre, 'gable']]),
            housesB: housesB(),
            housesBFlag: flaggedHousesB(),
            housesC: terrace([[14, 24, MID.ochre, 'gable'], [15, 28, MID.sand, 'gable'], [16, 34, MID.plaster, 'mansard']]),
            office: terrace([[24, 46, MID.modern, 'flat']]),
            trees: treeCluster(),
          },
          stream: {
            intro: ['housesA', 'hbf', 'housesBFlag', 'staeffele'],
            landmarks: ['hbf', 'staeffele'],
            fillers: ['housesA', 'housesB', 'housesC', 'office', 'trees'],
            gap: [0, 10],
            fillersBetween: [4, 7],
          },
          startAt: 30,
        },
      },
      {
        base: trackBed,
        vehicle: (g, scroll, ahead) => {
          const x = train.screenX(scroll, ahead);
          if (x !== null) g.drawImage(MITTE_TRAIN.canvas(), x, TRAIN_RAIL_Y - MITTE_TRAIN.height);
        },
        props: {
          catalogue: STREET,
          stream: {
            intro: ['lamp', 'haltestelle'],
            landmarks: ['haltestelle', 'litfass'],
            fillers: ['lamp', 'tree', 'treeSmall', 'fence', 'lamp'],
            gap: [10, 42],
            fillersBetween: [2, 4],
          },
          startAt: 20,
          // The Litfasssaeule, lamps and trees leave the flag on the terrace behind uncovered.
          uncover: { id: 'housesBFlag', ...flagSpan(TRANS_FLAG, MITTE_FLAG_X) },
        },
      },
    ],
  };
}
