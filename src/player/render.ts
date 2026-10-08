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
  PALETTE,
} from './art';
import type { BinCrash, BinTumble } from './bin';
import { BIN_ANCHOR_X, BIN_FRAMES, BIN_PALETTES, BIN_SIZE } from './bin-art';
import { BUBBLE_ART, BUBBLE_PALETTE, bubbleTime, chillBubble } from './bubble';
import { CATCH_ARM, carriedItemDraw, ITEM_ART, ITEM_PALETTE, type ItemDraw } from './carry';
import { chillJoint, chillStyle, type ChillStyle, glowColor, JOINT, JOINT_COLORS, type Point, smokePuffs } from './chill';
import type { AnimView } from './controller';
import { type Pose, poseAt, type TimelineName, timelineFor } from './poses';

const BODY = sprite(PALETTE, BODY_FRAMES);
const CHILL_BODY = sprite(PALETTE, CHILL_BODY_FRAMES);
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

/**
 * Draws `pose` with the wheel contact point at (x, y); everything snaps to
 * whole pixels together. `binLid` is the lid colour of the bin a bin-crash
 * pose sits in.
 */
export function drawPose(
  g: CanvasRenderingContext2D,
  pose: Pose,
  x: number,
  y: number,
  chill: ChillLook | null = null,
  carry: CarryLook | null = null,
  binLid = 0,
): void {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const boardTop = y0 - BOARD_H;
  drawBoard(g, pose.board, x0 + (pose.boardDx ?? 0), y0 + (pose.boardDy ?? 0));
  const left = x0 - BODY_ANCHOR_X + (pose.bodyDx ?? 0);
  const top = boardTop + BOARD_DECK_ROW - BODY_DECK_ROW + (pose.bodyDy ?? 0);
  const item = carry && carriedItemDraw(carry.item, carry.timeline, pose.body, carry.catching);
  // The reaching arm comes from behind the head, so the body covers its root.
  if (item?.arm) ARM.draw(g, 0, left + item.arm.x, top + item.arm.y);
  (chill?.style.redEyes ? CHILL_BODY : BODY).draw(g, pose.body, left, top);
  if (item) drawItem(g, item, left, top);
  // Upright on the deck, over the hips: only the legs stick out of the top.
  if (pose.bin) drawBin(g, binLid, 0, x0 + (pose.boardDx ?? 0), boardTop + BOARD_DECK_ROW + (pose.boardDy ?? 0));
  if (chill?.style.mouth === 'joint') {
    const joint = chillJoint(chill.timeline, pose.body);
    if (joint) drawJoint(g, { x: left + joint.x, y: top + joint.y }, chill.time);
  } else if (chill?.style.mouth === 'bubble') {
    const bubble = chillBubble(chill.timeline, pose.body, chill.time, chill.animTime);
    if (bubble) BUBBLES[bubble.frame]!.draw(g, 0, left + bubble.x, top + bubble.y);
  }
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

export function drawSkater(g: CanvasRenderingContext2D, state: GameState, view: AnimView, bin: BinCrash): void {
  const p = state.player;
  drawTumblingBin(g, bin, p.x);
  if (!view.visible) return;
  const timeline = timelineFor(view, p.vy);
  const style = chillStyle(state);
  // The bubble loop starts at the pickup, so it opens with a readable bubble.
  const time = style?.mouth === 'bubble' ? bubbleTime(state.chillTimer) : state.time;
  const chill = style ? { style, timeline, time, animTime: view.time } : null;
  const carry = state.carriedItem ? { item: state.carriedItem, timeline, catching: view.catching } : null;
  drawPose(g, poseAt(timeline, view.time), p.x, p.y, chill, carry, bin.lid);
}
