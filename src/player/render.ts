/** Drawing of the skater and his board (player render layer). */
import { sprite } from '../core/sprite';
import type { GameState } from '../types';
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
import { chillJoint, glowColor, JOINT, JOINT_COLORS, type Point, smokePuffs } from './chill';
import type { AnimView } from './controller';
import { type Pose, poseAt, type TimelineName, timelineFor } from './poses';

const BODY = sprite(PALETTE, BODY_FRAMES);
const CHILL_BODY = sprite(PALETTE, CHILL_BODY_FRAMES);
const BOARD = sprite(PALETTE, BOARD_FRAMES);

/** The chill look to add to a pose: red eyes always, the joint where `chillJoint` allows it. */
export interface ChillLook {
  timeline: TimelineName;
  /** Seconds, drives the smoke and the glow. */
  time: number;
}

/** Draws `pose` with the wheel contact point at (x, y); everything snaps to whole pixels together. */
export function drawPose(g: CanvasRenderingContext2D, pose: Pose, x: number, y: number, chill: ChillLook | null = null): void {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const boardTop = y0 - BOARD_H;
  drawBoard(g, pose.board, x0 + (pose.boardDx ?? 0), y0 + (pose.boardDy ?? 0));
  const left = x0 - BODY_ANCHOR_X + (pose.bodyDx ?? 0);
  const top = boardTop + BOARD_DECK_ROW - BODY_DECK_ROW + (pose.bodyDy ?? 0);
  (chill ? CHILL_BODY : BODY).draw(g, pose.body, left, top);
  const joint = chill && chillJoint(chill.timeline, pose.body);
  if (joint) drawJoint(g, { x: left + joint.x, y: top + joint.y }, chill.time);
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

export function drawSkater(g: CanvasRenderingContext2D, state: GameState, view: AnimView): void {
  if (!view.visible) return;
  const p = state.player;
  const timeline = timelineFor(view, p.vy);
  const chill = state.chillTimer > 0 ? { timeline, time: state.time } : null;
  drawPose(g, poseAt(timeline, view.time), p.x, p.y, chill);
}
