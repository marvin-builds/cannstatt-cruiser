/**
 * Test-only tooling (enabled together with window.__game): lets playtest
 * scenarios read the Stuttgart-Mitte traffic, e.g. to check that no vehicle
 * body rises above TRAFFIC_TOP (front lane: FRONT_TOP) and no exhaust cloud
 * above EXHAUST_TOP, and set up the NorDIY park for screenshots.
 */
import { PLAYER_X } from '../core/config';
import type { GameContext, ParkPlan } from '../types';
import type { CrowdCheer } from './crowd';
import type { Traffic } from './traffic';
import { LANES, VEHICLES } from './traffic';

export interface WorldDebugHook {
  /** Current traffic density 0..1 (1 = full Mitte traffic). */
  trafficDensity(): number;
  /**
   * View rects of the vehicles (`front`: drawn over gameplay) and the tops of
   * the exhaust clouds (drawn under gameplay, may rise above the riding
   * line); `shake` = the street rumble offset (0 or 1 px).
   */
  traffic(): {
    vehicles: Array<{ kind: string; x: number; y: number; w: number; h: number; front: boolean }>;
    puffs: Array<{ x: number; y: number }>;
    shake: number;
  };
  /**
   * Sets state.park to a hand-made NorDIY plan (bank, two containers, crane)
   * starting at screen x `x` and clears the traffic; returns the plan.
   * Gameplay draws no ledges for it: it shows the scenery only.
   */
  planPark(x?: number): ParkPlan;
  /** Lets the park crowd cheer at `level` 0..1 (like gameplay's sessionCheer). */
  cheer(level: number): void;
}

declare global {
  interface Window {
    __world?: WorldDebugHook;
  }
}

/** The sample park of planPark, relative to its start. */
const SAMPLE_PARK: ParkPlan = {
  start: 0,
  end: 470,
  pieces: [
    { kind: 'bank', from: 20, to: 38, height: 7 },
    { kind: 'container', from: 90, to: 170, height: 40 },
    { kind: 'container', from: 222, to: 302, height: 52 },
    { kind: 'crane', from: 352, to: 462, height: 66 },
  ],
};

export function installWorldDebug(ctx: GameContext, traffic: Traffic, density: () => number, crowd: CrowdCheer): void {
  window.__world = {
    planPark: (x = PLAYER_X + 40) => {
      const at = ctx.state.distance + x - PLAYER_X;
      const plan: ParkPlan = {
        start: at + SAMPLE_PARK.start,
        end: at + SAMPLE_PARK.end,
        pieces: SAMPLE_PARK.pieces.map((p) => ({ ...p, from: at + p.from, to: at + p.to })),
      };
      ctx.state.park = plan;
      traffic.reset();
      return plan;
    },
    cheer: (level) => crowd.cheer(level),
    trafficDensity: density,
    traffic: () => ({
      vehicles: traffic.vehicles
        .filter((v) => v.active)
        .map((v) => ({ kind: v.kind, x: Math.round(v.x), y: v.top, w: VEHICLES[v.kind].w, h: VEHICLES[v.kind].h, front: LANES[v.lane]!.front })),
      puffs: traffic.puffs.filter((p) => p.active).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
      shake: traffic.shake,
    }),
  };
}
