import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { keyDown, keyUp, PointerControls } from '../core/input';
import { createStore, type Store } from '../core/storage';
import { createUiSystem } from './index';
import type { Rect, System } from '../types';
import { HudModel } from './hud-model';
import { itemButtonRect } from './item-button';
import { hudButtons, settingsLayout, uiMetrics } from './layout';
import { logoRect } from './logo';
import { gameOverLayout, type MenuInput, pauseLayout, titleLayout, whatsNewLayout } from './menu-layout';
import { loadKidMode, saveKidMode } from './settings';

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
  let uses = 0;
  const ui = createUiSystem({ store, fullscreenAvailable: () => fullscreenAvailable });
  const useSpy: System = { name: 'use-spy', update: (ctx) => void (ctx.input.use.pressed && uses++) };
  const game = new Game({ systems: [useSpy, ui], platform: { toggleFullscreen: () => fullscreenToggles++ } });
  return { game, store, ui, toggles: () => fullscreenToggles, uses: () => uses };
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

  it('the mute hotspot toggles mute in every mode, flush right while there is no pause button', () => {
    const { game } = setup();
    const onTitle = hudButtons(game.display.viewWidth, true, undefined, false).mute;
    expect(onTitle).toEqual(hudButtons(game.display.viewWidth, true).pause);
    const [x, y] = centre(onTitle);
    expect(game.hitHotspot(x, y)).toBe(true);
    expect(game.state.muted).toBe(true);
    game.commands.startRun();
    game.hitHotspot(...centre(hudButtons(game.display.viewWidth, true).mute));
    expect(game.state.muted).toBe(false);
    expect(game.state.mode).toBe('playing');
  });

  it('the fullscreen hotspot exists only where fullscreen is supported', () => {
    const supported = setup(true);
    const [x, y] = centre(hudButtons(320, true, undefined, false).fullscreen!);
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

  it('the touch item button uses the carried item and does not jump', () => {
    const { game, uses } = setup();
    game.display.touch = true;
    game.commands.startRun();
    const [x, y] = centre(itemButtonRect(game.display.viewWidth, game.display));
    expect(game.hitHotspot(x, y)).toBe(false); // nothing carried: no button
    game.state.carriedItem = 'pretzel';
    expect(game.hitHotspot(x, y)).toBe(true);
    game.tick();
    expect(uses()).toBe(1);
    expect(game.state.player.grounded).toBe(true);
  });

  it('on desktop the E key cap chip is clickable while carrying', () => {
    const { game, uses } = setup();
    game.commands.startRun();
    game.state.carriedItem = 'football';
    game.tick();
    // The ui places the chip with the same model it draws the HUD from.
    const hud = new HudModel();
    hud.update(game.state, true);
    const chip = hud.chip!;
    expect(game.hitHotspot(...centre(chip))).toBe(true);
    game.tick();
    expect(uses()).toBe(1);
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

  it('turning it off is immediate too: no question, persisted, the menu stays open', () => {
    const t = title(true);
    t.longPress();
    t.press(t.menu().toggle);
    expect(t.game.state.kidMode).toBe(false);
    expect(loadKidMode(t.store)).toBe(false);
    expect(t.press(t.menu().toggle)).toBe(true); // still the menu: toggles back on
    expect(t.game.state.kidMode).toBe(true);
  });

  it('Enter toggles in both directions from the keyboard', () => {
    const t = title(true);
    keyDown(t.game, 'KeyK');
    t.ticks(180);
    keyUp(t.game, 'KeyK');
    keyDown(t.game, 'Enter');
    keyUp(t.game, 'Enter');
    expect(t.game.state.kidMode).toBe(false);
    keyDown(t.game, 'Enter');
    keyUp(t.game, 'Enter');
    expect(t.game.state.kidMode).toBe(true);
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

describe('grind trick hint', () => {
  it('persists a grind trick so the trick hint never shows again', () => {
    const { game, store } = setup();
    game.commands.startRun();
    game.tick();
    expect(store.get('grindTrickSeen', false)).toBe(false);
    game.bus.emit('grindTrick', { entityId: 1, ticks: 30, points: 90 });
    expect(store.get('grindTrickSeen', false)).toBe(true);
  });
});

describe('update, what is new, install hint and pause navigation', () => {
  function app(options: { touch?: boolean; portrait?: boolean } = {}) {
    let reloads = 0;
    let prompts = 0;
    const store = memoryStore();
    const ui = createUiSystem({ store, fullscreenAvailable: () => true });
    const game = new Game({ systems: [ui], platform: { reload: () => reloads++ } });
    game.display.touch = options.touch ?? false;
    game.display.portrait = options.portrait ?? false;
    const pointers = new PointerControls(game);
    const ticks = (n: number) => {
      for (let i = 0; i < n; i++) game.tick();
    };
    const input = (fields: Partial<MenuInput> = {}): MenuInput => ({
      viewWidth: game.display.viewWidth,
      touch: game.display.touch,
      portrait: game.display.portrait,
      fullscreenAvailable: true,
      reload: game.state.updateReady,
      install: null,
      ...fields,
    });
    const press = (r: Rect | null) => (r ? game.hitHotspot(...centre(r)) : false);
    const key = (code: string) => {
      keyDown(game, code);
      keyUp(game, code);
      game.tick();
    };
    const capturePrompt = () => game.install.capturePrompt({ preventDefault: () => {}, prompt: () => void prompts++ });
    const runStarts = () => {
      let n = 0;
      game.bus.on('runStarted', () => n++);
      return () => n;
    };
    return { game, store, pointers, ticks, input, press, key, capturePrompt, runStarts, reloads: () => reloads, prompts: () => prompts };
  }

  it('the reload button shows on title, pause and game over only while a new version waits; tap or U reloads', () => {
    const t = app();
    const button = titleLayout(t.input({ reload: true })).buttons.reload;
    expect(t.press(button)).toBe(false);
    t.key('KeyU');
    expect(t.reloads()).toBe(0);

    t.game.state.updateReady = true;
    expect(t.press(button)).toBe(true);
    expect(t.reloads()).toBe(1);
    expect(t.game.state.mode).toBe('title');
    t.key('KeyU');
    expect(t.reloads()).toBe(2);

    t.game.commands.startRun();
    t.key('KeyU');
    expect(t.reloads()).toBe(2); // never mid-run
    t.game.commands.pause();
    expect(t.press(pauseLayout(t.input()).buttons.reload)).toBe(true);
    expect(t.reloads()).toBe(3);
    expect(t.game.state.mode).toBe('paused');

    t.game.commands.resume();
    t.game.commands.gameOver();
    t.ticks(60);
    expect(t.press(gameOverLayout({ ...t.input(), newRecord: false }).buttons.reload)).toBe(true);
    expect(t.reloads()).toBe(4);
  });

  it('touch: the reload button is a big tap area that does not start a run', () => {
    const t = app({ touch: true });
    t.game.state.updateReady = true;
    const button = titleLayout(t.input()).buttons.reload!;
    expect(button.h).toBeGreaterThanOrEqual(24);
    expect(t.press(button)).toBe(true);
    t.ticks(2);
    expect(t.game.state.mode).toBe('title');
    expect(t.reloads()).toBe(1);
  });

  it("'Neu in dieser Version' comes before the title: a tap or any key continues and marks the version seen", () => {
    const t = app();
    t.game.state.whatsNew = [{ version: '2099-01-01.1', date: '2099-01-01', items: ['Neu A'] }];
    expect(t.game.hitHotspot(160, 120)).toBe(true);
    t.ticks(2);
    expect(t.game.state.whatsNew).toEqual([]);
    expect(t.game.state.mode).toBe('title');

    t.game.state.whatsNew = [{ version: '2099-01-01.1', date: '2099-01-01', items: ['Neu A'] }];
    t.key('Space');
    t.ticks(2);
    expect(t.game.state.whatsNew).toEqual([]);
    expect(t.game.state.mode).toBe('title'); // the key only closed the screen
    t.key('Space');
    expect(t.game.state.mode).toBe('playing');
  });

  it("the 'Weiter' button continues too, and the logo is not live behind the screen", () => {
    const t = app({ touch: true });
    t.game.state.whatsNew = [{ version: '2099-01-01.1', date: '2099-01-01', items: ['Neu A', 'Neu B'] }];
    const next = whatsNewLayout(t.input(), ['Neu A', 'Neu B']).buttons.next;
    expect(t.press(next)).toBe(true);
    expect(t.game.state.whatsNew).toEqual([]);
    t.ticks(2);
    expect(t.game.state.mode).toBe('title');
  });

  it('install hint: Installieren shows the captured prompt from the tap, × dismisses for good', () => {
    const t = app({ touch: true });
    t.game.state.install.visits = 2;
    t.game.state.install.platform = 'android';
    t.capturePrompt();
    const l = titleLayout(t.input({ install: 'prompt' }));
    expect(t.press(l.buttons.install)).toBe(true);
    expect(t.prompts()).toBe(1);
    expect(t.game.state.mode).toBe('title');
    // Without a prompt left there is no hint on Android any more.
    expect(t.press(l.buttons.dismiss)).toBe(false);

    const ios = app({ touch: true });
    ios.game.state.install.visits = 3;
    ios.game.state.install.platform = 'ios';
    const il = titleLayout(ios.input({ install: 'ios' }));
    expect(ios.press(il.buttons.dismiss)).toBe(true);
    expect(ios.game.state.install.dismissed).toBe(true);
    expect(ios.press(il.buttons.dismiss)).toBe(false);
  });

  it('install hint: also on game over, never on desktop, mid-run or on the first visit', () => {
    const t = app({ touch: true });
    t.game.state.install.platform = 'ios';
    t.game.state.install.visits = 1;
    const dismiss = titleLayout(t.input({ install: 'ios' })).buttons.dismiss;
    expect(t.press(dismiss)).toBe(false);
    t.game.state.install.visits = 2;
    t.game.commands.startRun();
    t.game.commands.gameOver();
    t.ticks(60);
    expect(t.press(gameOverLayout({ ...t.input({ install: 'ios' }), newRecord: false }).buttons.dismiss)).toBe(true);
    expect(t.game.state.install.dismissed).toBe(true);

    const desk = app();
    desk.game.state.install.platform = 'ios';
    desk.game.state.install.visits = 2;
    desk.game.display.touch = true;
    const rect = titleLayout(desk.input({ install: 'ios' })).buttons.dismiss;
    desk.game.display.touch = false;
    expect(desk.press(rect)).toBe(false);
  });

  it('pause: Zum Startbildschirm ends the run (its stars still count) and shows the title', () => {
    const t = app();
    t.game.commands.startRun();
    t.game.state.stars = 3;
    t.game.commands.pause();
    expect(t.press(pauseLayout(t.input()).buttons.toTitle)).toBe(true);
    expect(t.game.state.mode).toBe('title');
    expect(t.store.get('starsTotal', 0)).toBe(3);
    t.game.commands.startRun();
    t.game.commands.gameOver();
    t.ticks(60);
    t.key('KeyT');
    expect(t.game.state.mode).toBe('title');
  });

  it('game over: Zum Startbildschirm only after the input delay', () => {
    const t = app({ touch: true });
    t.game.commands.startRun();
    t.game.commands.gameOver();
    const button = gameOverLayout({ ...t.input(), newRecord: false }).buttons.toTitle;
    expect(t.press(button)).toBe(false);
    t.ticks(60);
    expect(t.press(button)).toBe(true);
    expect(t.game.state.mode).toBe('title');
  });

  it('pause: a short tap on the logo resumes, a 3 s hold (or K) opens the settings', () => {
    const t = app({ touch: true });
    t.game.commands.startRun();
    t.game.commands.pause();
    const logo = centre(pauseLayout(t.input()).buttons.logo!);
    t.pointers.down(1, logo[0], logo[1], true);
    t.ticks(10);
    t.pointers.up(1);
    t.ticks(1);
    expect(t.game.state.mode).toBe('playing');

    t.game.commands.pause();
    t.pointers.down(1, logo[0], logo[1], true);
    t.ticks(180);
    t.pointers.up(1);
    t.ticks(1);
    expect(t.game.state.mode).toBe('paused');
    const menu = settingsLayout(t.game.display.viewWidth, uiMetrics(t.game.display));
    expect(t.press(menu.back)).toBe(true); // menu open; Zurück closes it
    expect(t.game.state.mode).toBe('paused');

    keyDown(t.game, 'KeyK');
    t.ticks(180);
    keyUp(t.game, 'KeyK');
    t.ticks(1);
    expect(t.press(menu.toggle)).toBe(true);
    expect(t.game.state.kidMode).toBe(true);
  });

  it('switching kid mode from pause restarts the run when the menu closes; no switch keeps the pause', () => {
    const t = app();
    const starts = t.runStarts();
    t.game.commands.startRun();
    t.game.commands.pause();
    const menu = settingsLayout(t.game.display.viewWidth, uiMetrics(t.game.display));
    const openMenu = () => {
      keyDown(t.game, 'KeyK');
      t.ticks(180);
      keyUp(t.game, 'KeyK');
      t.ticks(1);
    };
    openMenu();
    t.key('Escape');
    expect(t.game.state.mode).toBe('paused');
    expect(starts()).toBe(1);

    openMenu();
    t.press(menu.toggle);
    expect(t.game.state.kidMode).toBe(true);
    expect(t.game.state.mode).toBe('paused'); // the note shows until the menu closes
    t.press(menu.back);
    expect(starts()).toBe(2);
    expect(t.game.state.mode).toBe('playing');

    // And off again without any question: another restart.
    t.game.commands.pause();
    openMenu();
    t.press(menu.toggle);
    expect(t.game.state.kidMode).toBe(false);
    t.press(menu.back);
    expect(starts()).toBe(3);
    expect(t.game.state.mode).toBe('playing');
  });
});
