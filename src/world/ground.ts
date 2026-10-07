import { GROUND_Y } from '../core/config';
import { GROUND_DEPTH } from './art/layout';
import { CROSSING, CROSSING_SEAM } from './art/ground';
import type { BaseTile } from './art/paint';
import { tileStarts } from './tiling';
import type { ZoneRoute } from './zones';

/**
 * The riding surface (top edge at GROUND_Y), scrolling 1:1 with the distance.
 * Each zone's paving runs up to its seam, which lies on a tile boundary and
 * is marked by a zebra crossing, so the paving never cuts mid-tile.
 */
export class GroundStrip {
  constructor(private readonly tiles: readonly BaseTile[]) {}

  draw(g: CanvasRenderingContext2D, route: ZoneRoute, distance: number, viewWidth: number): void {
    const s = Math.floor(distance);
    const legs = route.legs(GROUND_DEPTH, s, s + viewWidth);
    for (const leg of legs) {
      const tile = this.tiles[leg.zone]!;
      const canvas = tile.frame(0);
      for (const x of tileStarts(s, tile.period, viewWidth)) {
        if (x + s >= leg.from && x + s < leg.to) g.drawImage(canvas, x, tile.y);
      }
    }
    for (const leg of legs) if (leg.index > 0) g.drawImage(CROSSING(), leg.from - s - CROSSING_SEAM, GROUND_Y);
  }

  warm(): void {
    for (const tile of this.tiles) tile.warm();
    CROSSING();
  }
}
