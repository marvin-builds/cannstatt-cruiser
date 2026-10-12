import { describe, expect, it } from 'vitest';
import {
  BUILD_VERSION,
  CHANGELOG,
  CHANGELOG_ITEM_MAX_CHARS,
  CHANGELOG_MAX_ITEMS_PER_ENTRY,
  type ChangelogEntry,
  changesSince,
  compareVersions,
  WHATS_NEW_MAX_ENTRIES,
} from './changelog';
import { glyphFor } from './core/font-data';

const entry = (version: string, ...items: string[]): ChangelogEntry => ({ version, date: version.slice(0, 10), items });

const LOG: ChangelogEntry[] = [
  entry('2026-10-09.1', 'c1', 'c2'),
  entry('2026-10-08.2', 'b1', 'b2', 'b3'),
  entry('2026-10-08.1', 'a1'),
];

describe('compareVersions', () => {
  it('orders by date, then by the build number of that day', () => {
    expect(compareVersions('2026-10-08.1', '2026-10-08.2')).toBeLessThan(0);
    expect(compareVersions('2026-10-09.1', '2026-10-08.9')).toBeGreaterThan(0);
    expect(compareVersions('2026-10-08.2', '2026-10-08.2')).toBe(0);
  });

  it('compares build numbers as numbers, not as text', () => {
    expect(compareVersions('2026-10-08.10', '2026-10-08.9')).toBeGreaterThan(0);
  });
});

describe('changesSince', () => {
  it('shows nothing on a first visit (no stored version)', () => {
    expect(changesSince(null, LOG)).toEqual([]);
  });

  it('shows nothing when the stored version is the running build or newer', () => {
    expect(changesSince('2026-10-09.1', LOG)).toEqual([]);
    expect(changesSince('2026-11-01.1', LOG)).toEqual([]);
  });

  it('lists only the entries newer than the stored version, newest first', () => {
    expect(changesSince('2026-10-08.1', LOG).map((e) => e.version)).toEqual(['2026-10-09.1', '2026-10-08.2']);
  });

  it('keeps every item of the entries it shows (no item cap)', () => {
    expect(changesSince('2026-10-07.1', LOG)).toEqual(LOG);
  });

  it('caps the number of entries, keeping the newest ones', () => {
    expect(changesSince('2026-10-07.1', LOG, 2).map((e) => e.version)).toEqual(['2026-10-09.1', '2026-10-08.2']);
    expect(changesSince('2026-10-07.1', LOG, 1)).toEqual([entry('2026-10-09.1', 'c1', 'c2')]);
  });

  it('copies the English lines too, without sharing them (ROADMAP 71)', () => {
    const log: ChangelogEntry[] = [{ ...entry('2026-10-09.1', 'c1'), en: ['e1'] }];
    const shown = changesSince('2026-10-08.1', log);
    expect(shown[0]!.en).toEqual(['e1']);
    shown[0]!.en!.push('x');
    expect(log[0]!.en).toEqual(['e1']);
  });

  it('never changes the log it reads, nor shares its item lists', () => {
    const shown = changesSince('2026-10-07.1', LOG, 1);
    shown[0]!.items.push('x');
    expect(LOG[0]!.items).toEqual(['c1', 'c2']);
  });

  it('caps to the last WHATS_NEW_MAX_ENTRIES (10) entries by default, with all their items', () => {
    expect(WHATS_NEW_MAX_ENTRIES).toBe(10);
    const many = Array.from({ length: 14 }, (_, i) => entry(`2026-11-${String(20 - i).padStart(2, '0')}.1`, `n${i}a`, `n${i}b`));
    const shown = changesSince('2000-01-01.1', many);
    expect(shown).toEqual(many.slice(0, 10));
    expect(shown.flatMap((e) => e.items)).toHaveLength(20);
  });
});

describe('CHANGELOG', () => {
  it('runs newest first with unique, well-formed versions', () => {
    for (const e of CHANGELOG) {
      expect(e.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
      expect(e.version.startsWith(e.date)).toBe(true);
    }
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(compareVersions(CHANGELOG[i - 1]!.version, CHANGELOG[i]!.version)).toBeGreaterThan(0);
    }
  });

  it('names the newest entry as the running build', () => {
    expect(BUILD_VERSION).toBe(CHANGELOG[0]!.version);
  });

  it('keeps items short and few, in glyphs the game font has', () => {
    for (const e of CHANGELOG) {
      expect(e.items.length).toBeGreaterThan(0);
      expect(e.items.length).toBeLessThanOrEqual(CHANGELOG_MAX_ITEMS_PER_ENTRY);
      for (const item of e.items) {
        expect(item.length, item).toBeLessThanOrEqual(CHANGELOG_ITEM_MAX_CHARS);
        for (const ch of item) expect(glyphFor(ch), `${ch} in "${item}"`).not.toBe(glyphFor('\u0001'));
      }
    }
  });

  it('gives English lines (ROADMAP 71) one per German item, under the same limits', () => {
    for (const e of CHANGELOG.filter((x) => x.en)) {
      expect(e.en!.length, e.version).toBe(e.items.length);
      for (const line of e.en!) {
        expect(line.length, line).toBeLessThanOrEqual(CHANGELOG_ITEM_MAX_CHARS);
        for (const ch of line) expect(glyphFor(ch), `${ch} in "${line}"`).not.toBe(glyphFor('\u0001'));
      }
    }
  });

  it('is kid-safe: kid mode shows it too', () => {
    const banned = /joint|kiff|gras|bier|maß|alkohol|betrunken|rausch|bong|drog/i;
    for (const item of CHANGELOG.flatMap((e) => e.items)) expect(item).not.toMatch(banned);
    const bannedEn = /joint|weed|beer|alcohol|drunk|booze|drug/i;
    for (const line of CHANGELOG.flatMap((e) => e.en ?? [])) expect(line).not.toMatch(bannedEn);
  });
});
