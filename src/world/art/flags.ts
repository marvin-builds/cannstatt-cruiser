import { GROUND_Y } from '../../core/config';
import { mixColor } from '../color';
import { lazyCanvas, type Prop } from './paint';

/**
 * Small flags hanging from a window sill of a mid-layer house, with a slight
 * drape and a gentle flutter (pre-rendered frames, nothing allocated per frame).
 * The flag logic (stripes, triangle, drape) is pure; only `withFlag` paints.
 */
export interface FlagSpec {
  readonly name: string;
  readonly width: number;
  /** A multiple of the stripe count, so every stripe gets the same height. */
  readonly height: number;
  readonly colors: Readonly<Record<string, string>>;
  /** Horizontal stripes, top to bottom. */
  readonly stripes: readonly string[];
  /** Isosceles triangle at the hoist (left edge), `depth` px into the flag at its tip. */
  readonly triangle?: { readonly color: string; readonly depth: number };
}

const PALESTINE_COLORS = { black: '#1d1d1b', white: '#f6f4ee', green: '#2a9a4a', red: '#d8302f' } as const;

export const PALESTINE_FLAG: FlagSpec = {
  name: 'Palestine',
  width: 8,
  height: 6,
  colors: PALESTINE_COLORS,
  stripes: [PALESTINE_COLORS.black, PALESTINE_COLORS.white, PALESTINE_COLORS.green],
  triangle: { color: PALESTINE_COLORS.red, depth: 3 },
};

const TRANS_COLORS = { blue: '#5bcefa', pink: '#f5a9b8', white: '#ffffff' } as const;

export const TRANS_FLAG: FlagSpec = {
  name: 'trans pride',
  width: 8,
  height: 5,
  colors: TRANS_COLORS,
  stripes: [TRANS_COLORS.blue, TRANS_COLORS.pink, TRANS_COLORS.white, TRANS_COLORS.pink, TRANS_COLORS.blue],
};

/** Colour of the flat (undraped) flag at (x, y). */
export function flagColor(flag: FlagSpec, x: number, y: number): string {
  const tri = flag.triangle;
  if (tri) {
    const half = flag.height / 2;
    const reach = tri.depth * (1 - Math.abs(y + 0.5 - half) / half);
    if (x < Math.ceil(reach)) return tri.color;
  }
  return flag.stripes[Math.floor((y * flag.stripes.length) / flag.height)]!;
}

/** Flutter frames and their rate: a slow, calm breeze. */
export const FLAG_FRAMES = 4;
const FLAG_FPS = 2;

/** First row that swings 1 px towards the fly, per frame (the top row stays on the sill). */
function swayFrom(flag: FlagSpec, frame: number): number {
  const rows = [flag.height, flag.height - 1, Math.ceil(flag.height / 2), flag.height - 1];
  return rows[frame % FLAG_FRAMES]!;
}

/** Horizontal shift (0 or 1 px) of row `y` in flutter frame `frame`. */
export function drapeShift(flag: FlagSpec, y: number, frame: number): number {
  return y > 0 && y >= swayFrom(flag, frame) ? 1 : 0;
}

/** Column of the shaded fold in flutter frame `frame`: wanders across the fly half. */
export function foldColumn(flag: FlagSpec, frame: number): number {
  const offsets = [3, 4, 3, 2];
  return flag.width - offsets[frame % FLAG_FRAMES]!;
}

/** Soft shadow the flag casts on the wall right of and below it. */
const WALL_SHADOW = 'rgba(40, 30, 20, 0.22)';

/**
 * `house` with `flag` hanging from a window sill: the flag's top-left pixel
 * sits at (`dx`, `top`) in the house prop's own pixels, where the prop is
 * `houseH` high and stands on the ground.
 */
export function withFlag(house: Prop, houseH: number, flag: FlagSpec, dx: number, top: number): Prop {
  const frames = Array.from({ length: FLAG_FRAMES }, (_, f) =>
    lazyCanvas(flag.width + 2, flag.height + 1, (p) => {
      const fold = foldColumn(flag, f);
      for (let y = 0; y < flag.height; y++) {
        const shift = drapeShift(flag, y, f);
        for (let x = 0; x < flag.width; x++) {
          const color = flagColor(flag, x, y);
          p.px(x === fold ? mixColor(color, '#000000', 0.18) : color, x + shift, y);
        }
        p.px(WALL_SHADOW, flag.width + shift, y + 1);
      }
      p.rect(WALL_SHADOW, 1 + drapeShift(flag, flag.height - 1, f), flag.height, flag.width - 1, 1);
    }),
  );
  const y = GROUND_Y - houseH + top;
  return {
    width: house.width,
    draw: (g, x, time, seed) => {
      house.draw(g, x, time, seed);
      g.drawImage(frames[Math.floor(time * FLAG_FPS) % FLAG_FRAMES]!(), x + dx, y);
    },
    warm: () => {
      house.warm();
      frames.forEach((c) => c());
    },
  };
}
