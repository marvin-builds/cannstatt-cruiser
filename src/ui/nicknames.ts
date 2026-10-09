/**
 * Generated nicknames for kid mode ("Flinker Fuchs 42"): no free text there.
 * Masculine animals so every adjective ends in -er; adjective + animal are at
 * most 12 letters, so with the two-digit number every name has <= 16
 * characters. Every combination passes the server's name rules and word
 * filter (nicknames.test.ts checks them all).
 */

export const NICKNAME_ADJECTIVES = [
  'Flinker', 'Mutiger', 'Kluger', 'Froher', 'Starker', 'Bunter', 'Wacher', 'Kühner',
  'Fixer', 'Cooler', 'Netter', 'Toller', 'Wilder', 'Sanfter',
] as const;

export const NICKNAME_ANIMALS = [
  'Fuchs', 'Igel', 'Hase', 'Bär', 'Dachs', 'Luchs', 'Wolf', 'Spatz', 'Biber', 'Otter',
  'Uhu', 'Elch', 'Falke', 'Panda', 'Tiger', 'Adler', 'Rabe', 'Mops', 'Koala',
] as const;

/** Numbers with a bad meaning (hate codes, innuendo) never appear. */
const SKIPPED_NUMBERS = new Set([14, 18, 28, 69, 88]);
const NUMBERS = Array.from({ length: 90 }, (_, i) => i + 10).filter((n) => !SKIPPED_NUMBERS.has(n));

function pick<T>(list: readonly T[], random: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;
}

/** A random nickname; `random` returns [0, 1) like Math.random or Rng.next. */
export function nickname(random: () => number): string {
  return `${pick(NICKNAME_ADJECTIVES, random)} ${pick(NICKNAME_ANIMALS, random)} ${pick(NUMBERS, random)}`;
}

/** Every nickname nickname() can return (for tests). */
export function allNicknames(): string[] {
  return NICKNAME_ADJECTIVES.flatMap((a) => NICKNAME_ANIMALS.flatMap((b) => NUMBERS.map((n) => `${a} ${b} ${n}`)));
}
