/**
 * NorDIY skatepark art (ROADMAP 36), drawn on the world's street layer under
 * the park line gameplay lays (geometry in ../park.ts). Back to front: the
 * concrete floor, the decor (art/park-decor.ts), the string lights from the
 * crane, then the structures exactly under their pieces: concrete banks at
 * the kickers, the self-built crane (lattice tower behind the boom's left
 * end, counterweight jib, still hook; the boom's top edge is the ledge) and
 * the shipping containers (corrugated steel, doors at the right end, corner
 * castings, rust; the roof edge is the ledge). The first long container
 * carries the wooden NorDIY sign at eye level with lights over it, and
 * graffiti tags that never cover the sign. Piece art is painted once per plan.
 */
import { GROUND_Y } from '../../core/config';
import type { ParkPiece, ParkPlan, RenderContext } from '../../types';
import type { CrowdCheer } from '../crowd';
import { CRANE_MAST, CRANE_TOWER_W, craneJib, type ParkStage, parkX, pieceRect, type PieceRect } from '../park';
import { drawDecor, drawFloor, warmDecor } from './park-decor';
import { drawSign, SIGN_H, SIGN_W, stringLights, warmSign } from './park-sign';
import { lazyCanvas, noise, type Painter } from './paint';

const K = '#1f1a1c';

interface ContainerLook {
  base: string;
  light: string;
  shade: string;
  dark: string;
  rust: string;
}

/** Rust red first, then blue. */
const CONTAINERS: readonly ContainerLook[] = [
  { base: '#a8452f', light: '#c25a40', shade: '#86361f', dark: '#5e2617', rust: '#7a4a24' },
  { base: '#2f6a9a', light: '#4482b4', shade: '#245579', dark: '#173a55', rust: '#8a5a32' },
];

const STEEL = { beam: '#d8a23a', light: '#f0c45a', shade: '#a4762a', dark: '#5b4220', rust: '#8a4f25', cable: '#3a3734' } as const;
const CONCRETE = { top: '#d2cfc6', base: '#bab7ae', shade: '#9c998f', dark: '#77746c', coping: '#e3e8ee' } as const;
const TAGS = ['#ff5fa2', '#f4f1e8', '#9be03a', '#ffd23f', '#5fd4ff'] as const;

/** Containers shorter than this carry no sign. */
const SIGN_MIN_LENGTH = SIGN_W + 8;
/** Width of the door end of a container. */
const DOOR_W = 16;
/** Bank: flat deck behind the lip before the back wall. */
const BANK_DECK = 5;

/** One structure prepared for drawing: its canvas and where it sits relative to the piece rect. */
interface Prepared {
  piece: ParkPiece;
  canvas: () => HTMLCanvasElement;
  /** Canvas left edge relative to the piece's x, and canvas top in view y. */
  dx: number;
  top: number;
  /** Sign position relative to the piece's x and view y (containers with the sign), else null. */
  sign: { dx: number; y: number } | null;
}

let preparedFor: ParkPlan | null = null;
let prepared: Prepared[] = [];
/** The crane and the container with the sign among `prepared` (the light string hangs between them). */
let crane: Prepared | undefined;
let lit: Prepared | undefined;
/** Reused piece rect. */
const rect: PieceRect = { x: 0, w: 0, top: 0 };

/** Paints the structures of `plan` (once per plan). */
function prepare(plan: ParkPlan): void {
  preparedFor = plan;
  let containers = 0;
  let signed = false;
  prepared = plan.pieces.map((piece) => {
    const w = Math.round(piece.to - piece.from);
    if (piece.kind === 'bank') {
      return {
        piece,
        canvas: lazyCanvas(w + BANK_DECK + 1, piece.height + 1, (p) => paintBank(p, w, piece.height)),
        dx: 0,
        top: GROUND_Y - piece.height,
        sign: null,
      };
    }
    if (piece.kind === 'crane') {
      const jib = craneJib(piece);
      const top = GROUND_Y - piece.height - CRANE_MAST;
      return { piece, canvas: lazyCanvas(w + jib, GROUND_Y - top + 1, (p) => paintCrane(p, w, jib, piece.height)), dx: -jib, top, sign: null };
    }
    const look = CONTAINERS[containers++ % CONTAINERS.length]!;
    const sign = !signed && w >= SIGN_MIN_LENGTH ? signSpot(w, piece.height) : null;
    if (sign) signed = true;
    const salt = containers * 31 + w;
    return {
      piece,
      canvas: lazyCanvas(w, piece.height + 1, (p) => paintContainer(p, w, piece.height, look, sign, salt)),
      dx: 0,
      top: GROUND_Y - piece.height,
      sign,
    };
  });
  crane = prepared.find((s) => s.piece.kind === 'crane');
  lit = prepared.find((s) => s.sign);
}

/** Sign at eye level on the container front, left of the doors, below the lights. */
function signSpot(w: number, height: number): { dx: number; y: number } {
  const dx = Math.max(4, Math.round((w - DOOR_W - SIGN_W) / 2));
  const y = Math.max(GROUND_Y - height + 11, GROUND_Y - 33);
  return { dx, y: Math.min(y, GROUND_Y - SIGN_H - 2) };
}

/** Draws the NorDIY park this frame (world layer, after the ground). */
export function drawPark(r: RenderContext, stage: ParkStage, crowd: CrowdCheer, time: number): void {
  const plan = stage.plan;
  if (!plan || !stage.span) return;
  const { g, state, scrollLead, display } = r;
  const from = parkX(stage.span.from, state.distance, scrollLead);
  const to = parkX(stage.span.to, state.distance, scrollLead);
  if (to < 0 || from > display.viewWidth) return;
  if (plan !== preparedFor) prepare(plan);
  drawFloor(g, from, to);
  drawDecor(g, stage.slots, state.distance, scrollLead, time, crowd, state.kidMode);
  if (crane && lit) craneLights(g, crane, lit, state.distance, scrollLead, time);
  // Containers last: a crane's jib and counterweight go behind a neighbouring container.
  for (let i = 0; i < prepared.length; i++) if (prepared[i]!.piece.kind !== 'container') drawPiece(g, prepared[i]!, state.distance, scrollLead, time);
  for (let i = 0; i < prepared.length; i++) if (prepared[i]!.piece.kind === 'container') drawPiece(g, prepared[i]!, state.distance, scrollLead, time);
}

function drawPiece(g: CanvasRenderingContext2D, s: Prepared, distance: number, scrollLead: number, time: number): void {
  pieceRect(s.piece, distance, scrollLead, rect);
  g.drawImage(s.canvas(), rect.x + s.dx, s.top);
  if (!s.sign) return;
  drawSign(g, rect.x + s.sign.dx, s.sign.y);
  stringLights(g, rect.x + 2, rect.top + 3, rect.x + rect.w - 3, rect.top + 3, 5, time);
}

/** A light string from the crane mast to the signed container's nearer roof corner (behind both). */
function craneLights(g: CanvasRenderingContext2D, crane: Prepared, lit: Prepared, distance: number, lead: number, time: number): void {
  const mastX = parkX(crane.piece.from, distance, lead);
  const mastY = GROUND_Y - crane.piece.height - 6;
  pieceRect(lit.piece, distance, lead, rect);
  const cornerX = lit.piece.from < crane.piece.from ? rect.x + rect.w - 2 : rect.x + 1;
  if (Math.abs(cornerX - mastX) > 170) return;
  stringLights(g, mastX, mastY, cornerX, rect.top + 2, 9, time);
}

export function warmPark(): void {
  warmDecor();
  warmSign();
}

function paintContainer(p: Painter, w: number, h: number, look: ContainerLook, sign: { dx: number; y: number } | null, salt: number): void {
  const H = h + 1;
  // Corrugated side: ribs of light / base / shade every 4 px.
  for (let x = 0; x < w; x++) {
    const rib = x % 4;
    p.rect(rib === 0 ? look.light : rib === 3 ? look.shade : look.base, x, 0, 1, H);
  }
  // Top rail (row 0 is the roof edge, the grind surface) and bottom rail.
  p.rect(look.light, 0, 0, w, 1);
  p.rect(look.dark, 0, 1, w, 1);
  p.rect(look.shade, 0, 2, w, 1);
  p.rect(look.dark, 0, H - 3, w, 3);
  // Corner posts with castings.
  for (const x of [0, w - 3]) {
    p.rect(look.shade, x, 0, 3, H);
    p.rect(look.dark, x + (x === 0 ? 2 : 0), 3, 1, H - 6);
    for (const y of [0, H - 3]) {
      p.rect('#8d8a86', x, y, 3, 3);
      p.px(K, x + 1, y + 1);
    }
  }
  paintDoors(p, w - 3 - DOOR_W, H, look);
  // Rust streaks running down from the roof and patches near the bottom.
  for (let x = 4; x < w - 4; x++) {
    const n = noise(x, salt, 3);
    if (n < 0.1) p.rect(look.rust, x, 3, 1, 3 + Math.floor(noise(x, salt, 4) * 9));
    if (n > 0.93) p.rect(look.rust, x, H - 6 - Math.floor(noise(x, salt, 5) * 3), 2, 3);
  }
  paintTags(p, w, H, sign, salt);
}

/** The door end: two leaves with vertical locking bars and handles. */
function paintDoors(p: Painter, x: number, H: number, look: ContainerLook): void {
  p.rect(look.base, x, 3, DOOR_W, H - 6);
  p.rect(look.dark, x, 3, 1, H - 6);
  p.rect(look.dark, x + DOOR_W / 2, 3, 1, H - 6);
  for (let i = 0; i < 2; i++) {
    const leaf = x + 1 + i * (DOOR_W / 2);
    for (const bar of [2, 5]) {
      p.rect('#9a9894', leaf + bar, 4, 1, H - 8);
      p.rect('#cfccc6', leaf + bar - 1, Math.round(H * 0.55), 3, 1);
    }
  }
}

/** Letters the tags are written in (slanted when painted). */
const TAG_GLYPHS: readonly (readonly string[])[] = [
  ['#..#', '#.#.', '##..', '#.#.', '#..#'],
  ['.##', '#..', '.#.', '..#', '##.'],
  ['.#.', '#.#', '#.#', '#.#', '.#.'],
  ['##.', '#.#', '##.', '#.#', '#.#'],
  ['###', '#..', '##.', '#..', '###'],
  ['###', '..#', '.#.', '#..', '###'],
];

/** Graffiti tags: slanted marker letters with a dark shadow and a swoosh, kept off the sign. */
function paintTags(p: Painter, w: number, H: number, sign: { dx: number; y: number } | null, salt: number): void {
  const doors = w - 3 - DOOR_W;
  const zones: Array<[number, number, number]> = [];
  if (sign) {
    const signBottom = sign.y - (GROUND_Y - H + 1) + SIGN_H + 4;
    if (sign.dx > 16) zones.push([4, sign.dx - 2, H - 15]);
    if (signBottom + 9 < H - 4) zones.push([sign.dx + 6, Math.min(doors - 2, sign.dx + SIGN_W), signBottom]);
  } else {
    zones.push([6, Math.round(doors / 2), H - 15], [Math.round(doors / 2) + 4, doors - 3, Math.round(H * 0.3)]);
  }
  zones.forEach(([x0, x1, y], i) => {
    const color = TAGS[(salt + i) % TAGS.length]!;
    const letters = Math.min(4, Math.floor((x1 - x0 - 2) / 5));
    if (letters < 2) return;
    for (const [dx, dy, c] of [
      [1, 1, K],
      [0, 0, color],
    ] as const) {
      let x = x0;
      for (let n = 0; n < letters; n++) {
        const glyph = TAG_GLYPHS[Math.floor(noise(n, salt, i) * TAG_GLYPHS.length)]!;
        glyph.forEach((row, r) => {
          for (let cx = 0; cx < row.length; cx++) if (row[cx] === '#') p.px(c, x + cx + dx + Math.floor((4 - r) / 2), y + r + dy);
        });
        x += glyph[0]!.length + 2;
      }
      p.line(c, x0 + dx, y + 7 + dy, x - 2 + dx, y + 6 + dy);
      p.px(c, x - 1 + dx, y + 5 + dy);
    }
  });
}

/** Concrete bank: a smooth curve up to the lip (steel coping) at the kicker, a short deck, the back wall. */
function paintBank(p: Painter, w: number, h: number): void {
  const curve = (col: number) => h - Math.round(h * Math.pow((col + 1) / w, 1.6));
  p.profile(CONCRETE.base, 0, w, h + 1, curve);
  for (let col = 0; col < w; col++) p.px(CONCRETE.top, col, curve(col));
  p.rect(CONCRETE.base, w, 0, BANK_DECK, h + 1);
  p.rect(CONCRETE.top, w, 0, BANK_DECK, 1);
  p.rect(CONCRETE.coping, w - 1, 0, 2, 1);
  p.rect(CONCRETE.shade, w + BANK_DECK - 1, 0, 2, h + 1);
  p.rect(CONCRETE.dark, 0, h, w + BANK_DECK + 1, 1);
}

/**
 * The crane, canvas x 0 = the jib's end: lattice tower centred on the boom's
 * left end, mast above the boom, boom (top edge = ledge) with a still hook,
 * counterweight jib with concrete blocks, tie cables from the mast.
 */
function paintCrane(p: Painter, w: number, jib: number, height: number): void {
  const boomY = CRANE_MAST;
  const ground = boomY + height;
  const towerX = jib - CRANE_TOWER_W / 2;
  const mastTop = 0;
  // Tie cable from the mast top to the jib end (none over the boom: the air above the ledge stays clear).
  p.line(STEEL.cable, jib, mastTop + 1, 2, boomY + 2);
  // Tower: two chords with X bracing, concrete foot.
  lattice(p, towerX, mastTop, CRANE_TOWER_W, ground - mastTop - 3, true);
  p.rect(CONCRETE.base, towerX - 3, ground - 3, CRANE_TOWER_W + 6, 4);
  p.rect(CONCRETE.dark, towerX - 3, ground, CRANE_TOWER_W + 6, 1);
  p.rect(STEEL.dark, jib - 1, mastTop, 2, 2);
  // Counterweight jib and blocks.
  lattice(p, 0, boomY + 1, jib, 4, false);
  p.rect(CONCRETE.base, 1, boomY + 5, 9, 8);
  p.rect(CONCRETE.shade, 1, boomY + 9, 9, 1);
  p.rect(CONCRETE.dark, 9, boomY + 5, 1, 8);
  // Boom: top chord exactly at the ledge height.
  lattice(p, jib, boomY, w, 6, false);
  p.rect(STEEL.light, jib, boomY, w, 1);
  // Trolley and the still hook.
  const hookX = jib + Math.round(w * 0.7);
  p.rect(STEEL.dark, hookX - 2, boomY + 6, 5, 2);
  p.rect(STEEL.cable, hookX, boomY + 8, 1, 12);
  p.rect(STEEL.beam, hookX - 2, boomY + 20, 5, 3);
  p.rect(STEEL.shade, hookX - 2, boomY + 22, 5, 1);
  p.rect(K, hookX, boomY + 23, 1, 3);
  p.px(K, hookX + 1, boomY + 26);
  p.px(K, hookX + 2, boomY + 25);
}

/** A welded lattice: two chords and zigzag diagonals (`vertical`: chords left and right, X bracing). */
function lattice(p: Painter, x: number, y: number, w: number, h: number, vertical: boolean): void {
  if (vertical) {
    p.rect(STEEL.beam, x, y, 2, h);
    p.rect(STEEL.shade, x + w - 2, y, 2, h);
    for (let yy = y + 2; yy + 6 <= y + h; yy += 7) {
      p.line(STEEL.beam, x + 1, yy, x + w - 2, yy + 6);
      p.line(STEEL.shade, x + w - 2, yy, x + 1, yy + 6);
      p.rect(STEEL.dark, x, yy, w, 1);
    }
    return;
  }
  p.rect(STEEL.beam, x, y, w, 2);
  p.rect(STEEL.shade, x, y + h - 2, w, 2);
  for (let xx = x; xx + 3 < x + w; xx += 6) {
    p.line(STEEL.beam, xx, y + h - 2, xx + 3, y + 1);
    p.line(STEEL.shade, xx + 3, y + 1, xx + 6, y + h - 2);
  }
  for (let xx = x + 5; xx < x + w; xx += 17) if (noise(xx, y, 9) < 0.5) p.px(STEEL.rust, xx, y + 1);
}
