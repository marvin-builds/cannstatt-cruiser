/**
 * The short sparkle burst around the skater on a landed kickflip (airTrick,
 * ROADMAP 37c): SPARKLE_RAYS little stars fly out from his middle and fade
 * within SPARKLE_TIME. screens.ts draws the dots; this module only times
 * them and says where each one is (allocation-free, integer offsets).
 */

/** Seconds the burst lasts. */
export const SPARKLE_TIME = 0.45;
/** Dots in the burst, evenly spread around the skater. */
export const SPARKLE_RAYS = 8;
/** Distance of a dot from the skater's middle at the start and at the end of the burst (view px). */
const START_R = 8;
const END_R = 26;

export class Sparkle {
  private time = SPARKLE_TIME;

  get visible(): boolean {
    return this.time < SPARKLE_TIME;
  }

  /** 0 at the start .. 1 at the end of the burst. */
  get age(): number {
    return Math.min(1, this.time / SPARKLE_TIME);
  }

  start(): void {
    this.time = 0;
  }

  update(dt: number): void {
    if (this.visible) this.time += dt;
  }
}

/** Offset (view px, integers) of dot `i` from the skater's middle at burst age 0..1, written into `out`. */
export function sparkleDot(i: number, age: number, out: { x: number; y: number }): void {
  // Half a step off the axes, so no dot sits straight above or beside the skater.
  const angle = ((i + 0.5) / SPARKLE_RAYS) * Math.PI * 2;
  // Fast out, then slowing down.
  const r = START_R + (END_R - START_R) * (1 - (1 - age) * (1 - age));
  out.x = Math.round(Math.cos(angle) * r);
  out.y = Math.round(Math.sin(angle) * r);
}
