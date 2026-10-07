import { GROUND_Y } from '../../core/config';
import { MID } from '../palette';
import { type Painter, type Prop, staticProp } from './paint';
import { tree, type TreeColors } from './street';

/** A terrace of city houses: [width, height, wall, roof style]. */
export function terrace(houses: ReadonlyArray<readonly [number, number, string, 'gable' | 'flat' | 'mansard']>): Prop {
  const w = houses.reduce((sum, [hw]) => sum + hw, 0);
  const h = Math.max(...houses.map(([, hh]) => hh)) + 8;
  return staticProp(w, h, GROUND_Y, (p) => {
    let x = 0;
    for (const [hw, hh, wall, roof] of houses) {
      paintHouse(p, x, h - hh, hw, hh, wall, roof);
      x += hw;
    }
  });
}

export function paintHouse(p: Painter, x: number, y: number, w: number, h: number, wall: string, roof: 'gable' | 'flat' | 'mansard'): void {
  const shade = wall === MID.ochre ? MID.ochreShade : wall === MID.modern ? MID.modernShade : MID.sandShade;
  p.rect(wall, x, y, w, h);
  p.rect(shade, x + w - 2, y, 2, h);
  if (roof === 'gable') {
    p.gable(MID.roof, x - 1, y - 7, w + 1, 7);
    p.rect(MID.roofShade, x, y - 1, w, 1);
  } else if (roof === 'mansard') {
    p.rect(MID.roof, x + 1, y - 5, w - 2, 5);
    p.rect(MID.roofShade, x, y - 1, w, 1);
    for (let dx = x + 3; dx < x + w - 3; dx += 5) p.rect(MID.window, dx, y - 4, 2, 2);
  } else {
    p.rect(shade, x, y - 1, w, 2);
  }
  const windowColor = wall === MID.modern ? MID.window : MID.windowDark;
  for (let wy = y + 4; wy < y + h - 8; wy += 7) {
    for (let wx = x + 3; wx < x + w - 4; wx += 5) {
      p.rect(windowColor, wx, wy, 2, 3);
      p.px(MID.white, wx, wy + 3);
    }
  }
  p.rect(MID.windowDark, x + Math.floor(w / 2) - 1, y + h - 6, 3, 6);
}

/** Muted tree colours for the mid layer. */
export const MID_TREE: TreeColors = { leaf: MID.green, leafLight: MID.greenShade, leafDark: MID.greenDark, trunk: MID.stoneShade, trunkDark: MID.stoneShade };

/** Two overlapping mid-distance trees standing on `bottom`. */
export function treeCluster(bottom = GROUND_Y): Prop {
  const a = tree(7, 6, bottom, MID_TREE);
  const b = tree(9, 7, bottom, MID_TREE);
  return {
    width: 34,
    draw: (g, x, t, s) => {
      b.draw(g, x + 12, t, s);
      a.draw(g, x, t, s);
    },
    warm: () => {
      a.warm();
      b.warm();
    },
  };
}

