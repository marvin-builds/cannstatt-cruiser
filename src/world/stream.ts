import type { Rng } from '../core/rng';

/** How a layer strings its props together. Ids refer to the layer's prop catalogue. */
export interface StreamConfig {
  /** Shown first, in order, after every restart (so a zone is recognisable at once). */
  readonly intro: readonly string[];
  /** Rare eye-catchers, drawn from a shuffled bag and never repeated back to back. */
  readonly landmarks: readonly string[];
  /** Everyday props between landmarks. */
  readonly fillers: readonly string[];
  /** Empty pixels between neighbouring props, inclusive range. */
  readonly gap: readonly [number, number];
  /** Fillers between two landmarks, inclusive range. */
  readonly fillersBetween: readonly [number, number];
}

/** One prop placed in layer space. `seed` lets a prop vary (e.g. cloud height). */
export interface Placement {
  readonly id: string;
  readonly x: number;
  readonly width: number;
  readonly seed: number;
}

/**
 * Endless, seeded sequence of props along one parallax layer. Placements only
 * depend on the rng and the restart position, never on how far ahead the
 * view looks, so every screen width sees the same scenery.
 */
export class PropStream {
  private placed: Placement[] = [];
  private cursor = 0;
  private end = Infinity;
  private queue: string[] = [];
  private bag: string[] = [];
  private fillersLeft = 0;
  private lastLandmark: string | null = null;
  private lastFiller: string | null = null;

  constructor(
    private readonly config: StreamConfig,
    private readonly widthOf: (id: string) => number,
    private readonly rng: Rng,
  ) {}

  /**
   * Forgets all placements; the intro starts at layer x `x`. No prop reaches
   * past `end`: near it, only fillers that still fit are placed, then nothing.
   */
  restart(x: number, end = Infinity): void {
    this.placed = [];
    this.cursor = Math.floor(x);
    this.end = end;
    this.queue = [...this.config.intro];
    this.fillersLeft = this.rollFillers();
    this.lastLandmark = [...this.config.intro].reverse().find((id) => this.config.landmarks.includes(id)) ?? null;
  }

  /**
   * Placements overlapping layer x range [from, to), written into `out`
   * (pass a reused list to draw without allocating); earlier ones are dropped.
   */
  visible(from: number, to: number, out: Placement[] = []): Placement[] {
    while (this.cursor < to) this.place();
    // Placements never overlap, so the passed ones are a prefix.
    let passed = 0;
    while (passed < this.placed.length && this.placed[passed]!.x + this.placed[passed]!.width <= from) passed++;
    if (passed > 0) {
      this.placed.copyWithin(0, passed);
      this.placed.length -= passed;
    }
    // Overwrite, then truncate: emptying the list first would free its storage every frame.
    let n = 0;
    for (let i = 0; i < this.placed.length; i++) if (this.placed[i]!.x < to) out[n++] = this.placed[i]!;
    out.length = n;
    return out;
  }

  private place(): void {
    let id: string | null = this.queue.shift() ?? this.pickNext();
    if (this.cursor + this.widthOf(id) > this.end) id = this.fittingFiller();
    if (id === null) {
      this.cursor = Infinity;
      return;
    }
    const width = this.widthOf(id);
    this.placed.push({ id, x: this.cursor, width, seed: this.rng.int(0, 0xffff) });
    this.cursor += width + this.rng.int(this.config.gap[0], this.config.gap[1]);
  }

  private pickNext(): string {
    const { fillers, landmarks } = this.config;
    if (landmarks.length > 0 && (this.fillersLeft <= 0 || fillers.length === 0)) {
      this.fillersLeft = this.rollFillers();
      return this.pickLandmark();
    }
    this.fillersLeft--;
    const options = fillers.length > 1 ? fillers.filter((id) => id !== this.lastFiller) : fillers;
    this.lastFiller = this.rng.pick(options);
    return this.lastFiller;
  }

  /** A random filler that still fits before the end bound, or null. */
  private fittingFiller(): string | null {
    const fits = this.config.fillers.filter((id) => this.cursor + this.widthOf(id) <= this.end);
    return fits.length > 0 ? this.rng.pick(fits) : null;
  }

  private pickLandmark(): string {
    if (this.bag.length === 0) this.bag = this.shuffledLandmarks();
    let index = this.bag.findIndex((id) => id !== this.lastLandmark);
    if (index < 0 && this.config.landmarks.length > 1) {
      // Only the landmark just shown is left in the bag: start a fresh bag instead.
      this.bag = this.shuffledLandmarks();
      index = this.bag.findIndex((id) => id !== this.lastLandmark);
    }
    this.lastLandmark = this.bag.splice(Math.max(index, 0), 1)[0]!;
    return this.lastLandmark;
  }

  private shuffledLandmarks(): string[] {
    const bag = [...this.config.landmarks];
    for (let i = bag.length - 1; i > 0; i--) {
      const j = this.rng.int(0, i);
      [bag[i], bag[j]] = [bag[j]!, bag[i]!];
    }
    return bag;
  }

  private rollFillers(): number {
    return this.rng.int(this.config.fillersBetween[0], this.config.fillersBetween[1]);
  }
}
