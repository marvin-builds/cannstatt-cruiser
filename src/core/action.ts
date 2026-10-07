/** What a single logical button did during one fixed update tick. */
export interface ActionSnapshot {
  /** Went down since the previous tick. */
  readonly pressed: boolean;
  /** Is down at the end of this tick. */
  readonly held: boolean;
  /** Went up since the previous tick. */
  readonly released: boolean;
  /** Seconds the current (or just released) press has lasted, counted in ticks. */
  readonly holdTime: number;
}

export const IDLE_ACTION: ActionSnapshot = { pressed: false, held: false, released: false, holdTime: 0 };

/**
 * A logical button fed by several physical sources (keys, mouse, touches).
 * Edges are latched between ticks, so a press and release that both happen
 * between two updates still produce one `pressed` and one `released`.
 */
export class ActionButton {
  private readonly down = new Set<string>();
  private pressLatched = false;
  private releaseLatched = false;
  private holdTime = 0;

  press(source: string): void {
    if (this.down.has(source)) return;
    if (this.down.size === 0) this.pressLatched = true;
    this.down.add(source);
  }

  release(source: string): void {
    if (!this.down.delete(source)) return;
    if (this.down.size === 0) this.releaseLatched = true;
  }

  releaseAll(): void {
    if (this.down.size > 0) this.releaseLatched = true;
    this.down.clear();
  }

  tick(dt: number): ActionSnapshot {
    const pressed = this.pressLatched;
    const released = this.releaseLatched;
    const held = this.down.size > 0;
    if (pressed) this.holdTime = 0;
    if (held || pressed) this.holdTime += dt;
    this.pressLatched = false;
    this.releaseLatched = false;
    return { pressed, held, released, holdTime: this.holdTime };
  }
}
