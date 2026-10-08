/**
 * The NorDIY sign (ROADMAP 36, approved by the user): three weathered
 * horizontal planks (one slightly crooked) with grain, uneven ends and nail
 * heads, "NorDIY" hand-painted in its own 7 px pixel lettering (not the game
 * font): "Nor" white, "DIY" yellow, with a paint drip. Same in kid mode.
 * Plus the warm string lights that hang over it on a sagging wire.
 */
import { lazyCanvas, noise, type Painter } from './paint';

export const SIGN_W = 46;
export const SIGN_H = 14;

const WOOD = { base: '#a7814f', light: '#c39a63', grain: '#87653b', edge: '#5e452a', nail: '#3b3b3e', nailLight: '#a9a9ad' } as const;
const PAINT = { white: '#f4f1e8', yellow: '#ffd23f', shadow: '#3b2a1a' } as const;
const WIRE = '#2c2a2b';
const BULBS = ['#ffd27a', '#ffb347', '#fff1b8', '#ff9f6b'] as const;
const GLOW = '#fff6d8';

/** 7-row glyphs ('#' = paint); lowercase letters sit on the baseline with a 5-row x-height. */
const GLYPHS: Record<string, readonly string[]> = {
  N: ['##..##', '###.##', '###.##', '##.###', '##.###', '##..##', '##..##'],
  o: ['.....', '.....', '.###.', '##.##', '##.##', '##.##', '.###.'],
  r: ['.....', '.....', '##.##', '###..', '##...', '##...', '##...'],
  D: ['#####.', '##..##', '##..##', '##..##', '##..##', '##..##', '#####.'],
  I: ['####', '.##.', '.##.', '.##.', '.##.', '.##.', '####'],
  Y: ['##..##', '##..##', '.####.', '..##..', '..##..', '..##..', '..##..'],
};

/** Planks: top row, height, horizontal offset of the ends and a crooked tilt (rows dropped on the right half). */
const PLANKS: ReadonlyArray<{ y: number; h: number; left: number; right: number; tilt: number }> = [
  { y: 0, h: 5, left: 1, right: 0, tilt: 0 },
  { y: 5, h: 4, left: 0, right: 2, tilt: 1 },
  { y: 9, h: 5, left: 2, right: 1, tilt: 0 },
];

const sign = lazyCanvas(SIGN_W, SIGN_H + 4, paintSign);

/** Draws the sign with its top-left plank corner at (x, y). */
export function drawSign(g: CanvasRenderingContext2D, x: number, y: number): void {
  g.drawImage(sign(), x, y);
}

export function warmSign(): void {
  sign();
}

function paintSign(p: Painter): void {
  PLANKS.forEach((plank, i) => paintPlank(p, plank, i));
  // Lettering: "Nor" white, a gap, "DIY" yellow, centred, with a dark shadow.
  const words: Array<[string, string]> = [
    ['Nor', PAINT.white],
    ['DIY', PAINT.yellow],
  ];
  const width = words.reduce((sum, [word]) => sum + wordWidth(word), 0) + 3;
  let x = Math.floor((SIGN_W - width) / 2);
  const y = 4;
  for (const [word, color] of words) {
    paintWord(p, word, x + 1, y + 1, PAINT.shadow);
    paintWord(p, word, x, y, color);
    x += wordWidth(word) + 3;
  }
  // A drip running down from the yellow D.
  const dripX = x - wordWidth('DIY') - 3 + 1;
  p.rect(PAINT.yellow, dripX, y + 7, 1, 3);
  p.px(PAINT.yellow, dripX, y + 11);
}

function paintPlank(p: Painter, plank: (typeof PLANKS)[number], salt: number): void {
  const half = Math.floor(SIGN_W / 2);
  for (let x = plank.left; x < SIGN_W - plank.right; x++) {
    const drop = x >= half ? plank.tilt : 0;
    const top = plank.y + drop;
    p.rect(WOOD.base, x, top, 1, plank.h);
    p.px(WOOD.light, x, top);
    p.px(WOOD.edge, x, top + plank.h - 1);
    // Grain: broken streaks along the plank.
    if (noise(x, salt, 7) < 0.55) p.px(WOOD.grain, x, top + 1 + Math.floor(noise(x >> 3, salt, 8) * (plank.h - 2)));
  }
  // Uneven, darker ends.
  p.rect(WOOD.edge, plank.left, plank.y, 1, plank.h);
  p.rect(WOOD.edge, SIGN_W - plank.right - 1, plank.y + plank.tilt, 1, plank.h);
  // Two nails near each end.
  for (const x of [plank.left + 2, SIGN_W - plank.right - 3]) {
    const top = plank.y + (x >= half ? plank.tilt : 0) + Math.floor(plank.h / 2) - 1;
    p.px(WOOD.nail, x, top);
    p.px(WOOD.nailLight, x - 1, top);
  }
}

function wordWidth(word: string): number {
  let w = -1;
  for (const ch of word) w += GLYPHS[ch]![0]!.length + 1;
  return w;
}

function paintWord(p: Painter, word: string, x: number, y: number, color: string): void {
  for (const ch of word) {
    const rows = GLYPHS[ch]!;
    rows.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) if (row[dx] === '#') p.px(color, x + dx, y + dy);
    });
    x += rows[0]!.length + 1;
  }
}

/**
 * Warm bulbs on a wire sagging `sag` px between (x0, y0) and (x1, y1), one
 * every 4 px, a few twinkling with `time`. Drawn straight into `g` (no allocation).
 */
export function stringLights(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, sag: number, time: number): void {
  const left = Math.min(x0, x1);
  const span = Math.max(1, Math.abs(x1 - x0));
  const yl = x0 < x1 ? y0 : y1;
  const yr = x0 < x1 ? y1 : y0;
  const twinkle = Math.floor(time * 3);
  for (let i = 0; i <= span; i++) {
    const t = i / span;
    const y = Math.round(yl + (yr - yl) * t + sag * 4 * t * (1 - t));
    g.fillStyle = WIRE;
    g.fillRect(left + i, y, 1, 1);
    if (i % 4 !== 2) continue;
    const bulb = (i >> 2) % BULBS.length;
    g.fillStyle = (i + twinkle * 4) % 28 === 2 ? GLOW : BULBS[bulb]!;
    g.fillRect(left + i, y + 1, 1, 2);
  }
}
