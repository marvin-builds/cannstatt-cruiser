/** Seconds a zone crossfade takes. */
export const CROSSFADE_TIME = 2;

/** Which zone fades into which, and how far (0..1). Pure state, no drawing. */
export class Crossfade {
  from: number;
  to: number;
  progress = 1;

  constructor(zone: number) {
    this.from = zone;
    this.to = zone;
  }

  get active(): boolean {
    return this.progress < 1;
  }

  /** Starts fading towards `zone`; an unfinished fade continues from its target. */
  start(zone: number): void {
    if (zone === this.to && !this.active) return;
    this.from = this.to;
    this.to = zone;
    this.progress = 0;
  }

  /** Shows `zone` immediately. */
  snap(zone: number): void {
    this.from = zone;
    this.to = zone;
    this.progress = 1;
  }

  update(dt: number): void {
    if (this.active) this.progress = Math.min(1, this.progress + dt / CROSSFADE_TIME);
  }
}
