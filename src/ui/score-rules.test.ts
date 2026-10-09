import { describe, expect, it } from 'vitest';
import { createMemoryStore } from '../core/storage';
import { normalizeName } from '../../server/src/name';
import {
  cleanName,
  loadLastEntry,
  loadName,
  nameProblem,
  ownRank,
  qualifies,
  saveLastEntry,
  saveName,
  stripNameInput,
  TOP_SIZE,
} from './score-rules';

const list = (...scores: number[]) => scores.map((score, i) => ({ rank: i + 1, name: `P${i}`, score }));
const full = (lowest: number) => list(...Array.from({ length: TOP_SIZE }, (_, i) => lowest + (TOP_SIZE - 1 - i) * 100));

describe('qualifies (Eintragen is offered)', () => {
  it('only for a score above the 20th place of a full list', () => {
    const top = full(1000);
    expect(top).toHaveLength(20);
    expect(top[19]!.score).toBe(1000);
    expect(qualifies(1001, top)).toBe(true);
    expect(qualifies(999, top)).toBe(false);
  });

  it('not on a tie with the 20th place (the earlier entry keeps it)', () => {
    expect(qualifies(1000, full(1000))).toBe(false);
  });

  it('for any score > 0 while the list has fewer than 20 entries', () => {
    expect(qualifies(1, list(9000, 8000))).toBe(true);
    expect(qualifies(1, [])).toBe(true);
    expect(qualifies(0, [])).toBe(false);
  });

  it('when no list is known (offline): any score > 0, to be queued', () => {
    expect(qualifies(5, null)).toBe(true);
    expect(qualifies(0, null)).toBe(false);
  });
});

describe('name rules', () => {
  it('trims and collapses spaces like the server', () => {
    expect(cleanName('  Flinker    Fuchs 42 ')).toBe('Flinker Fuchs 42');
  });

  it('2-16 characters with letters incl. äöüß, digits, space and - _ .', () => {
    expect(nameProblem('Al')).toBeNull();
    expect(nameProblem('Jörg_Ä.ü-ß 7')).toBeNull();
    expect(nameProblem('A'.repeat(16))).toBeNull();
    expect(nameProblem(' A ')).toBe('short');
    expect(nameProblem('')).toBe('short');
    expect(nameProblem('A'.repeat(17))).toBe('long');
    for (const bad of ['a@b', 'Zoë', '<b>', 'Tab\tx']) expect(nameProblem(bad), bad).toBe('chars');
  });

  it('agrees with the server for valid names', () => {
    for (const name of ['Max', 'Jörg_Ä.ü-ß 7', 'Abc        defghijklm', 'A'.repeat(16)]) {
      expect(nameProblem(name)).toBeNull();
      expect(normalizeName(name)).toBe(cleanName(name));
    }
  });

  it('typing keeps only allowed characters and at most 16 of them', () => {
    expect(stripNameInput('Zoë@Home <3')).toBe('ZoHome 3');
    expect(stripNameInput('x'.repeat(30))).toBe('x'.repeat(16));
    expect(stripNameInput('Äß_-. 9')).toBe('Äß_-. 9');
  });
});

describe('remembered name and last entry', () => {
  it('remembers the last used name, apart for kid mode', () => {
    const store = createMemoryStore();
    expect(loadName(store, false)).toBe('');
    saveName(store, false, 'Max');
    saveName(store, true, 'Flinker Fuchs 42');
    expect(loadName(store, false)).toBe('Max');
    expect(loadName(store, true)).toBe('Flinker Fuchs 42');
  });

  it('ignores a stored name that breaks the rules', () => {
    const store = createMemoryStore();
    store.set('scoreName', '<bad>');
    expect(loadName(store, false)).toBe('');
  });

  it('finds the own entry in a list by the last submitted name and score', () => {
    const store = createMemoryStore();
    expect(ownRank(list(500, 400), loadLastEntry(store))).toBeNull();
    saveLastEntry(store, { name: 'P1', score: 400 });
    expect(ownRank(list(500, 400, 300), loadLastEntry(store))).toBe(2);
    expect(ownRank(list(500, 450, 300), loadLastEntry(store))).toBeNull();
  });
});
