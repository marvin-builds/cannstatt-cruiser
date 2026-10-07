import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { createStore, type Store } from '../core/storage';
import { createUiSystem } from './index';
import { hudButtons } from './layout';

function memoryStore(): Store & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  const store = createStore({
    getItem: (k: string) => raw.get(k) ?? null,
    setItem: (k: string, v: string) => void raw.set(k, v),
  } as unknown as Storage);
  return Object.assign(store, { raw });
}

function setup(fullscreenAvailable = true) {
  const store = memoryStore();
  let fullscreenToggles = 0;
  const ui = createUiSystem({ store, fullscreenAvailable: () => fullscreenAvailable });
  const game = new Game({ systems: [ui], platform: { toggleFullscreen: () => fullscreenToggles++ } });
  return { game, store, ui, toggles: () => fullscreenToggles };
}

const centre = (r: { x: number; y: number; w: number; h: number }) => [r.x + r.w / 2, r.y + r.h / 2] as const;

describe('ui system', () => {
  it('persists the highscore and star total on game over', () => {
    const { game, store } = setup();
    game.commands.startRun();
    game.state.score = 1200;
    game.state.stars = 4;
    game.commands.gameOver();
    expect(store.get('highscore', 0)).toBe(1200);
    expect(store.get('starsTotal', 0)).toBe(4);

    game.commands.startRun();
    game.state.score = 300;
    game.state.stars = 2;
    game.commands.gameOver();
    expect(store.get('highscore', 0)).toBe(1200);
    expect(store.get('starsTotal', 0)).toBe(6);
  });

  it('the pause hotspot pauses a run and swallows the press', () => {
    const { game } = setup();
    game.commands.startRun();
    const [x, y] = centre(hudButtons(game.display.viewWidth, true).pause);
    expect(game.hitHotspot(x, y)).toBe(true);
    expect(game.state.mode).toBe('paused');
  });

  it('follows the live view width for right-anchored hotspots', () => {
    const { game } = setup();
    game.commands.startRun();
    game.display.viewWidth = 427;
    const [x, y] = centre(hudButtons(427, true).pause);
    expect(game.hitHotspot(x, y)).toBe(true);
    expect(game.state.mode).toBe('paused');
  });

  it('the mute hotspot toggles mute in every mode', () => {
    const { game } = setup();
    const [x, y] = centre(hudButtons(game.display.viewWidth, true).mute);
    expect(game.hitHotspot(x, y)).toBe(true);
    expect(game.state.muted).toBe(true);
    game.commands.startRun();
    game.hitHotspot(x, y);
    expect(game.state.muted).toBe(false);
    expect(game.state.mode).toBe('playing');
  });

  it('the fullscreen hotspot exists only where fullscreen is supported', () => {
    const supported = setup(true);
    const [x, y] = centre(hudButtons(320, true).fullscreen!);
    expect(supported.game.hitHotspot(x, y)).toBe(true);
    expect(supported.toggles()).toBe(1);

    const unsupported = setup(false);
    expect(unsupported.game.hitHotspot(x, y)).toBe(false);
  });

  it('a tap anywhere on the pause screen resumes, but buttons keep working there', () => {
    const { game } = setup();
    game.commands.startRun();
    game.commands.pause();
    const [mx, my] = centre(hudButtons(320, true).mute);
    game.hitHotspot(mx, my);
    expect(game.state.mode).toBe('paused');
    expect(game.state.muted).toBe(true);
    expect(game.hitHotspot(160, 90)).toBe(true);
    expect(game.state.mode).toBe('playing');
  });

  it('pauses a run when a touch device turns to portrait and a tap dismisses the hint', () => {
    const { game } = setup();
    game.display.touch = true;
    game.commands.startRun();
    game.display.portrait = true;
    game.tick();
    expect(game.state.mode).toBe('paused');
    expect(game.hitHotspot(160, 90)).toBe(true);
    expect(game.state.mode).toBe('paused');
    game.tick();
    expect(game.state.mode).toBe('paused');
  });
});
