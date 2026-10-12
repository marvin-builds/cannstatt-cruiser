import { afterEach, describe, expect, it } from 'vitest';
import { chillLook, chillPopup } from './chill-look';
import { setLanguage } from './i18n';

afterEach(() => setLanguage('de'));

const DRUG_WORDS = /joint|kiff|gras|weed|high|rausch|entspannt|haze/i;

describe('chill look', () => {
  it('adult mode keeps the joint icon, the warm haze and its popup', () => {
    const adult = chillLook(false);
    expect(adult.icon).toBe('joint');
    expect(adult.tint).toBe('255, 150, 80');
    expect(chillPopup(false)).toBe('Ganz entspannt...');
  });

  it('kid mode shows a bubble-gum icon, a sweet pink tint and no drug references', () => {
    const kid = chillLook(true);
    expect(kid.icon).toBe('gum');
    const [r, g, b] = kid.tint.split(',').map(Number);
    expect(r).toBeGreaterThan(200);
    expect(b!).toBeGreaterThan(g!); // pink, not orange
    expect(chillPopup(true)).toMatch(/Kaugummi/);
    expect(chillPopup(true)).not.toMatch(DRUG_WORDS);
    expect(kid.bar).not.toBe(chillLook(false).bar);
  });

  it('says bubble gum in English kid mode, again without drug references', () => {
    setLanguage('en');
    expect(chillPopup(true)).toBe('Bubble gum!');
    expect(chillPopup(true)).not.toMatch(DRUG_WORDS);
  });
});
