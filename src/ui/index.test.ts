import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { keyDown, keyUp, PointerControls } from '../core/input';
import { createStore, type Store } from '../core/storage';
import { createUiSystem } from './index';
import { hudButtons, settingsLayout, uiMetrics } from './layout';
import { logoRect } from './logo';
import { loadKidMode, parentQuestion, saveKidMode } from './settings';

function memoryStore(): Store & { raw: Map<string, string> } {
  const raw = new Map<string, string>();
  const store = createStore({
    getItem: (k: string) => raw.get(k) ?? null,
    setItem: (k: string, v: string) => void raw.set(k, v),
  } as unknown as Storage);
  return Object.assign(store, { raw });
}

function setup(fullscreenAvailable = true, store = memoryStore()) {
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

describe('hidden settings menu', () => {
  function title(kidMode?: boolean) {
    const store = memoryStore();
    if (kidMode !== undefined) saveKidMode(store, kidMode);
    const t = setup(true, store);
    const pointers = new PointerControls(t.game);
    const ticks = (n: number) => {
      for (let i = 0; i < n; i++) t.game.tick();
    };
    const logo = centre(logoRect(t.game.display.viewWidth));
    const menu = () => settingsLayout(t.game.display.viewWidth, uiMetrics(t.game.display));
    /** Presses a menu button through the real hotspot path; false if no hotspot is there. */
    const press = (r: { x: number; y: number; w: number; h: number }) => {
      const [x, y] = centre(r);
      return t.game.hitHotspot(x, y);
    };
    const longPress = (frames = 180, touch = true) => {
      pointers.down(1, logo[0], logo[1], touch);
      ticks(frames);
      pointers.up(1);
      t.game.tick();
    };
    return { ...t, pointers, ticks, logo, menu, press, longPress };
  }

  it('loads kid mode at startup (adult mode by default)', () => {
    expect(setup().game.state.kidMode).toBe(false);
    expect(title(true).game.state.kidMode).toBe(true);
  });

  it('a 3 s long press on the logo opens it without starting a run', () => {
    for (const touch of [true, false]) {
      const t = title();
      t.longPress(180, touch);
      expect(t.game.state.mode).toBe('title');
      expect(t.press(t.menu().toggle)).toBe(true);
      expect(t.game.state.kidMode).toBe(true);
    }
  });

  it('a shorter press on the logo does not open it; letting go starts the run like a tap', () => {
    const t = title();
    t.pointers.down(1, t.logo[0], t.logo[1], true);
    t.ticks(170);
    expect(t.game.state.mode).toBe('title');
    t.pointers.up(1);
    t.game.tick();
    expect(t.game.state.mode).toBe('playing');
    t.game.commands.gameOver();
    t.game.commands.toTitle();
    expect(t.press(t.menu().back)).toBe(false); // menu closed
  });

  it('holding K for 3 s on the title opens it; a short K does nothing', () => {
    const t = title();
    keyDown(t.game, 'KeyK');
    t.ticks(100);
    keyUp(t.game, 'KeyK');
    t.ticks(5);
    expect(t.game.state.mode).toBe('title');
    expect(t.press(t.menu().back)).toBe(false); // menu closed
    keyDown(t.game, 'KeyK');
    t.ticks(180);
    keyUp(t.game, 'KeyK');
    t.ticks(2);
    expect(t.game.state.mode).toBe('title');
    expect(t.press(t.menu().toggle)).toBe(true);
  });

  it('K does nothing outside the title screen', () => {
    const t = title();
    t.game.commands.startRun();
    keyDown(t.game, 'KeyK');
    t.ticks(200);
    keyUp(t.game, 'KeyK');
    t.game.commands.pause();
    expect(t.press(t.menu().toggle)).toBe(true); // the pause screen's tap-to-resume, not the menu
    expect(t.game.state.kidMode).toBe(false);
  });

  it('while open, Space and taps do not start a run; Escape closes it', () => {
    const t = title();
    t.longPress();
    keyDown(t.game, 'Space');
    t.ticks(2);
    keyUp(t.game, 'Space');
    t.pointers.down(2, 5, 170, true);
    t.pointers.up(2);
    t.ticks(2);
    expect(t.game.state.mode).toBe('title');
    keyDown(t.game, 'Escape');
    keyUp(t.game, 'Escape');
    t.ticks(1);
    expect(t.game.state.mode).toBe('title');
    expect(t.press(t.menu().back)).toBe(false); // menu closed
  });

  it('Zurück closes it', () => {
    const t = title();
    t.longPress();
    expect(t.press(t.menu().back)).toBe(true);
    expect(t.press(t.menu().back)).toBe(false); // menu closed
  });

  it('turning kid mode on is immediate and persisted', () => {
    const t = title();
    t.longPress();
    t.press(t.menu().toggle);
    expect(t.game.state.kidMode).toBe(true);
    expect(loadKidMode(t.store)).toBe(true);
  });

  it('turning it off needs the right answer to the parent check', () => {
    const t = title(true);
    t.longPress();
    const q = parentQuestion(t.game.state.frame);
    t.press(t.menu().toggle);
    expect(t.game.state.kidMode).toBe(true);
    t.press(t.menu().answers[q.correct]);
    expect(t.game.state.kidMode).toBe(false);
    expect(loadKidMode(t.store)).toBe(false);
  });

  it('a wrong answer keeps kid mode on and closes the menu', () => {
    const t = title(true);
    t.longPress();
    const q = parentQuestion(t.game.state.frame);
    t.press(t.menu().toggle);
    t.press(t.menu().answers[(q.correct + 1) % 3]);
    expect(t.game.state.kidMode).toBe(true);
    expect(loadKidMode(t.store)).toBe(true);
    expect(t.press(t.menu().back)).toBe(false); // menu closed
    expect(t.game.state.mode).toBe('title');
  });

  it('the keyboard can answer too: 1-3 pick an answer, Enter toggles', () => {
    const t = title(true);
    keyDown(t.game, 'KeyK');
    t.ticks(180);
    keyUp(t.game, 'KeyK');
    const q = parentQuestion(t.game.state.frame);
    keyDown(t.game, 'Enter');
    keyUp(t.game, 'Enter');
    keyDown(t.game, `Digit${q.correct + 1}`);
    keyUp(t.game, `Digit${q.correct + 1}`);
    expect(t.game.state.kidMode).toBe(false);
  });

  it('touch devices get the large HUD tap areas', () => {
    const t = title();
    t.game.display.touch = true;
    t.game.commands.startRun();
    const big = hudButtons(t.game.display.viewWidth, true, uiMetrics(t.game.display)).pause;
    expect(big.w).toBeGreaterThanOrEqual(22);
    expect(t.game.hitHotspot(big.x + 1, big.y + big.h - 2)).toBe(true);
    expect(t.game.state.mode).toBe('paused');
  });
});
