import { describe, expect, it } from 'vitest';
import { hadGameData, type StorageKeys } from './returning';

/** A fake localStorage holding these full keys (only `length` and `key` are read). */
function storage(keys: string[]): StorageKeys {
  return { length: keys.length, key: (i) => keys[i] ?? null };
}

describe('hadGameData (new vs. returning player, ROADMAP 55)', () => {
  it('an empty storage is a new player', () => {
    expect(hadGameData(storage([]))).toBe(false);
  });

  it('any of the game keys means a returning player', () => {
    expect(hadGameData(storage(['cannstatt-cruiser:visits']))).toBe(true);
    expect(hadGameData(storage(['cannstatt-cruiser:lastSeenVersion', 'cannstatt-cruiser:highscore']))).toBe(true);
  });

  it('the test device marker alone (set by the insights board) is still a new player', () => {
    expect(hadGameData(storage(['cannstatt-cruiser:testDevice']))).toBe(false);
  });

  it('keys of other pages on the same origin do not count', () => {
    expect(hadGameData(storage(['other-game:save', 'theme', 'cannstatt']))).toBe(false);
  });

  it('is unknown (undefined) without storage or when it throws, and never throws', () => {
    expect(hadGameData(null)).toBeUndefined();
    const throwing: StorageKeys = {
      get length(): number {
        throw new Error('SecurityError');
      },
      key: () => null,
    };
    expect(hadGameData(throwing)).toBeUndefined();
    expect(hadGameData({ length: 1, key: () => { throw new Error('boom'); } })).toBeUndefined();
  });
});
