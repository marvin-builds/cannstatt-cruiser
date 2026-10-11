import { describe, expect, it } from 'vitest';
import { visitsSummary } from './visits';

describe('visitsSummary', () => {
  it('names new players and returning visits with the honest note', () => {
    expect(visitsSummary({ new: 1234, returning: 56, unknown: 0 })).toEqual({
      value: '1.234',
      notes: ['56 Besuche Wiederkehrender'],
      fine: 'neu = ohne gespeicherte Spieldaten · Besuche, nicht Personen',
    });
  });
  it('adds unbekannt only when old builds sent sessions', () => {
    expect(visitsSummary({ new: 0, returning: 1, unknown: 7 }).notes).toEqual(['1 Besuch Wiederkehrender', '7 unbekannt (ältere Version)']);
  });
});
