/** Seconds the zone name stays on screen, including the slide in and out. */
export const BANNER_TIME = 2.4;
const SLIDE_TIME = 0.25;

const ZONE_NAMES = ['Stuttgart-Mitte', 'Am Neckar', 'Bad Cannstatt'] as const;

export function zoneName(index: number): string {
  const n = ZONE_NAMES.length;
  return ZONE_NAMES[((index % n) + n) % n]!;
}

/** The brief zone-name ribbon shown on zoneChanged. */
export class Banner {
  text = '';
  private time = BANNER_TIME;

  get visible(): boolean {
    return this.time < BANNER_TIME;
  }

  show(text: string): void {
    this.text = text;
    this.time = 0;
  }

  hide(): void {
    this.time = BANNER_TIME;
  }

  update(dt: number): void {
    if (this.visible) this.time += dt;
  }

  /** 1 = fully off screen, 0 = in place; eases at both ends. */
  slide(): number {
    const t = Math.min(this.time, BANNER_TIME - this.time);
    return t >= SLIDE_TIME ? 0 : 1 - t / SLIDE_TIME;
  }
}
