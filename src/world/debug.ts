/**
 * Test-only tooling (enabled together with window.__game): lets playtest
 * scenarios read the Stuttgart-Mitte traffic, e.g. to check that no vehicle
 * or exhaust puff ever rises above the riding line.
 */
import type { Traffic } from './traffic';
import { VEHICLES } from './traffic';

export interface WorldDebugHook {
  /** Current traffic density 0..1 (1 = full Mitte traffic). */
  trafficDensity(): number;
  /** View rects of the vehicles and puffs on screen. */
  traffic(): { vehicles: Array<{ kind: string; x: number; y: number; w: number; h: number }>; puffs: Array<{ x: number; y: number }> };
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
        .map((v) => ({ kind: v.kind, x: Math.round(v.x), y: v.top, w: VEHICLES[v.kind].w, h: VEHICLES[v.kind].h })),
      puffs: traffic.puffs.filter((p) => p.active).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })),
    }),
  };
}
