/**
 * The NorDIY crowd (ROADMAP 36), DOM-free: what the people chilling on the
 * pallet sofa drink (beer for adults, colourful lemonade in kid mode) and how
 * much they cheer. Gameplay's `sessionCheer` raises the cheering to its level;
 * it holds a moment and calms down, and holds longer after `sessionEnd`.
 * The art (art/park-decor.ts) raises a person's bottle and arm while
 * `armsUp(person)` is true.
 */

export interface BottleLook {
  kind: 'beer' | 'lemonade';
  glass: string;
  drink: string;
  label: string;
}

const BEER: readonly BottleLook[] = [
  { kind: 'beer', glass: '#6b4a1f', drink: '#8a5e22', label: '#e8dcb8' },
  { kind: 'beer', glass: '#3f6b33', drink: '#4f8240', label: '#d8c58a' },
];

/** Kid mode: bright see-through lemonades (orange, raspberry, lime), no brown or green glass. */
const LEMONADE: readonly BottleLook[] = [
  { kind: 'lemonade', glass: '#cfe9f2', drink: '#ff9a1f', label: '#ff4f7b' },
  { kind: 'lemonade', glass: '#d9f0f7', drink: '#ff5aa8', label: '#ffe14a' },
  { kind: 'lemonade', glass: '#e2f4ec', drink: '#9be03a', label: '#3fb7ff' },
];

/** The bottles the crowd holds, one per person in turn. */
export function crowdBottles(kidMode: boolean): readonly BottleLook[] {
  return kidMode ? LEMONADE : BEER;
}

/** Seconds a cheer holds before it calms down. */
const CHEER_HOLD = 1.2;
/** Seconds the cheering holds after the session ended ("Session!"). */
const END_HOLD = 3.5;
/** Calming down per second once the hold is over. */
const CALM_RATE = 0.8;
/** The end cheer is at least this loud, however quiet the session was. */
const END_MIN = 0.5;

export class CrowdCheer {
  /** Cheering 0..1 now. */
  intensity = 0;
  private hold = 0;
  private time = 0;

  /** A trick in the park: cheering rises to `level` (0..1). */
  cheer(level: number): void {
    this.intensity = Math.max(this.intensity, clamp01(level));
    this.hold = Math.max(this.hold, CHEER_HOLD);
  }

  /** The skater left the park: one last, longer cheer. */
  sessionEnd(level: number): void {
    this.intensity = Math.max(this.intensity, clamp01(level), END_MIN);
    this.hold = Math.max(this.hold, END_HOLD);
  }

  update(dt: number): void {
    this.time += dt;
    if (this.hold > 0) this.hold = Math.max(0, this.hold - dt);
    else this.intensity = Math.max(0, this.intensity - CALM_RATE * dt);
  }

  reset(): void {
    this.intensity = 0;
    this.hold = 0;
  }

  /**
   * Whether person `who` has bottle and arm up now: each pumps at its own
   * phase, faster and for longer the louder the cheering (always up at 1).
   */
  armsUp(who: number): boolean {
    if (this.intensity <= 0) return false;
    const rate = 5 + 7 * this.intensity;
    return Math.sin(this.time * rate + who * 2.1) > 1 - 2 * this.intensity;
  }
}

function clamp01(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}
