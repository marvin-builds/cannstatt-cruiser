import { describe, expect, it, vi } from 'vitest';
import { Game } from '../core/game';
import { createMemoryStore } from '../core/storage';
import type { RenderContext } from '../types';
import { titleKeys, titleLayout } from './menu-layout';
import { drawTitle } from './menu-screens';
import { measureText } from '../core/font';
import { loadRecords } from './records';

/** Every string the font draws, so a test can tell which texts a screen shows. */
const drawn = vi.hoisted(() => [] as string[]);
vi.mock('../core/font', async (actual) => {
  const font = await actual<typeof import('../core/font')>();
  return { ...font, drawText: (...args: Parameters<typeof font.drawText>) => void drawn.push(args[1]) };
});

/** A 2D context that accepts every call and draws nothing. */
const nullContext = new Proxy({}, { get: () => () => {} }) as unknown as CanvasRenderingContext2D;
// Sprites and the logo rasterise into their own canvases: give them null ones.
vi.stubGlobal('document', { createElement: () => ({ getContext: () => nullContext }) });

function titleTexts(kidMode: boolean, touch: boolean): string[] {
  const game = new Game({ systems: [] });
  game.state.kidMode = kidMode;
  game.display.touch = touch;
  const r: RenderContext = { g: nullContext, state: game.state, alpha: 0, display: game.display, scroll: 0, scrollLead: 0 };
  const view = { records: loadRecords(createMemoryStore()), lastRun: null, logoHold: { progress: 0 }, feedback: null };
  const { viewWidth, portrait } = game.display;
  drawn.length = 0;
  drawTitle(r, view, titleLayout({ viewWidth, touch, portrait, fullscreenAvailable: false, reload: false, install: false, settingsButton: !kidMode }));
  return [...drawn];
}

describe('title screen', () => {
  for (const touch of [true, false]) {
    it(`kid mode shows no "Kindermodus" on the title (touch ${touch}): the way back is hidden`, () => {
      const texts = titleTexts(true, touch);
      expect(texts.length).toBeGreaterThan(0);
      expect(texts.join('|')).not.toMatch(/Kindermodus/i);
    });

    it(`adult mode has no Kindermodus button any more: the settings gear is the one place for it (touch ${touch}, ROADMAP 64)`, () => {
      expect(titleTexts(false, touch).join('|')).not.toMatch(/Kindermodus/i);
    });
  }

  it('the desktop key line names G for the settings gear in adult mode only', () => {
    expect(titleTexts(false, false)).toContain('P/Esc = Pause, M = Ton aus, G = Einstellungen');
    expect(titleTexts(true, false).join('|')).not.toMatch(/Einstellungen/);
  });

  it('the key line names F and G when both icons show, and fits the narrowest view', () => {
    expect(titleKeys({ feedback: true, settings: true })).toBe('P/Esc = Pause, M = Ton aus, F = Feedback, G = Einstellungen');
    expect(titleKeys({ feedback: false, settings: false })).toBe('P/Esc = Pause, M = Ton aus');
    expect(measureText(titleKeys({ feedback: true, settings: true }))).toBeLessThanOrEqual(320 - 16);
  });
});
