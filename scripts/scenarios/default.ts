/**
 * Default playtest: title, a seeded run, tap vs hold jump heights, real
 * keyboard/touch input, adaptive view width (incl. live rotation), the pause
 * hotspot at the right edge, page layout checks and screenshots over time.
 */
import { VIEW_H, VIEW_MAX_W } from '../../src/core/config';
import { dismissRotateHint, type PlaytestContext } from '../playtest-lib';

async function pageLayout(t: PlaytestContext) {
  return t.page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
    const root = document.scrollingElement!;
    return {
      scrollbars: root.scrollWidth > root.clientWidth || root.scrollHeight > root.clientHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      zoom: window.visualViewport?.scale ?? 1,
      /** Backing store: the view itself (CSS scales it up). */
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      cssWidth: canvas.getBoundingClientRect().width,
      cssHeight: canvas.getBoundingClientRect().height,
      dpr: window.devicePixelRatio,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
    };
  });
}

/** Integer scale, and a view that fills the width up to less than one view pixel (or VIEW_MAX_W). */
async function checkAdaptiveView(t: PlaytestContext, label: string): Promise<void> {
  const layout = await pageLayout(t);
  const { viewWidth } = await t.game.display();
  const deviceWidth = Math.round(layout.cssWidth * layout.dpr);
  const scale = Math.round(layout.cssHeight * layout.dpr) / VIEW_H;
  const ok = Number.isInteger(scale) && deviceWidth === viewWidth * scale && layout.canvasWidth === viewWidth && layout.canvasHeight === VIEW_H;
  t.check(`${label}: integer device-pixel scale`, ok, { ...layout, viewWidth });
  const spareDevicePx = layout.windowWidth * layout.dpr - deviceWidth;
  const fills = viewWidth === VIEW_MAX_W || spareDevicePx < scale;
  t.check(`${label}: view width fills the screen`, fills, { viewWidth, spareDevicePx, scale });
}

export default async function defaultScenario(t: PlaytestContext): Promise<void> {
  const { game } = t;
  await t.wait(300);
  await t.screenshot('title');
  await t.canvasShot('title');

  const layout = await pageLayout(t);
  t.check('no scrollbars', !layout.scrollbars, layout);
  await checkAdaptiveView(t, 'initial');

  // Deterministic part: frozen clock, fixed seed. In portrait the rotate hint keeps a run paused until tapped away.
  await game.pause();
  await dismissRotateHint(t);
  await game.seed(1);
  await game.startRun();
  await game.step(30);
  await t.log('run started');
  await t.canvasShot('run');

  const tapApex = await game.jumpApex(2);
  await game.step(10);
  const holdApex = await game.jumpApex(40);
  await t.log('jump heights', { tapApex, holdApex });
  t.check('hold jumps higher than tap', holdApex > tapApex, { tapApex, holdApex });

  await game.press();
  for (let i = 0; i < 60; i++) {
    const s = await game.step(1);
    if (s.player.vy >= 0) break;
  }
  await t.canvasShot('hold apex');
  await t.screenshot('hold apex');
  await game.release();
  await game.step(90);

  // Real input path (keyboard on desktop, CDP touch on phones) with the clock running.
  await game.resume();
  await game.clearEvents();
  await t.realPress(250);
  await t.wait(100);
  const jumps = await game.events('jump');
  const afterTouch = await pageLayout(t);
  t.check(`real ${t.viewport.touch ? 'touch' : 'keyboard'} input jumps`, jumps.length > 0, jumps);
  t.check('input does not scroll or zoom', afterTouch.scrollX === 0 && afterTouch.scrollY === 0 && afterTouch.zoom === 1, afterTouch);

  for (let i = 1; i <= 3; i++) {
    await t.wait(700);
    await t.screenshot(`running ${i}`);
    await t.log(`running ${i}`);
  }

  // Real tap on the right-anchored pause button (exercises screen -> view mapping).
  await game.pause();
  await game.step(1);
  const { viewWidth } = await game.display();
  await t.realTapView(viewWidth - 11, 11);
  const paused = await game.state();
  t.check('pause button at the right edge pauses', paused.mode === 'paused', { mode: paused.mode, viewWidth });
  await game.step(1);
  await t.screenshot('paused');
  await game.resumeGame();
  await game.setZone(0); // runs start in Bad Cannstatt (START_ZONE), so switch to Stuttgart-Mitte
  await game.step(1);
  await t.canvasShot('zone 0');

  // Rotate (swap width and height) live and back, without reload.
  const size = t.page.viewportSize()!;
  await t.page.setViewportSize({ width: size.height, height: size.width });
  await t.wait(200);
  await game.step(1);
  await checkAdaptiveView(t, 'rotated');
  await t.screenshot('rotated');
  await t.page.setViewportSize(size);
  await t.wait(200);
  await game.step(1);
  await checkAdaptiveView(t, 'rotated back');
  await t.screenshot('rotated back');
}
