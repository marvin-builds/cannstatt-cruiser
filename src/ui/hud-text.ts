/**
 * Allocation-free HUD text and colours: a number's text (and its width) is
 * rebuilt only when the number changes, and translucent colours are built
 * once per alpha step, so drawing the HUD every frame creates no strings.
 */
import { measureText } from '../core/font';

/** The text of a number shown in the HUD, formatted and measured only on change. */
export class NumberText {
  text = '';
  /** Width of `text` in view pixels at the scale given to the constructor. */
  width = 0;
  private value = Number.NaN;

  constructor(
    private readonly format: (n: number) => string,
    private readonly scale = 1,
  ) {}

  update(n: number): string {
    if (n !== this.value) {
      this.value = n;
      this.text = this.format(n);
      this.width = measureText(this.text, this.scale);
    }
    return this.text;
  }
}

/** Alpha resolution of AlphaColors: 1/100 is finer than any visible step of an 8-bit blend. */
const ALPHA_STEPS = 100;

/** `rgba(r, g, b, a)` strings for one colour, cached per alpha step. */
export class AlphaColors {
  private readonly cache: string[] = [];

  /** `rgb`: "r, g, b". */
  constructor(private readonly rgb: string) {}

  get(alpha: number): string {
    const step = Math.round(Math.min(1, Math.max(0, alpha)) * ALPHA_STEPS);
    return (this.cache[step] ??= `rgba(${this.rgb}, ${step / ALPHA_STEPS})`);
  }
}
