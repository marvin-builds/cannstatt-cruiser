import { describe, expect, it, vi } from 'vitest';
import { Game } from '../core/game';
import { createMemoryStore } from '../core/storage';
import type { RenderContext } from '../types';
import { titleLayout } from './menu-layout';
import { drawTitle } from './menu-screens';
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
  const view = { records: loadRecords(createMemoryStore()), lastRun: null, logoHold: { progress: 0 } };
  const { viewWidth, portrait } = game.display;
  drawn.length = 0;
  drawTitle(r, view, titleLayout({ viewWidth, touch, portrait, fullscreenAvailable: false, reload: false, install: null }));
  return [...drawn];
}

describe('title screen', () => {
  for (const kidMode of [true, false]) {
    for (const touch of [true, false]) {
      it(`shows no kid mode chip (kidMode ${kidMode}, touch ${touch}): kid mode is invisible on the title`, () => {
        const texts = titleTexts(kidMode, touch);
        expect(texts.length).toBeGreaterThan(0);
        expect(texts.join('|')).not.toMatch(/Kindermodus/i);
      });
    }
  }
});
