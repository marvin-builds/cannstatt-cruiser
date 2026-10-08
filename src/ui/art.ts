/**
 * UI palette and pixel icons (palette sprites, rasterised once on first draw).
 */
import { type Sprite, sprite } from '../core/sprite';
import { rowsFromString } from '../core/sprite-data';
import type { CarriedItem } from '../types';

export const UI = {
  ink: '#1b1f2e',
  white: '#fff4e0',
  muted: '#b9c0d8',
  yellow: '#ffd23f',
  orange: '#ff8c42',
  red: '#e84855',
  teal: '#3fc1c9',
  empty: '#4a4a5c',
  dim: 'rgba(16, 18, 30, 0.62)',
  /** Warm haze over the street while chilled (alpha scaled by the effect strength). */
  chillTint: '255, 150, 80',
  chillBar: '#ff9a3c',
  /** Sweet pink tint while the bubble gum works (kid mode). */
  gumTint: '255, 140, 205',
  pink: '#ff7eb6',
  /** Deeper edge haze of the chill tints (adult, kid mode), so the tint shows even on a warm sky. */
  chillEdge: '200, 70, 30',
  gumEdge: '220, 50, 160',
  /** Woozy look while drunk: a faint beer-amber wash and a greenish-dark vignette at the sides. */
  drunkTint: '255, 200, 70',
  drunkEdge: '60, 80, 30',
  drunkBar: '#f5b52e',
  /** Settings menu: button face and the "on" colour. */
  buttonFace: '#10121e',
  buttonEdge: '#c9c3b8',
  green: '#7bd389',
  /** Opaque plates (HUD, banner, panels, buttons): translucent ones turned clouds into grey smudges. */
  panel: '#20243a',
  plateEdge: '#8a8a94',
} as const;

export const STAR = sprite({ y: UI.yellow, o: UI.orange, k: UI.ink }, [`
  ...k...
  ..kyk..
  kkkyykk
  kyyyyok
  .kyyok.
  .kyoyk.
  .kk.kk.
`]);

const HEART_PALETTE = { r: UI.red, w: UI.white, d: UI.empty, k: UI.ink };
const HEART_FULL = `
  .kk.kk.
  krwkrrk
  krrrrrk
  .krrrk.
  ..krk..
  ...k...
`;

/** Frame 0 full, frame 1 empty. */
export const HEART = sprite(HEART_PALETTE, [
  HEART_FULL,
  `
  .kk.kk.
  kddkddk
  kdddddk
  .kdddk.
  ..kdk..
  ...k...
`,
]);

/** Rounded square plate, `size` px, drawn behind every HUD icon (14 on desktop, 22 on touch). */
function plateArt(size: number): string[] {
  return Array.from({ length: size }, (_, y) => {
    const edgeRow = y === 0 || y === size - 1;
    const nearRow = y === 1 || y === size - 2;
    return Array.from({ length: size }, (_, x) => {
      const edgeCol = x === 0 || x === size - 1;
      const nearCol = x === 1 || x === size - 2;
      if ((edgeRow && (edgeCol || nearCol)) || (nearRow && edgeCol)) return '.';
      return edgeRow || edgeCol || (nearRow && nearCol) ? 'e' : 'b';
    }).join('');
  });
}

const plates = new Map<number, Sprite>();

/** The button plate of the given size (cached). */
export function buttonPlateSprite(size: number): Sprite {
  let plate = plates.get(size);
  if (!plate) {
    plate = sprite({ b: UI.panel, e: UI.plateEdge }, [plateArt(size)]);
    plates.set(size, plate);
  }
  return plate;
}

/** Every pixel of `art` as an n x n block. */
function upscale(art: readonly string[], n: number): string[] {
  return art.flatMap((row) => Array<string>(n).fill(row.replace(/./g, (ch) => ch.repeat(n))));
}

/** An icon drawn crisp at any integer scale (1x desktop HUD, 2x touch HUD, 3x the touch item button). */
export class PixelIcon {
  readonly width: number;
  readonly height: number;
  private readonly rows: string[][];
  private readonly sizes = new Map<number, Sprite>();

  constructor(
    private readonly palette: Record<string, string>,
    frames: readonly string[],
  ) {
    this.rows = frames.map((f) => rowsFromString(f));
    this.height = this.rows[0]!.length;
    this.width = this.rows[0]![0]!.length;
  }

  draw(g: CanvasRenderingContext2D, frame: number, x: number, y: number, scale: number): void {
    const n = Math.max(1, Math.round(scale));
    let size = this.sizes.get(n);
    if (!size) {
      size = sprite(this.palette, this.rows.map((r) => upscale(r, n)));
      this.sizes.set(n, size);
    }
    size.draw(g, frame, x, y);
  }
}

/** A full heart for popups ("Lecker! +1"), at the popup's scale. */
export const HEART_ICON = new PixelIcon(HEART_PALETTE, [HEART_FULL]);

const ICON = { w: UI.white, r: UI.red };

/** 8x8 icons (16x16 on touch) centred on the button plate. */
export const ICON_SIZE = 8;

export const ICON_PAUSE = new PixelIcon(ICON, [`
  ........
  .ww..ww.
  .ww..ww.
  .ww..ww.
  .ww..ww.
  .ww..ww.
  .ww..ww.
  ........
`]);

export const ICON_PLAY = new PixelIcon(ICON, [`
  ........
  .w......
  .www....
  .wwwww..
  .wwwww..
  .www....
  .w......
  ........
`]);

/** Frame 0 sound on, frame 1 muted. */
export const ICON_SOUND = new PixelIcon(ICON, [
  `
  ........
  ...w..w.
  ..ww...w
  www..w.w
  www..w.w
  ..ww...w
  ...w..w.
  ........
`,
  `
  ........
  ...w....
  ..ww.r.r
  www...r.
  www..r.r
  ..ww....
  ...w....
  ........
`,
]);

/** Frame 0 enter fullscreen, frame 1 leave it. */
export const ICON_FULLSCREEN = new PixelIcon(ICON, [
  `
  ww....ww
  w......w
  ........
  ........
  ........
  ........
  w......w
  ww....ww
`,
  `
  .w....w.
  ww....ww
  ........
  ........
  ........
  ........
  ww....ww
  .w....w.
`,
]);

const ROTATE_ART = [
  '.wwwwwwww...........',
  '.wssssssw...........',
  '.wssssssw...........',
  '.wssssssw....yy.....',
  '.wssssssw......y....',
  '.wssssssw.......y...',
  '.wssssssw.......y...',
  '.wssssssw.....y.y.y.',
  '.wssssssw......yyy..',
  '.wssssssw.......y...',
  '.wssssssw...........',
  '.wssssssw...........',
  '.wwwwwwww...........',
  '.www..www...........',
  '.wwwwwwww...........',
];

/** Phone turning to landscape, for the portrait hint (drawn at twice the pixel size so it reads on a phone). */
export const ROTATE = sprite({ w: UI.white, s: UI.teal, y: UI.yellow }, [
  ROTATE_ART.flatMap((row) => {
    const wide = row.replace(/./g, '$&$&');
    return [wide, wide];
  }),
]);

/** Small joint for the chill timer row (CHILL_ICON_W wide). */
export const JOINT_ICON = sprite({ k: UI.ink, c: '#d8a86a', w: '#f4f1ea', r: '#ff5a2a', o: '#ffb03a', g: UI.muted }, [`
  .........g.
  ........g..
  ..kkkkkkkk.
  kkwwwwwwwrk
  kcwwwwwwwok
  .kkkkkkkkk.
`]);

/** Kid mode's chill timer icon: a big and a small pink bubble (CHILL_ICON_W wide, like JOINT_ICON). */
export const GUM_ICON = sprite({ k: UI.ink, p: UI.pink, W: '#ffe0ef', d: '#d9508f' }, [`
  .kkkk......
  kpWWpk.....
  kpWppk..kk.
  kpppdk.kWpk
  kppddk.kpdk
  .kkkk...kk.
`]);

/** Carried items (state.carriedItem), outlined like the skater's art; colours as the player draws them. */
const ITEM_PALETTE = {
  k: UI.ink,
  b: '#f4f1ea', // football white
  q: '#2a2a2e', // football patches
  w: '#f7f3ea', // pretzel salt, beer foam
  z: '#c47a35', // pretzel crust
  Z: '#8a4a1c',
  y: '#f5b52e', // beer
  Y: '#c9821a',
  g: '#cfe2ea', // mug glass
  L: '#a3602c', // gingerbread
  i: '#fff4f4', // icing
  P: '#ff7aa8',
  x: '#2f6fd6', // ribbon
};

/** Item icons for the touch item button (3x) and the desktop chip (1x); the beer also marks the drunk timer row. */
export const ITEM_ICONS: Record<CarriedItem, PixelIcon> = {
  football: new PixelIcon(ITEM_PALETTE, [`
    ..kkkk..
    .kbbbbk.
    kbbqqbbk
    kbqqqqbk
    kbqqqqbk
    kbbqqbbk
    .kbbbbk.
    ..kkkk..
  `]),
  pretzel: new PixelIcon(ITEM_PALETTE, [`
    .kkk.kkk.
    kzwzkzwzk
    kz.kzk.zk
    kzzzkzzzk
    .kz.k.zk.
    ..kzZzk..
    ...kkk...
  `]),
  beer: new PixelIcon(ITEM_PALETTE, [`
    .wwwww..
    kwwwwwk.
    kyyyygkk
    kyYyyg.k
    kyYyygkk
    kyyyygk.
    .kkkkk..
  `]),
  gingerbread: new PixelIcon(ITEM_PALETTE, [`
    ..x.x..
    .kkxkk.
    kiikiik
    kiLPLik
    .kiLik.
    ..kik..
    ...k...
  `]),
};
