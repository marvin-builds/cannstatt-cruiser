import type { System } from '../types';
import { TICK_DT } from './config';
import { isFullscreen, toggleFullscreen } from './fullscreen';
import { Game } from './game';
import { bindInput } from './input';
import { FixedTimestep } from './loop';
import { Renderer } from './renderer';
import { createTestHook, testHookEnabled } from './testhook';

/** Boots the game in the browser: canvas, loop, input, test hook, service worker. */
export function startApp(systems: System[]): Game {
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  if (!canvas) throw new Error('index.html must contain <canvas id="game">');
  const renderer = new Renderer(canvas);
  const game = new Game({
    systems,
    platform: { toggleFullscreen, setLetterboxColor: (c) => renderer.setLetterboxColor(c) },
  });

  const updateDisplay = () => {
    renderer.resize();
    game.display.portrait = window.innerHeight > window.innerWidth;
    game.display.touch = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
    game.display.fullscreen = isFullscreen();
  };
  updateDisplay();
  window.addEventListener('resize', updateDisplay);
  window.visualViewport?.addEventListener('resize', updateDisplay);
  document.addEventListener('fullscreenchange', updateDisplay);

  bindInput(game, () => renderer.layout);

  const loop = new FixedTimestep(TICK_DT);
  let frozen = false;
  const draw = () => {
    renderer.beginFrame();
    game.render(renderer.g, loop.alpha);
    renderer.present();
  };

  let last = performance.now();
  const frame = (now: number) => {
    const elapsed = (now - last) / 1000;
    last = now;
    if (!frozen) loop.advance(elapsed, () => game.tick());
    draw();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  if (testHookEnabled()) {
    window.__game = createTestHook(game, {
      freeze: () => void (frozen = true),
      unfreeze: () => {
        frozen = false;
        loop.reset();
      },
      get frozen() {
        return frozen;
      },
      setTimeScale: (s) => void (loop.timeScale = s),
      redraw: draw,
      capture: (scale) => renderer.capture(scale),
    });
  }

  registerServiceWorker();
  return game;
}

/** Registers public/sw.js (shipped by the PWA slice) once it is actually served as a script. */
function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', async () => {
    try {
      const head = await fetch('./sw.js', { method: 'HEAD' });
      if (head.ok && /javascript/.test(head.headers.get('content-type') ?? '')) {
        await navigator.serviceWorker.register('./sw.js');
      }
    } catch {
      // Offline support is optional.
    }
  });
}
