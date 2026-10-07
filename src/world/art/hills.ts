import { GROUND_Y } from '../../core/config';
import { FAR } from '../palette';
import { baseTile, type BaseTile, bump, noise, type Painter, type Prop, staticProp, wave } from './paint';

type Terms = ReadonlyArray<readonly [number, number, number]>;

/** Top of the far base band; hills never rise above it. */
const FAR_TOP = 70;

/** Paints a hill column with forest speckles near the crest and vineyard terraces where `vine` is set. */
function hillColumn(p: Painter, x: number, top: number, bottom: number, vine: boolean, salt: number): void {
  p.rect(FAR.hill, x, top, 1, bottom - top);
  for (let y = top; y < bottom; y++) {
    const depth = y - top;
    if (vine && depth > 3) {
      if ((y + Math.floor(x / 9)) % 3 === 0) p.px(FAR.vineRow, x, y);
      else if (noise(x, y, salt) < 0.25) p.px(FAR.vine, x, y);
    } else if (depth < 7 && noise(x, y, salt) < 0.55 - depth * 0.05) {
      p.px(noise(x, y, salt + 1) < 0.5 ? FAR.forest : FAR.forestDark, x, y);
    } else if (noise(x, y, salt + 2) < 0.08) {
      p.px(FAR.hillShade, x, y);
    }
  }
  p.px(FAR.forestDark, x, top);
}

/**
 * Seamless far hill band: crest y = baseline + wave(terms); vineyard where
 * the vine wave is positive. Period 256 so the waves loop exactly.
 */
export function farHills(baseline: number, terms: Terms, vineTerms: Terms, salt: number): BaseTile {
  const period = 256;
  return baseTile(period, FAR_TOP, GROUND_Y - FAR_TOP, (p) => {
    for (let x = 0; x < period; x++) {
      const top = Math.round(baseline + wave(x, period, terms)) - FAR_TOP;
      hillColumn(p, x, top, GROUND_Y - FAR_TOP, wave(x, period, vineTerms) > 0.2, salt);
    }
  });
}

/**
 * A single hill rising `rise` px above the bottom edge (for landmarks to stand
 * on). With `vine`, vineyards cover the left `vineShare` of it.
 */
export function paintHill(p: Painter, w: number, h: number, rise: number, vine: boolean, salt: number, vineShare = 0.6): (col: number) => number {
  const top = (col: number) => h - Math.round(rise * bump(col, w));
  for (let x = 0; x < w; x++) hillColumn(p, x, top(x), h, vine && x < w * vineShare, salt);
  return top;
}

/** A plain far hill, wooded or with vineyards. */
export function hillProp(w: number, rise: number, vine: boolean, salt: number): Prop {
  return staticProp(w, rise + 2, GROUND_Y, (p) => void paintHill(p, w, rise + 2, rise, vine, salt));
}

/** A far hill dotted with small houses (Halbhöhenlage). */
export function housesHillProp(w: number, rise: number, salt: number): Prop {
  const h = rise + 2;
  return staticProp(w, h, GROUND_Y, (p) => {
    const top = paintHill(p, w, h, rise, true, salt);
    for (let i = 0; i < 6; i++) {
      const x = 6 + Math.floor(noise(i, 1, salt) * (w - 14));
      const y = top(x + 2) + 4 + Math.floor(noise(i, 2, salt) * 10);
      p.rect(FAR.wall, x, y, 5, 3);
      p.rect(FAR.roof, x, y - 1, 5, 1);
      p.px(FAR.roof, x + 2, y - 2);
      p.px(FAR.glass, x + 1, y + 1);
    }
  });
}
