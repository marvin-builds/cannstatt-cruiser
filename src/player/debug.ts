/**
 * Test-only tooling (enabled together with window.__game): lets playtest
 * scenarios simulate the gameplay side of the contract and render a pose
 * lineup. See CONTRACT.md and scripts/scenarios/skater.ts.
 */
import { GROUND_Y } from '../core/config';
import { drawText } from '../core/font';
import type { Entity, GameContext, RenderContext } from '../types';
import { BOARD_FRAMES } from './art';
import { chillStyle } from './chill';
import { drawBoard, drawPose } from './render';
import { poseAt, TIMELINES, type TimelineName } from './poses';

export type LineupLook = 'normal' | 'chill' | 'kid';

export interface PlayerDebugHook {
  /** Adds a static rail under the player (top `height` px above the ground) and starts a grind on it. */
  grind(height?: number, length?: number): number;
  /** Removes a rail added by grind() (the player then falls off). */
  removeRail(id: number): void;
  /** Emits a crash like gameplay would. */
  crash(): void;
  /** Sets `state.chillTimer` (the joint effect; gameplay counts it down while playing). */
  chill(seconds?: number): void;
  /** Sets `state.kidMode` (bubble gum instead of the joint and red eyes). */
  kidMode(on?: boolean): void;
  /**
   * PNG data URL: every animation step and board frame, upscaled by `scale`;
   * `look` adds the adult chill look (joint, red eyes) or the kid one (bubble gum).
   */
  lineup(scale?: number, look?: LineupLook): string;
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
    crash() {
      ctx.bus.emit('crash', { entityId: -1, kind: 'bin', health: ctx.state.health });
    },
    chill(seconds = 60) {
      ctx.state.chillTimer = seconds;
    },
    kidMode(on = true) {
      ctx.state.kidMode = on;
    },
    lineup: (scale = 6, look = 'normal') => renderLineup(scale, look),
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
const CELL_H = 60;

function renderLineup(scale: number, look: LineupLook): string {
  const style = look === 'normal' ? null : chillStyle({ kidMode: look === 'kid', chillTimer: 1 });
  const names = Object.keys(TIMELINES) as TimelineName[];
  const cols = Math.max(...names.map((n) => TIMELINES[n].steps.length));
  const canvas = document.createElement('canvas');
  canvas.width = (cols * CELL_W + 40) * scale;
  canvas.height = ((names.length + 1) * CELL_H) * scale;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.scale(scale, scale);
  g.fillStyle = '#9fc3dd';
  g.fillRect(0, 0, canvas.width, canvas.height);

  names.forEach((name, row) => {
    const top = row * CELL_H;
    drawText(g, name, 2, top + 2, { color: '#241c24' });
    let time = 0;
    TIMELINES[name].steps.forEach((step, col) => {
      const x = 40 + col * CELL_W + CELL_W / 2;
      const groundY = top + CELL_H - 6;
      g.fillStyle = '#8a8378';
      g.fillRect(x - 24, groundY, 48, 2);
      // Spread the loops over the columns, so the lineup shows several bubble sizes and smoke phases.
      const chill = style && { style, timeline: name, time: 0.9 + col * 0.47, animTime: time };
      drawPose(g, poseAt(name, time + 0.0001), x, groundY, chill);
      time += step.t;
    });
  });
  const top = names.length * CELL_H;
  drawText(g, 'board', 2, top + 2, { color: '#241c24' });
  BOARD_FRAMES.forEach((_, i) => drawBoard(g, i, 40 + i * CELL_W + CELL_W / 2, top + 40));
  return canvas.toDataURL('image/png');
}
