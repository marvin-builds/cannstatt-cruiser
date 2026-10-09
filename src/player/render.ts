/** Drawing of the skater and his board (player render layer). */
import { GROUND_Y } from '../core/config';
import { type Sprite, sprite } from '../core/sprite';
import type { CarriedItem, GameState } from '../types';
import {
  BOARD_ANCHOR_X,
  BOARD_DECK_ROW,
  BOARD_FRAMES,
  BOARD_H,
  BODY_ANCHOR_X,
  BODY_DECK_ROW,
  BODY_FRAMES,
  CHILL_BODY_FRAMES,
  CHILL_ONE_ARM_BODY_FRAMES,
  ONE_ARM_BODY_FRAMES,
  PALETTE,
} from './art';
import type { BinCrash, BinTumble } from './bin';
import { BIN_ANCHOR_X, BIN_FRAMES, BIN_PALETTES, BIN_SIZE } from './bin-art';
import { BUBBLE_ART, BUBBLE_PALETTE, bubbleTime, chillBubble } from './bubble';
import { CATCH_ARM, carriedItemDraw, ITEM_ART, ITEM_PALETTE, type ItemDraw, kidSafeItem } from './carry';
import { chillJoint, chillStyle, type ChillStyle, glowColor, JOINT, JOINT_COLORS, type Point, smokePuffs } from './chill';
import type { AnimView, SkaterController } from './controller';
import { type Pose, type TimelineName, timelineFor } from './poses';
import { type UseFrame, itemUseFrame, type MugToss } from './use';
import {
  armLine,
  flailArm,
  HICCUP_ART,
  hiccupAt,
  LYING_MUG,
  TOSSED_MUG,
  USE_ITEM_ART,
  type UseDraw,
  useDraw,
  type UseSprite,
} from './use-art';
import { type DrunkLook, drunkLook, drunkPoseAt } from './wobble';

const BODY = sprite(PALETTE, BODY_FRAMES);
const CHILL_BODY = sprite(PALETTE, CHILL_BODY_FRAMES);
const ONE_ARM_BODY = sprite(PALETTE, ONE_ARM_BODY_FRAMES);
const CHILL_ONE_ARM_BODY = sprite(PALETTE, CHILL_ONE_ARM_BODY_FRAMES);
const USE_ITEMS = new Map([...USE_ITEM_ART].map(([name, art]) => [name, sprite(ITEM_PALETTE, [art])])) as ReadonlyMap<UseSprite, Sprite>;
/** One sprite per spin frame of the tossed mug: they differ in size. */
const MUGS = TOSSED_MUG.map((art) => sprite(ITEM_PALETTE, [art]));
const MUG_SPIN_STEP = 0.07;
const HICCUP = sprite({ o: '#e4f3fb' }, [HICCUP_ART]);
const CRUMB_COLOR = ITEM_PALETTE.z;
const BOARD = sprite(PALETTE, BOARD_FRAMES);
/** One sprite per bubble frame: they differ in size. */
const BUBBLES = BUBBLE_ART.map((art) => sprite(BUBBLE_PALETTE, [art]));
const ITEMS = Object.fromEntries(
  Object.entries(ITEM_ART).map(([item, art]) => [item, sprite(ITEM_PALETTE, [art])]),
) as Record<CarriedItem, Sprite>;
const ARM = sprite(PALETTE, [CATCH_ARM]);
/** One bin sprite per lid colour; frames are the quarter turns (BIN_FRAMES). */
const BINS = BIN_PALETTES.map((palette) => sprite(palette, BIN_FRAMES));
const tumble: BinTumble = { frame: 0, dx: 0, lift: 0 };
/** Hard landing dust: light grey puffs kicked out at both wheels, spreading and sinking for DUST_TIME seconds. */
const DUST_COLOR = '#f6f1e7';
const DUST_TIME = 0.15;
const DUST_SPREAD = 10;

/** The carried item to add to a pose (state.carriedItem) and whether the catch reach is showing. */
export interface CarryLook {
  item: CarriedItem;
  timeline: TimelineName;
  catching: boolean;
}

/**
 * The chill look to add to a pose: red eyes if the style says so, and the
 * joint (where `chillJoint` allows it) or the bubble gum (`chillBubble`).
 */
export interface ChillLook {
  style: ChillStyle;
  timeline: TimelineName;
  /** Seconds, drives the smoke, the glow and the bubble loop (bubble: seconds since the pickup). */
  time: number;
  /** Seconds into the current animation (the crash pops the bubble at its start). */
  animTime: number;
}

/** An item being used (itemUsed): which one and the frame of its animation. */
export interface UseLook {
  item: CarriedItem;
  frame: UseFrame;
  timeline: TimelineName;
}

/** Everything drawn on top of a bare pose; all optional. */
export interface PoseLooks {
  chill?: ChillLook | null;
  carry?: CarryLook | null;
  use?: UseLook | null;
  drunk?: DrunkLook | null;
  /** Lid colour of the bin a bin-crash pose sits in. */
  binLid?: number;
}

const NO_LOOKS: PoseLooks = {};

/**
 * Draws `pose` with the wheel contact point at (x, y); everything snaps to
 * whole pixels together. `looks` adds the chill look, the carried item, the
 * item use, the drunk wobble and the bin lid colour.
 */
export function drawPose(g: CanvasRenderingContext2D, pose: Pose, x: number, y: number, looks: PoseLooks = NO_LOOKS): void {
  const { chill, carry, use, drunk } = looks;
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const boardTop = y0 - BOARD_H;
  drawBoard(g, pose.board, x0 + (pose.boardDx ?? 0), y0 + (pose.boardDy ?? 0));
  // Drunk: the body sways over the board.
  const left = x0 - BODY_ANCHOR_X + (pose.bodyDx ?? 0) + (drunk?.lean ?? 0);
  const top = boardTop + BOARD_DECK_ROW - BODY_DECK_ROW + (pose.bodyDy ?? 0);
  const item = carry && carriedItemDraw(carry.item, carry.timeline, pose.body, carry.catching);
  const using = use && useDraw(use.item, use.frame, use.timeline, pose.body);
  const flail = drunk?.flail && !using && !item?.arm ? flailArm(pose.body, drunk.flailHigh) : null;
  // Reaching arms come from behind the head, so the body covers their root.
  if (item?.arm) ARM.draw(g, 0, left + item.arm.x, top + item.arm.y);
  if (using?.behind) drawArm(g, left, top, using.shoulder, using.hand);
  bodySprite(chill?.style.redEyes ?? false, !!(using || flail)).draw(g, pose.body, left, top);
  if (item) drawItem(g, item, left, top);
  if (flail) drawArm(g, left, top, flail.shoulder, flail.hand);
  // Upright on the deck, over the hips: only the legs stick out of the top.
  if (pose.bin) drawBin(g, looks.binLid ?? 0, 0, x0 + (pose.boardDx ?? 0), boardTop + BOARD_DECK_ROW + (pose.boardDy ?? 0));
  if (chill?.style.mouth === 'joint') {
    const joint = chillJoint(chill.timeline, pose.body);
    if (joint) drawJoint(g, { x: left + joint.x, y: top + joint.y }, chill.time);
  } else if (chill?.style.mouth === 'bubble') {
    const bubble = chillBubble(chill.timeline, pose.body, chill.time, chill.animTime);
    if (bubble) BUBBLES[bubble.frame]!.draw(g, 0, left + bubble.x, top + bubble.y);
  }
  if (using) drawUse(g, using, left, top);
  const hiccup = drunk?.hiccup != null ? hiccupAt(pose.body, drunk.hiccup) : null;
  if (hiccup) HICCUP.draw(g, 0, left + hiccup.x, top + hiccup.y);
}

function bodySprite(redEyes: boolean, oneArm: boolean): Sprite {
  if (oneArm) return redEyes ? CHILL_ONE_ARM_BODY : ONE_ARM_BODY;
  return redEyes ? CHILL_BODY : BODY;
}

/** An arm from the shoulder to the hand: hoodie sleeve with the outline around it, a skin pixel for the hand. */
function drawArm(g: CanvasRenderingContext2D, left: number, top: number, shoulder: Point, hand: Point): void {
  const line = armLine(shoulder, hand);
  g.fillStyle = PALETTE.k;
  for (const p of line) g.fillRect(left + p.x - 1, top + p.y - 1, 3, 3);
  g.fillStyle = PALETTE.R;
  for (const p of line) g.fillRect(left + p.x, top + p.y, 1, 1);
  g.fillStyle = PALETTE.s;
  g.fillRect(left + hand.x, top + hand.y, 1, 1);
}

/** The using arm in front of the body, the item at the lips over it, and the falling crumbs. */
function drawUse(g: CanvasRenderingContext2D, using: UseDraw, left: number, top: number): void {
  if (!using.behind) drawArm(g, left, top, using.shoulder, using.hand);
  if (using.sprite) USE_ITEMS.get(using.sprite)!.draw(g, 0, left + using.x, top + using.y);
  g.fillStyle = CRUMB_COLOR;
  for (const c of using.crumbs) g.fillRect(left + c.x, top + c.y, 1, 1);
}

/** The empty mug tossed after drinking: spinning in flight, lying on the street once landed. */
function drawTossedMug(g: CanvasRenderingContext2D, toss: MugToss): void {
  if (!toss.active) return;
  const frame = toss.landed ? LYING_MUG : Math.floor(toss.age / MUG_SPIN_STEP) % MUGS.length;
  const mug = MUGS[frame]!;
  mug.draw(g, 0, Math.round(toss.x) - Math.floor(mug.width / 2), Math.round(toss.y) - mug.height);
}

/** The item at its body-frame position; a tucked item gets the hand drawn over it, so the arm grips it. */
function drawItem(g: CanvasRenderingContext2D, item: ItemDraw, left: number, top: number): void {
  ITEMS[item.item].draw(g, 0, left + item.x, top + item.y);
  if (item.grip !== 'side') return;
  g.fillStyle = PALETTE.s;
  g.fillRect(left + item.hand.x, top + item.hand.y, 1, 1);
}

/** Bin frame `frame` with the bin body centred on x and the frame's bottom row just above `bottom`. */
function drawBin(g: CanvasRenderingContext2D, lid: number, frame: number, x: number, bottom: number): void {
  BINS[lid % BINS.length]!.draw(g, frame, x - BIN_ANCHOR_X, bottom - BIN_SIZE);
}

/** The bin tumbling away to the left after the pop (drawn even while the skater blinks). */
function drawTumblingBin(g: CanvasRenderingContext2D, bin: BinCrash, x: number): void {
  if (bin.tumbleTime < 0) return;
  bin.tumble(tumble);
  drawBin(g, bin.lid, tumble.frame, Math.round(x) + tumble.dx, GROUND_Y - tumble.lift);
}

/** Draws board frame `frame` with the wheel contact point at the whole-pixel (x, y). */
export function drawBoard(g: CanvasRenderingContext2D, frame: number, x: number, y: number): void {
  BOARD.draw(g, frame, Math.round(x) - BOARD_ANCHOR_X, Math.round(y) - BOARD_H);
}

/** Joint from the mouth pixel to the right, glowing tip, smoke rising from the tip. */
function drawJoint(g: CanvasRenderingContext2D, mouth: Point, time: number): void {
  g.fillStyle = JOINT_COLORS.paper;
  g.fillRect(mouth.x, mouth.y, JOINT.paper, 1);
  const tip = { x: mouth.x + JOINT.paper, y: mouth.y };
  g.fillStyle = glowColor(time);
  g.fillRect(tip.x, tip.y, 1, 1);
  for (const puff of smokePuffs(time)) {
    g.fillStyle = puff.faded ? JOINT_COLORS.faded : JOINT_COLORS.smoke;
    g.fillRect(tip.x + puff.dx, tip.y + puff.dy - (puff.size - 1), puff.size, puff.size);
  }
}

/** Two puffs per side, moving out from the wheels (x is the contact point, y the street). */
function drawLandingDust(g: CanvasRenderingContext2D, x: number, y: number, time: number): void {
  if (time >= DUST_TIME) return;
  const k = time / DUST_TIME;
  const out = Math.round(k * DUST_SPREAD);
  const size = k < 0.75 ? 2 : 1;
  g.fillStyle = DUST_COLOR;
  for (const side of [-1, 1]) {
    const wheel = Math.round(x) + side * 9;
    g.fillRect(wheel + side * out - (side < 0 ? size : 0), Math.round(y) - size, size, size);
    g.fillRect(wheel + side * Math.round(out / 2) - (side < 0 ? 1 : 0), Math.round(y) - 3 - Math.round(k * 2), 1, 1);
  }
}

export function drawSkater(g: CanvasRenderingContext2D, state: GameState, view: AnimView, skater: Pick<SkaterController, 'bin' | 'toss'>): void {
  const p = state.player;
  drawTumblingBin(g, skater.bin, p.x);
  drawTossedMug(g, skater.toss);
  if (!view.visible) return;
  const timeline = timelineFor(view, p.vy);
  // The kickflip runs on the trick's own clock (it can start mid-air, in any animation state).
  const animTime = timeline === 'kickflip' ? (view.airTrick ?? 0) : view.time;
  const style = chillStyle(state);
  // The bubble loop starts at the pickup, so it opens with a readable bubble.
  const time = style?.mouth === 'bubble' ? bubbleTime(state.chillTimer) : state.time;
  const chill = style ? { style, timeline, time, animTime } : null;
  const carry = state.carriedItem ? { item: kidSafeItem(state.carriedItem, state.kidMode), timeline, catching: view.catching } : null;
  const frame = view.use && itemUseFrame(view.use.action, view.use.time);
  const use = view.use && frame ? { item: kidSafeItem(view.use.item, state.kidMode), frame, timeline } : null;
  const drunk = drunkLook(state.drunkTimer, state.time);
  // On a kicker the wheels ride up the ramp surface (look only, y stays GROUND_Y).
  drawPose(g, drunkPoseAt(timeline, animTime, drunk), p.x, p.y - view.kickerLift, { chill, carry, use, drunk, binLid: skater.bin.lid });
  if (timeline === 'hardLand') drawLandingDust(g, p.x, p.y, view.time);
}
