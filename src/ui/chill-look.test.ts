import { describe, expect, it } from 'vitest';
import { chillLook } from './chill-look';

const DRUG_WORDS = /joint|kiff|gras|weed|high|rausch|entspannt|haze/i;

describe('chill look', () => {
  it('adult mode keeps the joint icon, the warm haze and its popup', () => {
    const adult = chillLook(false);
    expect(adult.icon).toBe('joint');
    expect(adult.tint).toBe('255, 150, 80');
    expect(adult.popup).toBe('Ganz entspannt...');
  });

  it('kid mode shows a bubble-gum icon, a sweet pink tint and no drug references', () => {
    const kid = chillLook(true);
    expect(kid.icon).toBe('gum');
    const [r, g, b] = kid.tint.split(',').map(Number);
    expect(r).toBeGreaterThan(200);
    expect(b!).toBeGreaterThan(g!); // pink, not orange
    expect(kid.popup).toMatch(/Kaugummi/);
    expect(kid.popup).not.toMatch(DRUG_WORDS);
    expect(kid.bar).not.toBe(chillLook(false).bar);
  });
});
