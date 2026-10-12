import { afterEach, describe, expect, it } from 'vitest';
import { VIEW_H } from '../core/config';
import { measureText } from '../core/font';
import type { ChangelogEntry, Rect } from '../types';
import { hudButtons, uiMetrics } from './layout';
import type { MenuInput } from './menu-layout';
import { setLanguage } from './i18n';
import { clampScroll, entryLines, versionHeading, whatsNewLayout, whatsNewRows } from './whats-new';

afterEach(() => setLanguage('de'));

const entry = (version: string, ...items: string[]): ChangelogEntry => ({ version, date: version.slice(0, 10), items });
const LONG = 'Gefangene Sachen benutzen (E / Knopf) xx';
/** Ten entries with three items each: far more than one screen holds. */
const MANY = Array.from({ length: 10 }, (_, i) => entry(`2026-10-${String(20 - i).padStart(2, '0')}.1`, LONG, `Neu ${i} b`, `Neu ${i} c`));

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r: Rect, w: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= VIEW_H;

const VARIANTS = [
  { name: 'desktop', touch: false, portrait: false, widths: [320, 400, 427] },
  { name: 'phone landscape', touch: true, portrait: false, widths: [320, 400, 422] },
  { name: 'phone portrait', touch: true, portrait: true, widths: [320, 360, 390, 427] },
];

function* inputs(): Generator<MenuInput & { label: string }> {
  for (const v of VARIANTS) {
    for (const viewWidth of v.widths) {
      for (const fullscreenAvailable of [true, false]) {
        yield { label: `${v.name} ${viewWidth} fs=${fullscreenAvailable}`, viewWidth, touch: v.touch, portrait: v.portrait, fullscreenAvailable, reload: false, install: false };
      }
    }
  }
}

describe("what's new rows", () => {
  it('puts a version heading above the items of each entry, newest first', () => {
    const rows = whatsNewRows([entry('2026-10-09.2', 'A', 'B'), entry('2026-10-08.1', 'C')], 300, 1);
    expect(rows.map((r) => [r.kind, r.text])).toEqual([
      ['heading', versionHeading('2026-10-09.2')],
      ['item', 'A'],
      ['item', 'B'],
      ['heading', versionHeading('2026-10-08.1')],
      ['item', 'C'],
    ]);
  });

  it('names the version with its German date and build number', () => {
    expect(versionHeading('2026-10-09.2')).toBe('Version vom 9.10.2026 (Nr. 2)');
  });

  it('names the version in English while English is on (ROADMAP 71)', () => {
    setLanguage('en');
    expect(versionHeading('2026-10-09.2')).toBe('Version of Oct 9, 2026 (no. 2)');
  });

  it("shows an entry's English lines in English, its German items otherwise and for entries without English", () => {
    const both: ChangelogEntry = { ...entry('2026-10-09.2', 'Neu A', 'Neu B'), en: ['New A', 'New B'] };
    const old = entry('2026-10-08.1', 'Alt C');
    expect(entryLines(both)).toEqual(['Neu A', 'Neu B']);
    setLanguage('en');
    expect(entryLines(both)).toEqual(['New A', 'New B']);
    expect(entryLines(old)).toEqual(['Alt C']);
    expect(whatsNewRows([both, old], 300, 1).filter((r) => r.kind === 'item').map((r) => r.text)).toEqual(['New A', 'New B', 'Alt C']);
  });

  it('wraps an item too wide for the list at the text scale; the rest of it is indented without a bullet', () => {
    const rows = whatsNewRows([entry('2026-10-09.1', LONG)], 2 * 120, 2);
    const items = rows.filter((r) => r.kind !== 'heading');
    expect(items.length).toBeGreaterThan(1);
    expect(items[0]!.kind).toBe('item');
    expect(items.slice(1).every((r) => r.kind === 'more')).toBe(true);
    expect(items.map((r) => r.text).join(' ')).toBe(LONG);
    for (const r of items) expect(measureText(r.text, 2)).toBeLessThanOrEqual(2 * 120);
  });
});

describe("what's new layout", () => {
  it('headline, the list and Weiter fit the view, clear of the HUD buttons and each other, all variants', () => {
    for (const input of inputs()) {
      const l = whatsNewLayout(input, MANY);
      const hud = hudButtons(input.viewWidth, input.fullscreenAvailable, uiMetrics(input), false);
      const huds = [hud.mute, hud.fullscreen].filter((r): r is Rect => !!r);
      const blocks = [...l.blocks.values()];
      for (const r of blocks) {
        expect(inside(r, input.viewWidth), `${input.label}: ${JSON.stringify(r)}`).toBe(true);
        for (const h of huds) expect(overlap(r, h), `${input.label}: clear of the HUD`).toBe(false);
      }
      blocks.forEach((a, i) => blocks.slice(i + 1).forEach((b) => expect(overlap(a, b), input.label).toBe(false)));
      const next = l.buttons.next!;
      expect(next.h, input.label).toBeGreaterThanOrEqual(uiMetrics(input).menuButtonH);
      const list = l.list!;
      expect(list.rect.h, `${input.label}: room for a few rows`).toBeGreaterThanOrEqual(4 * list.rowH);
      expect(list.maxScroll, `${input.label}: ten entries scroll`).toBeGreaterThan(0);
      expect(list.contentH).toBe(list.rows.length * list.rowH);
    }
  });

  it('portrait reads big: scale 2 text in rows of at least 16 px', () => {
    const l = whatsNewLayout({ viewWidth: 390, touch: true, portrait: true, fullscreenAvailable: true, reload: false, install: false }, MANY).list!;
    expect(l.scale).toBe(2);
    expect(l.rowH).toBeGreaterThanOrEqual(16);
  });

  it('a short list does not scroll', () => {
    const l = whatsNewLayout({ viewWidth: 320, touch: false, portrait: false, fullscreenAvailable: true, reload: false, install: false }, [entry('2026-10-09.1', 'A')]).list!;
    expect(l.maxScroll).toBe(0);
  });
});

describe('list scrolling', () => {
  it('clamps into 0..max', () => {
    expect(clampScroll(-5, 40)).toBe(0);
    expect(clampScroll(50, 40)).toBe(40);
    expect(clampScroll(12, 40)).toBe(12);
    expect(clampScroll(12, 0)).toBe(0);
  });
});
