import { GROUND_Y, VIEW_H, VIEW_MAX_W } from '../core/config';
import type { BaseTile } from './art/paint';
import { tileStarts } from './tiling';

/**
 * The riding surface (top edge at GROUND_Y). It scrolls 1:1 with the
 * distance. A zone change swaps the paving at a seam that enters from the
 * right edge and rolls past the skater, so the ground never cuts.
 */
export class GroundStrip {
  private zone = 0;
  private previous = 0;
  /** World distance at which the new paving starts (seam position). */
  private seam = -Infinity;

  constructor(private readonly tiles: readonly BaseTile[]) {}

  snap(zone: number): void {
    this.zone = zone;
    this.previous = zone;
    this.seam = -Infinity;
  }

  change(zone: number, distance: number): void {
    if (zone === this.zone) return;
    this.previous = this.zone;
    this.zone = zone;
    this.seam = distance + VIEW_MAX_W + 8;
  }

  draw(g: CanvasRenderingContext2D, distance: number, viewWidth: number): void {
    const seamX = Math.floor(this.seam) - Math.floor(distance);
    if (seamX <= 0) {
      this.paint(g, this.zone, distance, viewWidth);
      return;
    }
    this.paint(g, this.previous, distance, Math.min(seamX, viewWidth));
    if (seamX >= viewWidth) return;
    g.save();
    g.beginPath();
    g.rect(seamX, GROUND_Y, viewWidth - seamX, VIEW_H - GROUND_Y);
    g.clip();
    this.paint(g, this.zone, distance, viewWidth);
    g.restore();
  }

  warm(): void {
    for (const tile of this.tiles) tile.warm();
  }

  private paint(g: CanvasRenderingContext2D, zone: number, distance: number, width: number): void {
    const tile = this.tiles[zone]!;
    const canvas = tile.frame(0);
    for (const x of tileStarts(distance, tile.period, width)) g.drawImage(canvas, x, tile.y);
  }
}
