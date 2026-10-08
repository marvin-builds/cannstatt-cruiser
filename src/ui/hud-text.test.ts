import { describe, expect, it } from 'vitest';
import { measureText } from '../core/font';
import { AlphaColors, NumberText } from './hud-text';

describe('NumberText', () => {
  it('formats and measures only when the value changes', () => {
    let calls = 0;
    const t = new NumberText((n) => {
      calls++;
      return `x${n}`;
    }, 2);
    const first = t.update(3);
    expect(first).toBe('x3');
    expect(t.width).toBe(measureText('x3', 2));
    expect(t.update(3)).toBe(first);
    expect(calls).toBe(1);
    expect(t.update(4)).toBe('x4');
    expect(calls).toBe(2);
    expect(t.text).toBe('x4');
  });
});

describe('AlphaColors', () => {
  it('gives an rgba string per alpha step and reuses it', () => {
    const c = new AlphaColors('255, 150, 80');
    const a = c.get(0.26);
    expect(a).toBe('rgba(255, 150, 80, 0.26)');
    expect(c.get(0.2604)).toBe(a);
  });

  it('clamps to 0..1', () => {
    const c = new AlphaColors('1, 2, 3');
    expect(c.get(-1)).toBe('rgba(1, 2, 3, 0)');
    expect(c.get(5)).toBe('rgba(1, 2, 3, 1)');
  });
});
