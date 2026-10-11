import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { keyDown, keyUp } from '../core/input';
import { createStore } from '../core/storage';
import type { ChangelogEntry } from '../types';
import { createUiSystem } from './index';
import { whatsNewSections } from './portrait-sheets';
import { scrollThumb } from './score-layout';
import { sheetScrollTo, versionHeading } from './whats-new';
import type { WhatsNewSheet, WhatsNewSheetHandlers } from './whats-new-sheet';
import { fakeRotateSheet } from './rotate-sheet.fake';

const entry = (version: string, ...items: string[]): ChangelogEntry => ({ version, date: version.slice(0, 10), items });
const MANY = Array.from({ length: 10 }, (_, i) => entry(`2099-01-${String(20 - i).padStart(2, '0')}.1`, 'Neu A', 'Neu B', 'Neu C'));

describe('the portrait "Neu in dieser Version" sheet (ROADMAP 59)', () => {
  it('lists each entry under its version heading, newest first, with all its items', () => {
    expect(whatsNewSections([entry('2026-10-09.2', 'A', 'B'), entry('2026-10-08.1', 'C')])).toEqual([
      { heading: versionHeading('2026-10-09.2'), items: ['A', 'B'] },
      { heading: versionHeading('2026-10-08.1'), items: ['C'] },
    ]);
  });

  it('scroll keys move the list by a line, a page or to an end, kept in range; other keys do not scroll', () => {
    const at = (code: string, offset: number) => sheetScrollTo(code, offset, { max: 500, line: 20, page: 300 });
    expect(at('ArrowDown', 0)).toBe(20);
    expect(at('KeyS', 0)).toBe(20);
    expect(at('ArrowUp', 30)).toBe(10);
    expect(at('KeyW', 10)).toBe(0);
    expect(at('PageDown', 100)).toBe(400);
    expect(at('PageDown', 400)).toBe(500);
    expect(at('PageUp', 100)).toBe(0);
    expect(at('End', 0)).toBe(500);
    expect(at('Home', 300)).toBe(0);
    expect(at('Enter', 300)).toBeNull();
    expect(at('Space', 300)).toBeNull();
  });
});

describe('scroll thumb', () => {
  it('shows where the visible part is in the whole list, at least `min` long', () => {
    expect(scrollThumb(100, 100, 400, 0, 6)).toEqual({ y: 0, h: 25 });
    expect(scrollThumb(100, 100, 400, 300, 6)).toEqual({ y: 75, h: 25 });
    expect(scrollThumb(100, 100, 400, 150, 6)).toEqual({ y: 38, h: 25 });
    expect(scrollThumb(100, 100, 100000, 0, 6)?.h).toBe(6);
  });

  it('is null when nothing overflows', () => {
    expect(scrollThumb(100, 100, 100, 0, 6)).toBeNull();
    expect(scrollThumb(100, 100, 50, 0, 6)).toBeNull();
  });
});

function setup(display: { touch: boolean; portrait: boolean }) {
  const raw = new Map<string, string>();
  const store = createStore({ getItem: (k: string) => raw.get(k) ?? null, setItem: (k: string, v: string) => void raw.set(k, v) } as unknown as Storage);
  const sheet = {
    entries: null as readonly ChangelogEntry[] | null,
    keys: [] as string[],
    actions: null as WhatsNewSheetHandlers | null,
    show(entries: readonly ChangelogEntry[] | null) {
      sheet.entries = entries;
    },
    scrollKey(code: string): boolean {
      if (!code.startsWith('Arrow') && code !== 'End') return false;
      sheet.keys.push(code);
      return true;
    },
    scroll: () => null,
  } satisfies WhatsNewSheet & Record<string, unknown>;
  const whatsNewSheet = (handlers: WhatsNewSheetHandlers) => ((sheet.actions = handlers), sheet);
  const rotate = fakeRotateSheet();
  const ui = createUiSystem({ store, fullscreenAvailable: () => true, scores: null, telemetry: null, feedback: null, whatsNewSheet, rotateSheet: rotate.factory });
  const game = new Game({ systems: [ui] });
  Object.assign(game.display, display);
  const key = (code: string) => {
    keyDown(game, code);
    keyUp(game, code);
    game.tick();
  };
  return { game, ui, sheet, rotate, key };
}

describe('the "Neu in dieser Version" sheet in the ui system', () => {
  it('shows in portrait (a desktop window too) with every entry; keys scroll it, other keys and Weiter continue', () => {
    const t = setup({ touch: false, portrait: true });
    t.game.state.whatsNew = MANY;
    t.game.tick();
    expect(t.sheet.entries).toBe(MANY);
    t.key('ArrowDown');
    t.key('End');
    expect(t.sheet.keys).toEqual(['ArrowDown', 'End']);
    expect(t.ui.whatsNew.offset).toBe(0); // the canvas list stays put behind the sheet
    expect(t.game.state.whatsNew).toHaveLength(10);
    t.key('Enter');
    expect(t.game.state.whatsNew).toEqual([]);
    expect(t.game.state.mode).toBe('title');
    expect(t.sheet.entries).toBeNull();

    t.game.state.whatsNew = MANY;
    t.game.tick();
    t.sheet.actions!.onDone();
    expect(t.game.state.whatsNew).toEqual([]);
  });

  it('shows at once on a phone in portrait, without the rotate screen (ROADMAP 73); landscape keeps the canvas list', () => {
    const t = setup({ touch: true, portrait: true });
    t.game.state.whatsNew = MANY;
    t.game.tick();
    expect(t.sheet.entries).toBe(MANY);
    expect(t.rotate.shown).toBe(false);
    // "Weiter" in portrait: the title needs landscape, so the rotate screen comes.
    t.sheet.actions!.onDone();
    t.game.tick();
    expect(t.sheet.entries).toBeNull();
    expect(t.rotate.shown).toBe(true);
    t.game.state.whatsNew = MANY;
    t.game.display.portrait = false;
    t.game.tick();
    expect(t.sheet.entries).toBeNull();
    t.key('ArrowDown');
    expect(t.ui.whatsNew.offset).toBeGreaterThan(0);
    expect(t.sheet.keys).toEqual([]);
  });
});
