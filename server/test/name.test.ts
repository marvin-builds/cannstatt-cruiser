import { describe, expect, it } from 'vitest';
import { normalizeName } from '../src/name';

describe('normalizeName', () => {
  it('trims and collapses inner spaces', () => {
    expect(normalizeName('  Flinker    Fuchs 42 ')).toBe('Flinker Fuchs 42');
  });

  it('accepts German umlauts, digits and - _ .', () => {
    expect(normalizeName('Jörg_Ä.ü-ß 7')).toBe('Jörg_Ä.ü-ß 7');
  });

  it('accepts 2 and 16 characters, rejects 1 and 17', () => {
    expect(normalizeName('Al')).toBe('Al');
    expect(normalizeName('A'.repeat(16))).toBe('A'.repeat(16));
    expect(normalizeName(' A ')).toBeNull();
    expect(normalizeName('A'.repeat(17))).toBeNull();
  });

  it('measures the length after collapsing spaces', () => {
    expect(normalizeName('Abc        defghijklm')).toBe('Abc defghijklm');
  });

  it('rejects other characters', () => {
    for (const bad of ['<script>', 'a@b', 'Emoji 😀', 'Tab\there', 'Zoë', 'Ab​cd', 'http://x']) {
      expect(normalizeName(bad), bad).toBeNull();
    }
  });

  it('rejects non-strings', () => {
    expect(normalizeName(42)).toBeNull();
    expect(normalizeName(undefined)).toBeNull();
  });

  it('normalizes composed umlauts (NFC)', () => {
    expect(normalizeName('Jörg')).toBe('Jörg');
  });
});
