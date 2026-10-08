/**
 * Sprite strings of the skater (a relaxed 40-50 year old cruiser: navy cap,
 * dark hair with a hint of grey at the temple, red hoodie, jeans, white sneakers) and his
 * longboard. He faces right; only the grind trick turns him to the camera
 * (front view, the only view that shows his moustache). Body frames are composed from shared parts (see compose.ts).
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
  h: '#3b302c', // hair, dark brown-grey
  H: '#cacaca', // hair, grey at the temple (1-2 px)
  m: '#2e2420', // moustache (front view only)
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
 * Head facing right, 11 x 8, the same in every side frame. Navy cap with a
 * dark brim over the eyes; under it dark hair (h) at the side and down the
 * back of the head, with one grey pixel (H) at the temple, just under the cap.
 * Clean skin face: one eye pixel, the nose sticks out one pixel, the mouth is
 * the outline pixel just under it.
 */
const HEAD = `
  ..kkkkk....
  .kcccccck..
  kcccccccCCk
  khhHssssk..
  khhhSsksssk
  khhsssssk..
  .khsssssk..
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
  khhHskkkk..
  khhhSpesssk
  khhsEEEsk..
  .khsssssk..
  ..kkssskk..
`;

/**
 * Grind trick, turning (3/4 view, the in-between frame): two eyes, the nose
 * still to the right, no moustache yet. Same 11 x 8 box as HEAD.
 */
const HEAD_TURN = `
  ..kkkkkk...
  .kcccccccck
  kccccCCCCCk
  khHsssssk..
  khsksskssk.
  khssssSssk.
  .ksssssssk.
  ..kkssskk..
`;

/**
 * Grind trick, front view (11 x 9): the brim seen from the front, dark hair
 * and sideburns at both sides with one grey pixel at each temple, two eyes, the nose in
 * the middle, the moustache and the mouth under it.
 */
const HEAD_FRONT = `
  ..kkkkkkk..
  .kccccccck.
  kCCCCCCCCCk
  khHsssssHhk
  khskssskshk
  khsssSssshk
  .ksmmmmmsk.
  ..ksskssk..
  ...kkkkk...
`;

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

/**
 * The arms-out / arms-up torsos without the front (right) arm, for poses where
 * that arm is busy (item use, drunk flail, see use-art.ts): the shoulder is closed.
 */
const TORSO_ARMS_OUT_ONE = `
  ......kRrrrrk......
  .....kRrrrrrrk.....
  kkkkkkRrrrrrrk.....
  sRRRRRRrrrrrrk.....
  kkkkkkRrrrrrrk.....
  .....kRrrrrrk......
  .....kRrrrrrk......
  .....kRRRRRRk......
  .....kjjjjjjk......
`;

const TORSO_ARMS_UP_ONE = `
  ks.................
  .kRk...............
  ..kRk.kRrrrrk......
  ...kRkRrrrrrrk.....
  ....kRRrrrrrrk.....
  .....kRrrrrrrk.....
  .....kRrrrrrk......
  .....kRrrrrrk......
  .....kRRRRRRk......
  .....kjjjjjjk......
`;

/** Grind trick, front view: arms spread, the hoodie strings hanging down. */
const TORSO_FRONT = `
  ......kRrrrrk......
  .....krrwrwrrk.....
  kkkkkkrrwrwrrkkkkkk
  sRRRRRrrwrwrrRRRRRs
  kkkkkkrrrrrrrkkkkkk
  .....kRrrrrrRk.....
  .....kRrrrrrRk.....
  .....kRrrrrrRk.....
  .....kjjjjjjjk.....
`;

const TORSO_FRONT_ONE = `
  ......kRrrrrk......
  .....krrwrwrrk.....
  kkkkkkrrwrwrrk.....
  sRRRRRrrwrwrrk.....
  kkkkkkrrrrrrrk.....
  .....kRrrrrrRk.....
  .....kRrrrrrRk.....
  .....kRrrrrrRk.....
  .....kjjjjjjjk.....
`;

/** Torso art -> the same torso with the front arm off (torsos not listed keep their arms close to the body). */
const ONE_ARM: ReadonlyMap<string, string> = new Map([
  [TORSO_ARMS_OUT, TORSO_ARMS_OUT_ONE],
  [TORSO_ARMS_UP, TORSO_ARMS_UP_ONE],
  [TORSO_FRONT, TORSO_FRONT_ONE],
]);

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

/** Grind trick: seen from the front, both feet across the deck, knees a little bent. */
const LEGS_FRONT = `
  ........kjjjjjjk........
  .......kjjjjjjjjk.......
  .......kjjJkkJjjk.......
  ......kjjJk..kJjjk......
  ......kjjk....kjjk......
  ......kjJk....kJjk......
  ......kjjk....kjjk......
  .....kwwwk....kwwwk.....
  ....kWWWWk....kWWWWk....
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

/**
 * Bin crash (head first in the bin): the legs stick up out of the bin, soles
 * up, toes pointing back. The hips sit below row 13, where the bin rim covers
 * them (the bin is drawn over the body, see render.ts).
 */
const BIN_LEGS_WIDE = `
  ........................
  ........................
  .kkkkk.........kkkkk....
  kWWWWWk.......kWWWWWk...
  .kwwwwk........kwwwwk...
  ...kjJk.........kjJk....
  ...kjJk.........kjJk....
  ....kjJk.......kjJk.....
  ....kjJk.......kjJk.....
  .....kjJk.....kjJk......
  .....kjJk.....kjJk......
  ......kjJk...kjJk.......
  .......kjjjjjjjjk.......
  .......kjjjjjjjjk.......
  .......kjjjjjjjjk.......
`;

/** Bin crash: the legs close up and kick higher (alternates with BIN_LEGS_WIDE). */
const BIN_LEGS_NARROW = `
  .....kkkkk..kkkkk.......
  ....kWWWWWkkWWWWWk......
  .....kwwwwk.kwwwwk......
  .......kjJk..kjjk.......
  .......kjJk..kjjk.......
  .......kjJk..kjjk.......
  .......kjJk..kjjk.......
  ........kjJkkjjk........
  ........kjJkkjjk........
  ........kjJkkjjk........
  ........kjJkkjjk........
  .......kjjjjjjjjk.......
  .......kjjjjjjjjk.......
  .......kjjjjjjjjk.......
  .......kjjjjjjjjk.......
`;

/** Bin crash: the hoodie (upside down) still sticking out while he dives in. */
const BIN_HOODIE = `
  kRRRRRRRRk
  kRrrrrrrrk
  kRrrrrrrrk
  kRrrrrrrrk
  kRrrrrrrrk
  kRrrrrrrrk
  kRrrrrrrrk
`;

// ---------------------------------------------------------------- frames

interface Point {
  x: number;
  y: number;
}

/** Which way the head looks: right (every pose but the grind trick), turning, or at the camera. */
export type FaceView = 'side' | 'turn' | 'front';

interface HeadArt {
  normal: string;
  chill: string;
  /** Mouth pixel (joint, bubble gum, drinking) relative to the head's top-left. */
  mouth: Point;
}

/** Red eyes for a head drawn with two eye pixels at `eyes`: the eye turns red, a dark red line under it. */
function redEyes(art: string, eyes: Point[]): string {
  const rows = rowsFromString(art).map((row) => [...row]);
  for (const { x, y } of eyes) {
    rows[y]![x] = 'e';
    rows[y + 1]![x] = 'E';
    rows[y + 1]![x + 1] = 'E';
  }
  return rows.map((row) => row.join('')).join('\n');
}

const HEADS: Record<FaceView, HeadArt> = {
  side: { normal: HEAD, chill: HEAD_CHILL, mouth: { x: 8, y: 5 } },
  turn: { normal: HEAD_TURN, chill: redEyes(HEAD_TURN, [{ x: 3, y: 4 }, { x: 6, y: 4 }]), mouth: { x: 7, y: 6 } },
  front: { normal: HEAD_FRONT, chill: redEyes(HEAD_FRONT, [{ x: 3, y: 4 }, { x: 7, y: 4 }]), mouth: { x: 5, y: 7 } },
};

/**
 * Mouth of the side head (where the joint and the bubble gum sit), relative to the
 * head's top-left: the front outline pixel just under the nose.
 */
export const HEAD_MOUTH = HEADS.side.mouth;

/** One body frame: its parts and, when the head is visible, where the head goes (drawn last) and which way it looks. */
interface FrameSpec {
  parts: Part[];
  head?: Point;
  view?: FaceView;
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
  binDive: 15,
  binKickA: 16,
  binKickB: 17,
  grindTurn: 18,
  grindFront: 19,
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
  { parts: [at(BIN_LEGS_NARROW, 0, 0), at(BIN_HOODIE, 7, 15)] },
  { parts: [at(BIN_LEGS_WIDE, 0, 0)] },
  { parts: [at(BIN_LEGS_NARROW, 0, 0)] },
  { parts: [at(LEGS_FRONT, 0, 19), at(TORSO_ARMS_OUT, 2, 10)], head: { x: 7, y: 2 }, view: 'turn' },
  { parts: [at(LEGS_FRONT, 0, 19), at(TORSO_FRONT, 2, 10)], head: { x: 6, y: 1 }, view: 'front' },
];

function body(spec: FrameSpec, look: 'normal' | 'chill', oneArm = false): string[] {
  const parts = oneArm ? spec.parts.map((p) => ({ ...p, art: ONE_ARM.get(p.art as string) ?? p.art })) : spec.parts;
  const head = spec.head && at(HEADS[spec.view ?? 'side'][look], spec.head.x, spec.head.y);
  return composeFrame(BODY_W, BODY_H, head ? [...parts, head] : parts);
}

export const BODY_FRAMES: string[][] = FRAME_SPECS.map((spec) => body(spec, 'normal'));
/** The same frames with the red-eyed chill head (frames without a visible head are identical). */
export const CHILL_BODY_FRAMES: string[][] = FRAME_SPECS.map((spec) => body(spec, 'chill'));
/** The frames without the outstretched front arm, drawn while that arm uses an item or flails. */
export const ONE_ARM_BODY_FRAMES: string[][] = FRAME_SPECS.map((spec) => body(spec, 'normal', true));
export const CHILL_ONE_ARM_BODY_FRAMES: string[][] = FRAME_SPECS.map((spec) => body(spec, 'chill', true));
/** Top-left of the head inside each body frame, or null when no face is visible (tumble, lying). */
export const HEAD_AT: (Point | null)[] = FRAME_SPECS.map((spec) => spec.head ?? null);

/** The visible face of a body frame: head top-left, which way it looks and its mouth (body-frame pixels). */
export interface Face extends Point {
  view: FaceView;
  mouth: Point;
}

export const FACE_AT: (Face | null)[] = FRAME_SPECS.map(({ head, view = 'side' }) => {
  if (!head) return null;
  const { mouth } = HEADS[view];
  return { x: head.x, y: head.y, view, mouth: { x: head.x + mouth.x, y: head.y + mouth.y } };
});

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
