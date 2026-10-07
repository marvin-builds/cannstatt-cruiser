/** Drawing of the skater and his board (player render layer). */
import { sprite } from '../core/sprite';
import type { PlayerState } from '../types';
import {
  BOARD_ANCHOR_X,
  BOARD_DECK_ROW,
  BOARD_FRAMES,
  BOARD_H,
  BODY_ANCHOR_X,
  BODY_DECK_ROW,
  BODY_FRAMES,
  PALETTE,
} from './art';
import type { AnimView } from './controller';
import { type Pose, poseAt, timelineFor } from './poses';

const BODY = sprite(PALETTE, BODY_FRAMES);
const BOARD = sprite(PALETTE, BOARD_FRAMES);

/** Draws `pose` with the wheel contact point at (x, y); everything snaps to whole pixels together. */
export function drawPose(g: CanvasRenderingContext2D, pose: Pose, x: number, y: number): void {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const boardTop = y0 - BOARD_H;
  drawBoard(g, pose.board, x0 + (pose.boardDx ?? 0), y0 + (pose.boardDy ?? 0));
  const bodyTop = boardTop + BOARD_DECK_ROW - BODY_DECK_ROW;
  BODY.draw(g, pose.body, x0 - BODY_ANCHOR_X + (pose.bodyDx ?? 0), bodyTop + (pose.bodyDy ?? 0));
}

/** Draws board frame `frame` with the wheel contact point at the whole-pixel (x, y). */
export function drawBoard(g: CanvasRenderingContext2D, frame: number, x: number, y: number): void {
  BOARD.draw(g, frame, Math.round(x) - BOARD_ANCHOR_X, Math.round(y) - BOARD_H);
}

export function drawSkater(g: CanvasRenderingContext2D, p: PlayerState, view: AnimView): void {
  if (!view.visible) return;
  drawPose(g, poseAt(timelineFor(view, p.vy), view.time), p.x, p.y);
}
