import { GROUND_Y } from '../../core/config';
import { mixColor } from '../color';
import { lazyCanvas, type Prop } from './paint';

/**
 * Small flags hanging down from a window sill of a mid-layer house by their
 * hoist edge (a flag rotated 90 degrees clockwise: hoist on top, stripes run
 * vertically), with a slight drape and a gentle flutter (pre-rendered frames,
 * nothing allocated per frame). The flag logic (stripes, triangle, drape) is
 * pure; only `withFlag` paints.
 */
export interface FlagSpec {
  readonly name: string;
  /** A multiple of the stripe count, so every stripe gets the same width. */
  readonly width: number;
  readonly height: number;
  readonly colors: Readonly<Record<string, string>>;
  /** Vertical stripes, left to right. */
  readonly stripes: readonly string[];
  /** Isosceles triangle along the hoist (top edge), pointing down `depth` px at its tip. */
  readonly triangle?: { readonly color: string; readonly depth: number };
}

const PALESTINE_COLORS = { black: '#1d1d1b', white: '#f6f4ee', green: '#2a9a4a', red: '#d8302f' } as const;

/** Black, white, green from the top, turned clockwise: green on the left. */
export const PALESTINE_FLAG: FlagSpec = {
  name: 'Palestine',
  width: 6,
  height: 8,
  colors: PALESTINE_COLORS,
  stripes: [PALESTINE_COLORS.green, PALESTINE_COLORS.white, PALESTINE_COLORS.black],
  triangle: { color: PALESTINE_COLORS.red, depth: 3 },
};

const TRANS_COLORS = { blue: '#5bcefa', pink: '#f5a9b8', white: '#ffffff' } as const;

export const TRANS_FLAG: FlagSpec = {
  name: 'trans pride',
  width: 5,
  height: 8,
  colors: TRANS_COLORS,
  stripes: [TRANS_COLORS.blue, TRANS_COLORS.pink, TRANS_COLORS.white, TRANS_COLORS.pink, TRANS_COLORS.blue],
};

/** Colour of the flat (undraped) hanging flag at (x, y). */
export function flagColor(flag: FlagSpec, x: number, y: number): string {
  const tri = flag.triangle;
  if (tri) {
    const half = flag.width / 2;
    const reach = tri.depth * (1 - Math.abs(x + 0.5 - half) / half);
    if (y < Math.ceil(reach)) return tri.color;
  }
  return flag.stripes[Math.floor((x * flag.stripes.length) / flag.width)]!;
}

/** Flutter frames and their rate: a slow, calm breeze. */
export const FLAG_FRAMES = 4;
const FLAG_FPS = 2;

/** First row that swings 1 px sideways, per frame (the top rows stay on the sill). */
function swayFrom(flag: FlagSpec, frame: number): number {
  const rows = [flag.height, flag.height - 2, Math.ceil(flag.height / 2), flag.height - 2];
  return rows[frame % FLAG_FRAMES]!;
}

/** Horizontal shift (0 or 1 px) of row `y` in flutter frame `frame`. */
export function drapeShift(flag: FlagSpec, y: number, frame: number): number {
  return y > 1 && y >= swayFrom(flag, frame) ? 1 : 0;
}

/** Row of the shaded fold in flutter frame `frame`: wanders across the lower part. */
export function foldRow(flag: FlagSpec, frame: number): number {
  const offsets = [3, 2, 3, 4];
  return flag.height - offsets[frame % FLAG_FRAMES]!;
}

/**
 * House-local x range [from, to) the flag hung at `dx` paints (flag, sway and
 * wall shadow): the part street props must leave uncovered.
 */
export function flagSpan(flag: FlagSpec, dx: number): { from: number; to: number } {
  return { from: dx, to: dx + flag.width + 2 };
}

/** Soft shadow the flag casts on the wall right of and below it. */
const WALL_SHADOW = 'rgba(40, 30, 20, 0.22)';

/**
 * `house` with `flag` hanging down from a window sill: the flag's top-left pixel
 * sits at (`dx`, `top`) in the house prop's own pixels, where the prop is
 * `houseH` high and stands on the ground. Each flag hangs only once per zone
 * visit: put the flagged house in its layer's intro, never in the fillers or
 * landmarks (those use the plain house).
 */
export function withFlag(house: Prop, houseH: number, flag: FlagSpec, dx: number, top: number): Prop {
  const frames = Array.from({ length: FLAG_FRAMES }, (_, f) =>
    lazyCanvas(flag.width + 2, flag.height + 1, (p) => {
      const fold = foldRow(flag, f);
      for (let y = 0; y < flag.height; y++) {
        const shift = drapeShift(flag, y, f);
        for (let x = 0; x < flag.width; x++) {
          const color = flagColor(flag, x, y);
          p.px(y === fold ? mixColor(color, '#000000', 0.18) : color, x + shift, y);
        }
        p.px(WALL_SHADOW, flag.width + shift, y + 1);
      }
      p.rect(WALL_SHADOW, 1 + drapeShift(flag, flag.height - 1, f), flag.height, flag.width - 1, 1);
    }),
  );
  const y = GROUND_Y - houseH + top;
  return {
    width: house.width,
    flag: flag.name,
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
