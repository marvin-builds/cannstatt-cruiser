import { describe, expect, it } from 'vitest';
import { BANNER_TIME, Banner, zoneName } from './banner';

describe('zone banner', () => {
  it('names the zones in German and wraps around', () => {
    expect(zoneName(0)).toBe('Stuttgart-Mitte');
    expect(zoneName(1)).toBe('Am Neckar');
    expect(zoneName(2)).toBe('Bad Cannstatt');
    expect(zoneName(3)).toBe('Stuttgart-Mitte');
  });

  it('slides in, stays, slides out and disappears', () => {
    const b = new Banner();
    expect(b.visible).toBe(false);
    b.show('Am Neckar');
    expect(b.visible).toBe(true);
    expect(b.slide()).toBe(1);
    b.update(BANNER_TIME / 2);
    expect(b.slide()).toBe(0);
    b.update(BANNER_TIME / 2 + 0.01);
    expect(b.visible).toBe(false);
  });
});
