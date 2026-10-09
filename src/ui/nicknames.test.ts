import { describe, expect, it } from 'vitest';
import { normalizeName } from '../../server/src/name';
import { isOffensive } from '../../server/src/word-filter';
import { allNicknames, nickname, NICKNAME_ADJECTIVES, NICKNAME_ANIMALS } from './nicknames';
import { nameProblem } from './score-rules';

describe('kid mode nicknames', () => {
  it('look like "Flinker Fuchs 42": adjective, animal, two-digit number', () => {
    const values = [0, 0, 0.5];
    let i = 0;
    const name = nickname(() => values[i++ % values.length]!);
    expect(name).toMatch(/^\p{Lu}\p{Ll}+ \p{Lu}\p{Ll}+ \d\d$/u);
    expect(name.startsWith(`${NICKNAME_ADJECTIVES[0]} ${NICKNAME_ANIMALS[0]} `)).toBe(true);
  });

  // About 16,000 names: collect the failures and assert once (one expect per
  // name is slow), with a generous timeout for a busy full-suite run.
  it('every possible nickname passes the server name rules and word filter', () => {
    const all = allNicknames();
    expect(all.length).toBeGreaterThan(1000);
    const rejected = all.filter(
      (name) => normalizeName(name) !== name || isOffensive(name) || nameProblem(name) !== null,
    );
    expect(rejected).toEqual([]);
  }, 30_000);

  it('never uses numbers with a bad meaning', () => {
    const numbers = new Set(allNicknames().map((n) => n.slice(-2)));
    for (const bad of ['14', '18', '28', '69', '88']) expect(numbers.has(bad)).toBe(false);
  });

  it('a draw of 0.999 stays inside the lists', () => {
    expect(allNicknames()).toContain(nickname(() => 0.999));
  });
});
