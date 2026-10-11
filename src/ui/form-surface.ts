/**
 * Where a text form takes its text (ROADMAP 58): the native field over the
 * canvas form (landscape) or the full-screen portrait sheet. When the phone
 * turns while the player types, the form moves to the other surface and the
 * keyboard focus goes with it (the text lives in the flow, so it stays).
 */

export interface Focusable {
  focus(): void;
  blur(): void;
  isFocused(): boolean;
}

export type Surface = 'field' | 'sheet';

export class FormSurface {
  /** The surface shown since the last update, or null while the form is hidden. */
  current: Surface | null = null;

  constructor(private readonly targets: Record<Surface, Focusable | null>) {}

  /**
   * Every tick: `show` places the form on `next` (and hides the other surface); a focused
   * surface hands its focus over when the form changes surface.
   */
  update(next: Surface | null, show: (surface: Surface | null) => void): void {
    const prev = this.current;
    const carry = prev !== null && next !== null && prev !== next && !!this.targets[prev]?.isFocused();
    show(next);
    this.current = next;
    if (carry) this.focus();
  }

  focus(): void {
    if (this.current) this.targets[this.current]?.focus();
  }

  blur(): void {
    if (this.current) this.targets[this.current]?.blur();
  }
}
