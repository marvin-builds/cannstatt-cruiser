/**
 * Test-only tooling (enabled together with window.__game): lets playtest
 * scenarios read the Stuttgart-Mitte traffic, e.g. to check that no vehicle
 * body rises above TRAFFIC_TOP (front lane: FRONT_TOP) and no exhaust cloud
 * above EXHAUST_TOP.
 */
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
}

declare global {
  interface Window {
    __world?: WorldDebugHook;
  }
}

export function installWorldDebug(traffic: Traffic, density: () => number): void {
  window.__world = {
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
