/**
 * Sprite strings of the skater (a relaxed 40-50 year old cruiser: navy cap,
 * dark-grey hair with a clean grey band under the cap, red hoodie, jeans, white sneakers) and his
 * longboard. Body frames are composed from shared parts (see compose.ts).
 *
 * Body frame: BODY_W x BODY_H; soles of a rider on the flat deck end just
 * above BODY_DECK_ROW, the pushing foot and the crash poses reach down to
 * BODY_GROUND_ROW. Board frame: BOARD_W x BOARD_H, the wheel bottom is the
 * last row. Both are centred on the contact point at *_ANCHOR_X.
 */
import { rowsFromString } from '../core/sprite-data';
import { composeFrame, type Part, shearColumns } from './compose';

export const PALETTE = {
  k: '#241c24', // outline
  s: '#e3a57c', // skin
  S: '#b97456', // skin shade, ear
  h: '#47444a', // hair, dark grey base
  H: '#cacaca', // hair, light grey band under the cap and down the back
  e: '#ff2236', // red eye (chill)
  p: '#ff9aae', // bloodshot pink eye (chill)
  E: '#b0102a', // dark red lower lid line (chill)
  c: '#2c4a6e', // cap
  C: '#1b304c', // cap brim
  r: '#bf4438', // hoodie
  R: '#86292b', // hoodie shade, arms
  j: '#4b6d9c', // jeans
  J: '#33507a', // jeans shade
  w: '#efe9dc', // sneaker
  W: '#9c9384', // sneaker sole
  g: '#2e2b33', // grip tape
  d: '#b97a43', // deck wood
  D: '#8a5530', // deck wood shade
  t: '#a9afb8', // truck
  T: '#6c717b', // truck shade
  o: '#f0902a', // wheel
  O: '#b45d16', // wheel shade
} as const;

export const BODY_W = 24;
export const BODY_H = 35;
/** Row just below the soles of a foot standing on the deck (= the grip tape row). */
export const BODY_DECK_ROW = 28;
/** Ground row (same as the board's wheel bottom) when the board is flat under the body. */
export const BODY_GROUND_ROW = 34;
export const BODY_ANCHOR_X = 12;

export const BOARD_W = 26;
/** Board art is 8 rows; the frame has headroom above it for the tilted frames. */
export const BOARD_H = 14;
/** Row of the grip tape (deck surface) in the flat board frame. */
export const BOARD_DECK_ROW = BOARD_H - 7;
export const BOARD_ANCHOR_X = 13;

// ---------------------------------------------------------------- parts

/**
 * Head facing right, 11 x 8, the same in every frame. Navy cap with a dark
 * brim over the eyes; under it one continuous light-grey band (H) along the
 * cap edge at the side and down the back of the head, around a small block
 * of the dark-grey base (h) behind the ear. Clean skin face: one eye pixel, the nose sticks out one
 * pixel, the mouth is the outline pixel just under it.
 */
const HEAD = `
  ..kkkkk....
  .kcccccck..
  kcccccccCCk
  kHHHssssk..
  kHhhSsksssk
  kHHsssssk..
  .kHsssssk..
  ..kkssskk..
`;

/**
 * Chill head: heavy dark lid over a bloodshot pink-and-red eye with a dark
 * red lower lid line. Same size, outline and hair as HEAD.
 */
const HEAD_CHILL = `
  ..kkkkk....
  .kcccccck..
  kcccccccCCk
  kHHHskkkk..
  kHhhSpesssk
  kHHsEEEsk..
  .kHsssssk..
  ..kkssskk..
`;

/**
 * Mouth of the head (where the joint and the bubble gum sit), relative to the
 * head's top-left: the front outline pixel just under the nose.
 */
export const HEAD_MOUTH = { x: 8, y: 5 } as const;

const TORSO_DOWN = `
  .kRrrrrk..
  kRrrrrrrk.
  kRrrRrrrk.
  kRrrRrrrrk
  kRrrRrrrrk
  kRrrRrrrrk
  kRrrsSrrk.
  kRRRRRRRk.
  kjjjjjjk..
`;

const TORSO_LEAN = `
  ..kRrrrk..
  .kRrrrrrk.
  kRrrrRrrrk
  kRrrrRrrrk
  kRrrrRRrk.
  kRrrrrRsk.
  kRrrrrrkk.
  kRRRRRRk..
  kjjjjjjk..
`;

const TORSO_ARMS_OUT = `
  ......kRrrrrk......
  .....kRrrrrrrk.....
  kkkkkkRrrrrrrkkkkkk
  sRRRRRRrrrrrrRRRRRs
  kkkkkkRrrrrrrkkkkkk
  .....kRrrrrrk......
  .....kRrrrrrk......
  .....kRRRRRRk......
  .....kjjjjjjk......
`;

const TORSO_ARMS_UP = `
  ks...............sk
  .kRk...........kRk.
  ..kRk.kRrrrrk.kRk..
  ...kRkRrrrrrrkRk...
  ....kRRrrrrrrRk....
  .....kRrrrrrrk.....
  .....kRrrrrrk......
  .....kRrrrrrk......
  .....kRRRRRRk......
  .....kjjjjjjk......
`;

const TORSO_CROUCH = `
  .kRrrrrk...
  kRrrrrrrk..
  kRrrrRrrrk.
  kRrrrrRRrrk
  kRrrrrrkRsk
  kRRRRRRk.k.
  kjjjjjjk...
`;

const LEGS_STAND = `
  ........kjjjjjjk........
  .......kjjJkjjjjk.......
  ......kjjJk.kjjjjk......
  ......kjJk...kjjjk......
  .....kjJk.....kjjjk.....
  .....kjjk.....kjjjk.....
  ....kjJk.......kjjk.....
  ...kwwwk.......kwwwwk...
  ..kWWWWWk......kWWWWWk..
`;

const LEGS_CROUCH = `
  ........kjjjjjjk........
  ......kjjjJJkjjjjjk.....
  ....kjjjJk...kjjjjjk....
  ...kjjJk......kkjjk.....
  ..kwwwk.......kwwwwk....
  .kWWWWWk......kWWWWWk...
`;

const LEGS_TUCK = `
  ........kjjjjjjk........
  .......kjjjJjjjjjk......
  ......kjjJkkjjjjjjk.....
  ......kjJk..kkjjjjk.....
  .....kwwwk....kjjk......
  ....kWWWWWk..kwwwwk.....
  ............kWWWWWk.....
`;

const LEGS_EXTEND = `
  ........kjjjjjjk........
  .......kjjJkjjjjk.......
  .......kjJk.kjjjk.......
  ......kjJk...kjjjk......
  ......kjJk....kjjk......
  .....kjJk.....kjjk......
  .....kjJk.....kjjk......
  ....kwwwk.....kwwwwk....
  ...kWWWWWk....kWWWWWk...
`;

/** Push: back foot on the ground under the hips. */
const LEGS_PUSH_DOWN = `
  .........kjjjjjjk.......
  .........kjjjJjjjk......
  .........kjJkkjjjjk.....
  .........kjJk.kjjjjk....
  .........kjJk..kjjjk....
  .........kjJk...kjjk....
  .........kjJk...kjjk....
  .........kjJk..kwwwwk...
  .........kjJk..kWWWWWk..
  .........kjJk...........
  .........kjJk...........
  .........kjJk...........
  .........kjJk...........
  .........kjjk...........
  ........kwwwwk..........
  .......kWWWWWk..........
`;

/** Push: back foot shoved back along the ground. */
const LEGS_PUSH_BACK = `
  .........kjjjjjjk.......
  ........kjjjjJjjjk......
  .......kjjJkkjjjjjk.....
  ......kjjJk..kjjjjjk....
  .....kjjJk....kjjjjk....
  ....kjjJk......kjjjk....
  ....kjJk.......kjjjk....
  ...kjJk.......kwwwwk....
  ...kjJk.......kWWWWWk...
  ..kjJk..................
  ..kjJk..................
  ..kjJk..................
  .kjjk...................
  .kwwk...................
  kwwwk...................
  kWWWk...................
`;

/** Push: back foot swinging forward above the ground. */
const LEGS_PUSH_SWING = `
  .........kjjjjjjk.......
  ........kjjjjJjjjk......
  ........kjJkkjjjjjk.....
  .......kjJk..kjjjjjk....
  .......kjJk...kjjjjk....
  .......kjJk.....kjjk....
  ........kjJk....kjjk....
  .........kjJk..kwwwwk...
  ..........kjk..kWWWWWk..
  .........kwwwwk.........
  ........kWWWWWk.........
`;

const LEGS_KNEEL = `
  ........kjjjjjjk........
  .......kjjjJjjjjk.......
  ......kjjJk.kjjjjk......
  .....kjjJk...kjjjk......
  ....kwwJk....kjjk.......
  ...kwwwjjjjk.kjjk.......
  ..kWWWkkkkkk.kwwwwk.....
  ............kWWWWWk.....
`;

/** Duck: hunched back, folded forward over the knees. */
const TORSO_DUCK = `
  ..kkkkkkk...
  .kRrrrrrrkk.
  kRrrrrrrrrrk
  kRrrrrRrrrrk
  kRrrrrrRRRsk
  kRRRRRRRRkk.
  kjjjjjjjk...
`;

/** Duck: deep squat, thighs level. */
const LEGS_DUCK = `
  .kjjjjjjjjjjjk..........
  .kjjjJjjjjjjjjjk........
  ..kjJk.....kjjjk........
  .kwwwk.....kwwwwk.......
  kWWWWWk....kWWWWWk......
`;

/** Crash: curled up mid-tumble (upside down, cap at the bottom right). */
const CRASH_BALL = `
  .kkk......
  kwwwk.....
  kWwwkkkk..
  .kkjjjjjk.
  ..kjjjjjjk
  .kRrrrrrjk
  kRrrrrrRkk
  kRrrrkkcck
  .kRrkhhcck
  ..kkHssCk.
  ....kkkk..
`;

/** Crash: sprawled on the ground, head first. */
const CRASH_LYING = `
  ............kkkkkk.kkkk.
  .kk.kkkkkkkkRrrrrrkcccck
  kwwkjjjjjjjjrrrrrrkhcCCk
  kwwkjJjjjJjjRrrrsrkHssSk
  kWWkjjjjjjjjRRRRRRkHsksk
  .kk.kkkkkkkkkkkkkk.kkkk.
`;

// ---------------------------------------------------------------- frames

interface Point {
  x: number;
  y: number;
}

/** One body frame: its parts and, when the head is visible, where the head goes (drawn last). */
interface FrameSpec {
  parts: Part[];
  head?: Point;
}

const at = (art: string, x: number, y: number): Part => ({ art, x, y });
const STD_HEAD: Point = { x: 7, y: 2 };

/** Body frame indices (see BODY_FRAMES). */
export const B = {
  ride: 0,
  pushDown: 1,
  pushBack: 2,
  pushSwing: 3,
  crouch: 4,
  airRise: 5,
  airFall: 6,
  landSquash: 7,
  grindA: 8,
  grindB: 9,
  crashThrown: 10,
  crashBall: 11,
  crashLying: 12,
  crashKneel: 13,
  duck: 14,
} as const;

const FRAME_SPECS: FrameSpec[] = [
  { parts: [at(LEGS_STAND, 0, 19), at(TORSO_DOWN, 7, 10)], head: STD_HEAD },
  { parts: [at(LEGS_PUSH_DOWN, 0, 19), at(TORSO_LEAN, 8, 11)], head: { x: 9, y: 3 } },
  { parts: [at(LEGS_PUSH_BACK, 0, 19), at(TORSO_LEAN, 8, 11)], head: { x: 9, y: 3 } },
  { parts: [at(LEGS_PUSH_SWING, 0, 19), at(TORSO_LEAN, 8, 11)], head: { x: 9, y: 3 } },
  { parts: [at(LEGS_CROUCH, 0, 22), at(TORSO_CROUCH, 7, 15)], head: { x: 9, y: 7 } },
  { parts: [at(LEGS_TUCK, 0, 21), at(TORSO_ARMS_OUT, 2, 12)], head: { x: 8, y: 4 } },
  { parts: [at(LEGS_EXTEND, 0, 19), at(TORSO_ARMS_UP, 2, 9)], head: STD_HEAD },
  { parts: [at(LEGS_CROUCH, 0, 22), at(TORSO_ARMS_OUT, 2, 14)], head: { x: 8, y: 6 } },
  { parts: [at(LEGS_STAND, 0, 19), at(TORSO_ARMS_OUT, 2, 10)], head: STD_HEAD },
  { parts: [at(LEGS_STAND, 0, 20), at(TORSO_ARMS_OUT, 2, 11)], head: { x: 7, y: 3 } },
  { parts: [at(LEGS_TUCK, 0, 17), at(TORSO_ARMS_UP, 5, 6)], head: { x: 10, y: 0 } },
  { parts: [at(CRASH_BALL, 7, BODY_GROUND_ROW - 10)] },
  { parts: [at(CRASH_LYING, 0, BODY_GROUND_ROW - 5)] },
  { parts: [at(LEGS_KNEEL, 0, BODY_GROUND_ROW - 7), at(TORSO_CROUCH, 7, 19)], head: { x: 9, y: 11 } },
  { parts: [at(LEGS_DUCK, 2, 23), at(TORSO_DUCK, 2, 17)], head: { x: 12, y: 15 } },
];

function body(spec: FrameSpec, headArt: string): string[] {
  const parts = spec.head ? [...spec.parts, at(headArt, spec.head.x, spec.head.y)] : spec.parts;
  return composeFrame(BODY_W, BODY_H, parts);
}

export const BODY_FRAMES: string[][] = FRAME_SPECS.map((spec) => body(spec, HEAD));
/** The same frames with the red-eyed chill head (frames without a visible head are identical). */
export const CHILL_BODY_FRAMES: string[][] = FRAME_SPECS.map((spec) => body(spec, HEAD_CHILL));
/** Top-left of the head inside each body frame, or null when no face is visible (tumble, lying). */
export const HEAD_AT: (Point | null)[] = FRAME_SPECS.map((spec) => spec.head ?? null);

// ---------------------------------------------------------------- board

/** Side view, facing right: kicktail at the left, big soft wheels. */
const BOARD_ART = rowsFromString(`
  gk......................k.
  kdggggggggggggggggggggggdk
  .kDdddddddddddddddddddddk.
  ....kTk............kTk....
  ....ooo............ooo....
  ...ootoO..........ootoO...
  ...ooooO..........ooooO...
  ....OOO............OOO....
`);

/** Board frame indices (see BOARD_FRAMES). */
export const BD = {
  flat: 0,
  pop: 1,
  noseUp: 2,
  noseDown: 3,
  upsideDown: 4,
  spinA: 5,
  spinB: 6,
} as const;

const REAR_WHEEL_X = 5;
const upsideDown = [...BOARD_ART].reverse();

export const BOARD_FRAMES: string[][] = [
  shearColumns(BOARD_ART, 0, BOARD_ANCHOR_X, BOARD_H),
  shearColumns(BOARD_ART, 0.15, REAR_WHEEL_X, BOARD_H),
  shearColumns(BOARD_ART, 0.12, BOARD_ANCHOR_X, BOARD_H),
  shearColumns(BOARD_ART, -0.12, BOARD_ANCHOR_X, BOARD_H),
  shearColumns(upsideDown, 0, BOARD_ANCHOR_X, BOARD_H),
  shearColumns(upsideDown, 0.2, BOARD_ANCHOR_X, BOARD_H),
  shearColumns(BOARD_ART, -0.2, BOARD_ANCHOR_X, BOARD_H),
];
