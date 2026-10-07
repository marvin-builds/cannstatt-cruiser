import { GROUND_Y } from '../../core/config';
import { type Sprite, sprite } from '../../core/sprite';
import { NEAR } from '../palette';
import { animatedProp, type Prop, staticProp } from './paint';

/** Classic street lantern on a slim pole. */
const LAMP = sprite({ k: NEAR.iron, l: NEAR.ironLight, y: NEAR.glow }, [
  `
  ..kkk..
  .kkkkk.
  kkkkkkk
  .kyyyk.
  .kyyyk.
  .kyyyk.
  ..kkk..
  ...k...
  ...k...
  ..klk..
  ...k...
  ...k...
  ...k...
  ...k...
  ...k...
  ...k...
  ...k...
  ...k...
  ...k...
  ...k...
  ...k...
  ...k...
  ...k...
  ...k...
  ...k...
  ...k...
  ...k...
  ..klk..
  ..klk..
  ..klk..
  ..klk..
  .kkkkk.
  .kkkkk.
`,
]);

/** Stadtbahn stop sign: green H on a yellow disc. */
const HALTESTELLE = sprite({ k: NEAR.iron, y: '#f2c230', g: '#2f7a3d', w: '#f7f1dc' }, [
  `
  ..kkkkk..
  .kyyyyyk.
  kyygygyyk
  kyygggyyk
  kyygygyyk
  .kyyyyyk.
  ..kkkkk..
  ...wwww..
  ...wwww..
  ....k....
  ....k....
  ....k....
  ....k....
  ....k....
  ....k....
  ....k....
  ....k....
  ....k....
  ....k....
  ....k....
  ....k....
  ....k....
  ....k....
  ....k....
  ....k....
  ...kkk...
`,
]);

/** Litfaßsäule: round advertising column with posters. */
const LITFASS = sprite(
  { k: NEAR.outline, d: '#2f5a43', g: '#3f7357', r: '#d4584a', R: '#a8443a', y: '#f0d36b', Y: '#c9ad4f', b: '#5d8fc7', B: '#4870a0', w: '#f1ece0', W: '#c8c2b4' },
  [
    `
  ...kk...
  ..kddk..
  .kgggdk.
  kddddddk
  kwwwwwWk
  krrrrrRk
  krrwwrRk
  krrrrrRk
  kyyyyyYk
  kyyyyyYk
  kwwbbbBk
  kbbbbbBk
  kbbwwbBk
  kbbbbbBk
  kwwwwwWk
  krrrrrRk
  kyyyyyYk
  kyyrryYk
  kyyyyyYk
  kddddddk
  kggggddk
  kkkkkkkk
`,
  ],
);

function spriteProp(s: Sprite, bottom = GROUND_Y): Prop {
  return {
    width: s.width,
    draw: (g, x) => s.draw(g, 0, x, bottom - s.height),
    // core Sprite caches its canvas on first draw; it is small enough not to warm.
    warm: () => undefined,
  };
}

export interface TreeColors {
  readonly leaf: string;
  readonly leafLight: string;
  readonly leafDark: string;
  readonly trunk: string;
  readonly trunkDark: string;
}

/** Round deciduous tree; `crown` is the crown radius. */
export function tree(crown: number, trunkH: number, bottom = GROUND_Y, colors: TreeColors = NEAR): Prop {
  const w = crown * 2 + 4;
  const h = crown * 2 + trunkH;
  return staticProp(w, h, bottom, (p) => {
    const cx = Math.floor(w / 2);
    p.rect(colors.trunkDark, cx - 1, h - trunkH - 2, 3, trunkH + 2);
    p.rect(colors.trunk, cx - 1, h - trunkH - 2, 2, trunkH + 2);
    p.rect(colors.trunkDark, cx - 2, h - 1, 5, 1);
    const cy = crown + 1;
    p.disc(colors.leafDark, cx, cy, crown);
    p.disc(colors.leafDark, cx - Math.round(crown * 0.55), cy + Math.round(crown * 0.3), Math.round(crown * 0.65));
    p.disc(colors.leafDark, cx + Math.round(crown * 0.55), cy + Math.round(crown * 0.35), Math.round(crown * 0.6));
    p.disc(colors.leaf, cx - 1, cy - 1, crown - 2);
    p.disc(colors.leaf, cx - Math.round(crown * 0.55), cy + Math.round(crown * 0.2), Math.round(crown * 0.5));
    p.disc(colors.leafLight, cx - Math.round(crown * 0.35), cy - Math.round(crown * 0.4), Math.round(crown * 0.4));
    for (let i = 0; i < crown * 2; i++) {
      const a = i * 2.39996;
      const r = crown * 0.75 * Math.sqrt((i + 1) / (crown * 2));
      p.px(i % 3 === 0 ? colors.leafLight : colors.leafDark, cx + Math.round(Math.cos(a) * r), cy + Math.round(Math.sin(a) * r));
    }
  });
}

/** Weeping willow for the river bank. */
export function willow(): Prop {
  const w = 34;
  const h = 40;
  return staticProp(w, h, GROUND_Y, (p) => {
    p.rect(NEAR.trunkDark, 16, 16, 3, h - 16);
    p.rect(NEAR.trunk, 16, 16, 2, h - 16);
    p.ellipse(NEAR.leafDark, 17, 12, 15, 10);
    p.ellipse(NEAR.leaf, 16, 10, 13, 8);
    for (let x = 2; x < w - 2; x++) {
      const len = 10 + Math.round(8 * Math.sin((Math.PI * x) / w)) + (x % 3) * 2;
      const color = x % 2 === 0 ? NEAR.leafDark : NEAR.leaf;
      p.rect(color, x, 14, 1, Math.min(len, h - 18));
    }
    for (let x = 6; x < w - 6; x += 3) p.px(NEAR.leafLight, x, 5 + (x % 4));
  });
}

/** Wrought-iron fence segment. */
function fence(): Prop {
  const w = 33;
  return staticProp(w, 13, GROUND_Y, (p) => {
    p.rect(NEAR.iron, 0, 1, w, 1);
    p.rect(NEAR.iron, 0, 10, w, 1);
    for (let x = 0; x < w; x += 3) {
      p.rect(NEAR.iron, x, 1, 1, 12);
      p.px(NEAR.ironLight, x, 0);
    }
    p.rect(NEAR.iron, 0, 0, 2, 13);
    p.rect(NEAR.iron, w - 2, 0, 2, 13);
  });
}

/** Bad Cannstatt mineral water fountain (Sprudler) with a splashing jet. */
function sprudler(): Prop {
  const w = 30;
  const h = 26;
  return animatedProp(w, h, GROUND_Y, 3, 6, (p, frame) => {
    p.ellipse(NEAR.outline, 15, 21, 14, 4);
    p.ellipse(NEAR.stoneShade, 15, 21, 13, 3);
    p.rect(NEAR.stone, 3, 18, 25, 2);
    p.rect(NEAR.water, 5, 19, 21, 1);
    p.rect(NEAR.outline, 12, 6, 7, 13);
    p.rect(NEAR.stone, 13, 7, 5, 12);
    p.rect(NEAR.stoneShade, 17, 7, 1, 12);
    p.rect(NEAR.outline, 11, 4, 9, 3);
    p.rect(NEAR.stone, 12, 5, 7, 1);
    p.rect(NEAR.iron, 19, 9, 3, 1);
    // Two water arcs out of the spouts into the basin.
    for (const dir of [1, -1]) {
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const x = 15 + dir * (5 + Math.round(t * 8));
        const y = 9 + Math.round(t * t * 10) - (i < 2 ? 1 : 0);
        const lit = (i + frame) % 3 === 0;
        p.px(lit ? NEAR.waterLight : NEAR.water, x, y);
      }
    }
    for (let i = 0; i < 3; i++) p.px(NEAR.waterLight, 15 + ((i * 7 + frame * 5) % 19) - 9, 18 - ((i + frame) % 2));
  });
}

export const STREET: Readonly<Record<string, Prop>> = {
  lamp: spriteProp(LAMP),
  haltestelle: spriteProp(HALTESTELLE),
  litfass: spriteProp(LITFASS, GROUND_Y - 1),
  tree: tree(13, 14),
  treeSmall: tree(9, 10),
  willow: willow(),
  fence: fence(),
  sprudler: sprudler(),
};
