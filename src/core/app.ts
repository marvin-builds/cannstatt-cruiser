import type { System } from '../types';
import { TICK_DT } from './config';
import { isFullscreen, toggleFullscreen } from './fullscreen';
import { Game } from './game';
import { bindInput } from './input';
import { detectInstallEnvironment, type InstallPromptEvent } from './install';
import { FixedTimestep } from './loop';
import type { FrameProbe } from './perf';
import { Renderer } from './renderer';
import { store } from './storage';
import { createTestHook, testHookEnabled } from './testhook';
import { handleServiceWorkerMessage } from './update';

/** Boots the game in the browser: canvas, loop, input, install prompt, test hook, service worker. */
export function startApp(systems: System[]): Game {
  const canvas = document.querySelector<HTMLCanvasElement>('#game');
  if (!canvas) throw new Error('index.html must contain <canvas id="game">');
  const renderer = new Renderer(canvas);
  const game = new Game({
    systems,
    platform: {
      toggleFullscreen,
      setLetterboxColor: (c) => renderer.setLetterboxColor(c),
      reload: () => location.reload(),
      installEnvironment: () =>
        detectInstallEnvironment({
          userAgent: navigator.userAgent,
          maxTouchPoints: navigator.maxTouchPoints,
          displayModeStandalone: matchMedia('(display-mode: standalone)').matches,
          navigatorStandalone: (navigator as Navigator & { standalone?: boolean }).standalone,
        }),
    },
    store,
  });
  // Chromium offers installing the PWA: keep the prompt for the ui's "Installieren" button.
  window.addEventListener('beforeinstallprompt', (e) => game.install.capturePrompt(e as Event & InstallPromptEvent));
  window.addEventListener('appinstalled', () => game.install.appInstalled());

  const updateDisplay = () => {
    renderer.resize();
    game.display.viewWidth = renderer.layout.viewWidth;
    game.display.viewHeight = renderer.layout.viewHeight;
    game.display.portrait = window.innerHeight > window.innerWidth;
    game.display.touch = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
    game.display.fullscreen = isFullscreen();
  };
  updateDisplay();
  window.addEventListener('resize', updateDisplay);
  window.visualViewport?.addEventListener('resize', updateDisplay);
  window.addEventListener('orientationchange', updateDisplay);
  document.addEventListener('fullscreenchange', updateDisplay);

  bindInput(game, () => renderer.layout);

  const loop = new FixedTimestep(TICK_DT);
  let frozen = false;
  const draw = () => {
    renderer.beginFrame();
    game.render(renderer.g, loop.alpha);
  };

  const tick = () => game.tick();
  let last = performance.now();
  const frame = (now: number) => {
    const elapsed = (now - last) / 1000;
    last = now;
    if (game.probe) measuredFrame(game.probe, now, elapsed);
    else {
      if (!frozen) loop.advance(elapsed, tick);
      draw();
    }
    requestAnimationFrame(frame);
  };
  /** The same frame, timed piece by piece for window.__game.perf (scripts/frametimes.ts). */
  const measuredFrame = (probe: FrameProbe, now: number, elapsed: number) => {
    probe.beginFrame(now, elapsed * 1000);
    const t0 = performance.now();
    const updates = frozen ? 0 : loop.advance(elapsed, tick);
    const t1 = performance.now();
    draw();
    probe.endFrame({
      updates,
      updateMs: t1 - t0,
      renderMs: performance.now() - t1,
      distance: game.state.distance,
      scroll: game.renderedScroll,
      heap: usedHeap(),
    });
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

  registerServiceWorker(game);
  return game;
}

/** Chromium's JS heap size (exact with --enable-precise-memory-info), 0 elsewhere. */
function usedHeap(): number {
  return (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? 0;
}

/**
 * Registers public/sw.js once it is actually served as a script, and turns its
 * messages (a new deploy is cached) into `state.updateReady`.
 */
function registerServiceWorker(game: Game): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (e) => handleServiceWorkerMessage(game.state, e.data));
  // Delivers messages queued while the page was still loading.
  navigator.serviceWorker.startMessages();
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
