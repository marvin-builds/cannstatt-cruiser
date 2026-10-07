/**
 * Default playtest: title, a seeded run, tap vs hold jump heights, real
 * keyboard/touch input, page layout checks and screenshots over time.
 */
import type { PlaytestContext } from '../playtest-lib';

async function pageLayout(t: PlaytestContext) {
  return t.page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('#game')!;
    const root = document.scrollingElement!;
    return {
      scrollbars: root.scrollWidth > root.clientWidth || root.scrollHeight > root.clientHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      zoom: window.visualViewport?.scale ?? 1,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      cssWidth: canvas.getBoundingClientRect().width,
      dpr: window.devicePixelRatio,
    };
  });
}

export default async function defaultScenario(t: PlaytestContext): Promise<void> {
  const { game } = t;
  await t.wait(300);
  await t.screenshot('title');
  await t.canvasShot('title');

  const layout = await pageLayout(t);
  t.check('no scrollbars', !layout.scrollbars, layout);
  t.check('integer device-pixel scale', layout.canvasWidth % 320 === 0 && layout.canvasHeight % 180 === 0, layout);

  // Deterministic part: frozen clock, fixed seed.
  await game.pause();
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

  await game.pauseGame();
  await game.pause();
  await game.step(1);
  await t.screenshot('paused');
  await game.resumeGame();
  await game.setZone(2);
  await game.step(1);
  await t.canvasShot('zone 2');
}
