import { describe, expect, it } from 'vitest';
import { glyphFor } from '../../core/font-data';
import { de } from './de';
import { en } from './en';
import { catalogueStrings, shapeOf } from './test-kit';

describe('the text catalogue', () => {
  it('has every German key in English with the same shape (lists as long, functions taking the same arguments)', () => {
    expect(shapeOf(en)).toEqual(shapeOf(de));
  });

  it('has no empty texts', () => {
    for (const [lang, t] of [['de', de], ['en', en]] as const) {
      for (const { path, text } of catalogueStrings(t)) expect(text.trim(), `${lang} ${path}`).not.toBe('');
    }
  });

  it('uses only characters the game font has (canvas and sheets share the catalogue)', () => {
    const unknown = glyphFor('\u0001');
    for (const [lang, t] of [['de', de], ['en', en]] as const) {
      for (const { path, text } of catalogueStrings(t)) {
        for (const ch of text) expect(ch === '?' || glyphFor(ch) !== unknown, `${lang} ${path}: "${ch}" in "${text}"`).toBe(true);
      }
    }
  });

  it('keeps English free of German words that slipped through untranslated', () => {
    const german = /\b(und|oder|nicht|der|die|das|mit|tippen|Punkte|Sterne|zurück|Einstellungen|Bestenliste|Kindermodus)\b/;
    for (const { path, text } of catalogueStrings(en)) expect(text, path).not.toMatch(german);
  });

  it('is kid-safe outside the adult-only texts (kid mode shows the rest)', () => {
    const adultOnly = ['items.beer', 'popups.drink', 'chill.adult'];
    const banned = { de: /joint|kiff|bier|alkohol|betrunken|rausch|drog/i, en: /joint|weed|beer|alcohol|drunk|booze|drug/i };
    for (const [lang, t] of [['de', de], ['en', en]] as const) {
      for (const { path, text } of catalogueStrings(t)) {
        if (adultOnly.some((p) => path.startsWith(p))) continue;
        expect(text, `${lang} ${path}`).not.toMatch(banned[lang]);
      }
    }
  });

  it('keeps the names of places in both languages', () => {
    expect(en.zones[0]).toBe('Stuttgart-Mitte');
    expect(en.zones[2]).toBe('Bad Cannstatt');
    expect(en.zones[1]).toContain('Neckar');
  });

  it('names the items in English', () => {
    expect(en.items.pretzel).toContain('Pretzel');
    expect(en.items.gingerbread).toContain('Gingerbread heart');
  });
});
