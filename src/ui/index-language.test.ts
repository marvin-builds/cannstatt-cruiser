import { afterEach, describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { createMemoryStore, type Store } from '../core/storage';
import type { Rect } from '../types';
import { language, LANGUAGE_KEY, setLanguage } from './i18n';
import { createUiSystem } from './index';
import { settingsLayout, uiMetrics } from './layout';
import { titleLayout } from './menu-layout';

afterEach(() => setLanguage('de'));

function setup(options: { store?: Store; browserLanguage?: string | null } = {}) {
  const store = options.store ?? createMemoryStore();
  const ui = createUiSystem({ store, fullscreenAvailable: () => true, browserLanguage: options.browserLanguage });
  const game = new Game({ systems: [ui] });
  return { game, store, ui };
}

const centre = (r: Rect) => [r.x + r.w / 2, r.y + r.h / 2] as const;

function titleSwitch(game: Game) {
  const d = game.display;
  return titleLayout({ viewWidth: d.viewWidth, touch: d.touch, portrait: d.portrait, fullscreenAvailable: true, reload: false, install: false }).language!;
}

describe('the game language (ROADMAP 71)', () => {
  it('starts in English on a first visit from an English browser, in German from any other', () => {
    setup({ browserLanguage: 'en-GB' });
    expect(language()).toBe('en');
    setup({ browserLanguage: 'de-DE' });
    expect(language()).toBe('de');
    setup({ browserLanguage: null });
    expect(language()).toBe('de');
  });

  it('keeps the browser language out of storage until the player chooses', () => {
    const { store } = setup({ browserLanguage: 'en-US' });
    expect(store.get(LANGUAGE_KEY, null)).toBeNull();
  });

  it('switches on the title with the "DE | EN" switch and remembers the choice on the device', () => {
    const { game, store } = setup({ browserLanguage: 'de' });
    const s = titleSwitch(game);
    expect(game.hitHotspot(...centre(s.en))).toBe(true);
    expect(language()).toBe('en');
    expect(game.state.mode).toBe('title');
    expect(store.get(LANGUAGE_KEY, null)).toBe('en');
    setup({ store, browserLanguage: 'de' });
    expect(language()).toBe('en');
    game.hitHotspot(...centre(s.de));
    expect(language()).toBe('de');
    expect(store.get(LANGUAGE_KEY, null)).toBe('de');
  });

  it('offers the switch in kid mode too', () => {
    const store = createMemoryStore();
    store.set('kidMode', true);
    const { game } = setup({ store });
    expect(game.state.kidMode).toBe(true);
    expect(game.hitHotspot(...centre(titleSwitch(game).en))).toBe(true);
    expect(language()).toBe('en');
  });

  it('switches in the settings menu', () => {
    const { game, ui } = setup();
    ui.settings.openMenu(false);
    const s = settingsLayout(game.display.viewWidth, uiMetrics(game.display)).language;
    expect(game.hitHotspot(...centre(s.en))).toBe(true);
    expect(language()).toBe('en');
    expect(ui.settings.open).toBe(true);
  });

  it('has no switch while riding', () => {
    const { game } = setup();
    const s = titleSwitch(game);
    game.commands.startRun();
    game.hitHotspot(...centre(s.en));
    expect(language()).toBe('de');
  });
});
