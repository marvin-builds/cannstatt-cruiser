/**
 * Test-only tooling (enabled together with window.__game): lets playtest
 * scenarios simulate the gameplay side of the contract and render a pose
 * lineup. See CONTRACT.md and scripts/scenarios/skater.ts.
 */
import { GROUND_Y } from '../core/config';
import { drawText } from '../core/font';
import type { CarriedItem, Entity, EntityKind, GameContext, ItemAction, RenderContext } from '../types';
import { BOARD_FRAMES } from './art';
import { chillStyle } from './chill';
import { drawBoard, drawPose } from './render';
import { poseAt, TIMELINES, type TimelineName } from './poses';
import { ITEM_USE_TIME, itemUseFrame, type UseFrame } from './use';
import { drunkLook } from './wobble';

export type LineupLook = 'normal' | 'chill' | 'kid';

export interface PlayerDebugHook {
  /** Adds a static rail under the player (top `height` px above the ground) and starts a grind on it. */
  grind(height?: number, length?: number): number;
  /** Removes a rail added by grind() (the player then falls off). */
  removeRail(id: number): void;
  /** Emits a crash into `kind` like gameplay would (`bin`: head first into the bin). */
  crash(kind?: EntityKind): void;
  /** Sets `state.chillTimer` (the joint effect; gameplay counts it down while playing). */
  chill(seconds?: number): void;
  /** Sets `state.kidMode` (bubble gum instead of the joint and red eyes). */
  kidMode(on?: boolean): void;
  /** Sets `state.carriedItem` (null drops it) without the catch reach. */
  carry(item: CarriedItem | null): void;
  /** Emits a stomp like gameplay would (the player bounces on the next tick). */
  stomp(item?: CarriedItem): void;
  /** Sets `state.carriedItem` and emits itemCaught like gameplay would (catch reach + jingle). */
  catchItem(item: CarriedItem): void;
  /** Emits itemUsed like gameplay would (clears `state.carriedItem`): the use animation plays. */
  useItem(item: CarriedItem, action: ItemAction): void;
  /** Sets `state.drunkTimer` (gameplay counts it down while playing): the drunk wobble shows. */
  drunk(seconds?: number): void;
  /**
   * PNG data URL: the item use animations (every distinct frame per column) in
   * the ride, air, grind and grind-trick poses, then rows of the drunk wobble.
   */
  useLineup(scale?: number): string;
  /**
   * PNG data URL: every animation step and board frame, upscaled by `scale`;
   * `look` adds the adult chill look (joint, red eyes) or the kid one (bubble
   * gum); `item` puts that item under the arm and adds a row of catch reaches.
   */
  lineup(scale?: number, look?: LineupLook, item?: CarriedItem): string;
}

declare global {
  interface Window {
    __player?: PlayerDebugHook;
  }
}

const DEBUG_RAIL = 'debugRail';
let nextId = 900_000;

export function installPlayerDebug(ctx: GameContext): void {
  window.__player = {
    grind(height = 24, length = 400) {
      const p = ctx.state.player;
      const rail: Entity = {
        id: nextId++,
        kind: 'handrail',
        x: p.x - 16,
        y: GROUND_Y - height,
        w: length,
        h: height,
        done: false,
        data: { [DEBUG_RAIL]: true },
      };
      ctx.state.entities.push(rail);
      ctx.bus.emit('grindStart', { entityId: rail.id });
      return rail.id;
    },
    removeRail(id) {
      const i = ctx.state.entities.findIndex((e) => e.id === id);
      if (i >= 0) ctx.state.entities.splice(i, 1);
    },
    crash(kind = 'barrier') {
      ctx.bus.emit('crash', { entityId: -1, kind, health: ctx.state.health });
    },
    chill(seconds = 60) {
      ctx.state.chillTimer = seconds;
    },
    kidMode(on = true) {
      ctx.state.kidMode = on;
    },
    carry(item) {
      ctx.state.carriedItem = item;
    },
    stomp(item = 'football') {
      ctx.bus.emit('stomp', { entityId: -1, kind: 'vfbFan', item });
    },
    catchItem(item) {
      ctx.state.carriedItem = item;
      ctx.bus.emit('itemCaught', { item });
    },
    useItem(item, action) {
      ctx.state.carriedItem = null;
      ctx.bus.emit('itemUsed', { item, action });
    },
    drunk(seconds = 6) {
      ctx.state.drunkTimer = seconds;
    },
    lineup: (scale = 6, look = 'normal', item) => renderLineup(scale, look, item ?? null),
    useLineup: (scale = 4) => renderUseLineup(scale),
  };
}

/** Draws the rails added by the debug hook (gameplay draws the real ones). */
export function drawDebugRails({ g, state }: RenderContext): void {
  for (const e of state.entities) {
    if (!e.data?.[DEBUG_RAIL]) continue;
    const x = Math.round(e.x);
    const y = Math.round(e.y);
    g.fillStyle = '#3b3f48';
    for (let px = x + 6; px < x + e.w; px += 40) g.fillRect(px, y, 2, GROUND_Y - y);
    g.fillStyle = '#c9ced6';
    g.fillRect(x, y, e.w, 1);
    g.fillStyle = '#6c717b';
    g.fillRect(x, y + 1, e.w, 1);
  }
}

const CELL_W = 70;
const CELL_H = 64;

/** Timelines whose first steps get a catch-reach cell in the lineup's catch row. */
const CATCH_ROW: TimelineName[] = ['ride', 'push', 'airRise', 'airFall', 'grind', 'duck', 'land'];

/** Canvas for a lineup of `cols` x `rows` cells at `scale`, sky-blue background. */
function lineupCanvas(cols: number, rows: number, scale: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = (cols * CELL_W + 40) * scale;
  canvas.height = rows * CELL_H * scale;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.scale(scale, scale);
  g.fillStyle = '#9fc3dd';
  g.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, g };
}

/** Centre x and ground y of lineup cell (col, row), with its ground line drawn. */
function cell(g: CanvasRenderingContext2D, col: number, row: number): { x: number; groundY: number } {
  const x = 40 + col * CELL_W + CELL_W / 2;
  const groundY = row * CELL_H + CELL_H - 6;
  g.fillStyle = '#8a8378';
  g.fillRect(x - 24, groundY, 48, 2);
  return { x, groundY };
}

const USES: [CarriedItem, ItemAction][] = [
  ['beer', 'drink'],
  ['pretzel', 'eat'],
  ['gingerbread', 'eat'],
  ['football', 'throw'],
];
const USE_POSES: TimelineName[] = ['ride', 'airRise', 'grind', 'grindTrick'];
const DRUNK_POSES: TimelineName[] = ['ride', 'push', 'airFall', 'grind', 'grindTrick', 'duck'];
const DRUNK_SAMPLES = 10;

/** Every distinct frame of a use animation (a new one whenever the arm, item or crumbs change). */
function useFrames(action: ItemAction): UseFrame[] {
  const frames: UseFrame[] = [];
  for (let t = 0; t < ITEM_USE_TIME[action]; t += 1 / 60) {
    const f = itemUseFrame(action, t)!;
    const last = frames.at(-1);
    if (!last || last.arm !== f.arm || last.item !== f.item || (f.crumbs >= 0 && f.crumbs - last.crumbs > 0.08)) frames.push(f);
  }
  return frames;
}

function renderUseLineup(scale: number): string {
  const perUse = USES.map(([, action]) => useFrames(action));
  const cols = Math.max(DRUNK_SAMPLES, ...perUse.map((f) => f.length));
  const rows = USES.length * USE_POSES.length + DRUNK_POSES.length;
  const { canvas, g } = lineupCanvas(cols, rows, scale);
  let row = 0;
  USES.forEach(([item, action], u) => {
    for (const name of USE_POSES) {
      drawText(g, `${action} ${name}`, 2, row * CELL_H + 2, { color: '#241c24' });
      perUse[u]!.forEach((frame, col) => {
        const { x, groundY } = cell(g, col, row);
        drawPose(g, poseAt(name, 0.0001), x, groundY, { use: { item, frame, timeline: name } });
      });
      row++;
    }
  });
  for (const name of DRUNK_POSES) {
    drawText(g, `drunk ${name}`, 2, row * CELL_H + 2, { color: '#241c24' });
    for (let col = 0; col < DRUNK_SAMPLES; col++) {
      const { x, groundY } = cell(g, col, row);
      const time = col * 0.23;
      drawPose(g, poseAt(name, time), x, groundY, { drunk: drunkLook(1, time) });
    }
    row++;
  }
  return canvas.toDataURL('image/png');
}

function renderLineup(scale: number, look: LineupLook, item: CarriedItem | null): string {
  const style = look === 'normal' ? null : chillStyle({ kidMode: look === 'kid', chillTimer: 1 });
  const names = Object.keys(TIMELINES) as TimelineName[];
  const cols = Math.max(CATCH_ROW.length, ...names.map((n) => TIMELINES[n].steps.length));
  const rows = names.length + 1 + (item ? 1 : 0);
  const { canvas, g } = lineupCanvas(cols, rows, scale);

  names.forEach((name, row) => {
    const top = row * CELL_H;
    drawText(g, name, 2, top + 2, { color: '#241c24' });
    let time = 0;
    TIMELINES[name].steps.forEach((step, col) => {
      const { x, groundY } = cell(g, col, row);
      // Spread the loops over the columns, so the lineup shows several bubble sizes and smoke phases.
      const chill = style && { style, timeline: name, time: 0.9 + col * 0.47, animTime: time };
      const carry = item && { item, timeline: name, catching: false };
      drawPose(g, poseAt(name, time + 0.0001), x, groundY, { chill, carry });
      time += step.t;
    });
  });
  if (item) {
    const top = names.length * CELL_H;
    drawText(g, 'catch', 2, top + 2, { color: '#241c24' });
    CATCH_ROW.forEach((name, col) => {
      const x = 40 + col * CELL_W + CELL_W / 2;
      const groundY = top + CELL_H - 6;
      const chill = style && { style, timeline: name, time: 0.9 + col * 0.47, animTime: 0 };
      drawPose(g, poseAt(name, 0.0001), x, groundY, { chill, carry: { item, timeline: name, catching: true } });
    });
  }
  const top = (rows - 1) * CELL_H;
  drawText(g, 'board', 2, top + 2, { color: '#241c24' });
  BOARD_FRAMES.forEach((_, i) => drawBoard(g, i, 40 + i * CELL_W + CELL_W / 2, top + 40));
  return canvas.toDataURL('image/png');
}
