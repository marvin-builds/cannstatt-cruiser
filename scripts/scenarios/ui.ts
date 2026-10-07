/**
 * UI playtest: every screen (title, HUD with combo/stars/reduced health and
 * popups, zone banner, pause, game over with and without a new record,
 * portrait hint) plus real pointer presses on the pause, mute and fullscreen
 * buttons, checking they never trigger a jump.
 *
 *   npm run playtest -- --scenario scripts/scenarios/ui.ts --name ui
 */
import type { UiDebugHook } from '../../src/ui/debug';
import type { PlaytestContext } from '../playtest-lib';

type UiWindow = Window & { __ui?: UiDebugHook };

const ui = <K extends keyof UiDebugHook>(t: PlaytestContext, method: K, ...args: Parameters<UiDebugHook[K]>) =>
  t.page.evaluate(([m, a]) => ((window as UiWindow).__ui![m] as (...x: unknown[]) => void)(...a), [method, args] as const);

/** Centre of a HUD button's tap area for this display (pause, mute, fullscreen), from src/ui/layout.ts via __ui. */
async function button(t: PlaytestContext, name: 'pause' | 'mute' | 'fullscreen'): Promise<{ x: number; y: number }> {
  const r = (await t.page.evaluate(() => (window as UiWindow).__ui!.layout().hud))[name]!;
  return { x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) };
}

async function tapButton(t: PlaytestContext, name: 'pause' | 'mute' | 'fullscreen'): Promise<void> {
  const { x, y } = await button(t, name);
  await t.realTapView(x, y);
}

async function playing(t: PlaytestContext, seed: number): Promise<void> {
  await t.game.seed(seed);
  await t.game.startRun();
  await t.game.step(30);
}

async function finish(t: PlaytestContext, score: number, stars: number): Promise<void> {
  await t.game.setScore(score);
  await ui(t, 'hud', { stars });
  await t.game.step(1);
  await t.game.endRun();
}

export default async function uiScenario(t: PlaytestContext): Promise<void> {
  const { game } = t;
  await game.pause();
  const { viewWidth, touch, portrait } = await game.display();

  await ui(t, 'setRecords', 12_500, 87);
  await game.step(2);
  if (touch && portrait) {
    await t.canvasShot('portrait hint');
    await t.screenshot('portrait hint page');
    await t.realTapView(Math.floor(viewWidth / 2), 90);
    await game.step(2);
    t.check('a tap dismisses the portrait hint without starting', (await game.state()).mode === 'title');
  }
  await t.canvasShot('title');
  await t.screenshot('title page');

  await playing(t, 4);
  await ui(t, 'hud', { combo: 4, multiplier: 3, stars: 12 });
  await game.setScore(48_210);
  await game.setHealth(2);
  await ui(t, 'samplePopups');
  await game.step(8);
  await t.canvasShot('hud combo popups');
  await game.setZone(1);
  await game.step(30);
  await t.canvasShot('zone banner');

  if (!portrait) {
    const since = (await game.state()).frame;
    await game.resume();
    await tapButton(t, 'pause');
    await t.wait(150);
    await game.pause();
    const s = await game.state();
    t.check('pause button pauses', s.mode === 'paused', { mode: s.mode });
    const jumps = await game.eventsSince(since, 'jump');
    t.check('pause button does not jump', jumps.length === 0, jumps);
    await t.canvasShot('pause');

    const muted = s.muted;
    await game.resume();
    await tapButton(t, 'mute');
    await t.wait(150);
    await game.pause();
    t.check('mute button toggles mute', (await game.state()).muted === !muted);
    await t.canvasShot('pause muted');

    await game.resume();
    await tapButton(t, 'fullscreen');
    await t.wait(400);
    const fs = await t.page.evaluate(() => Boolean(document.fullscreenElement));
    t.check('fullscreen button enters fullscreen', fs, { fs });
    if (fs) await t.page.evaluate(() => document.exitFullscreen());
    await t.wait(300);
    await game.pause();
    t.check('fullscreen button keeps the game paused', (await game.state()).mode === 'paused');
    await game.resumeGame();
  } else {
    await game.pauseGame();
    await game.step(2);
    await t.canvasShot('pause');
    await game.resumeGame();
  }

  await finish(t, 3_400, 5);
  await game.step(10);
  await t.canvasShot('game over early');
  await game.step(60);
  await t.canvasShot('game over no record');

  await playing(t, 5);
  await finish(t, 61_234, 9);
  await game.step(70);
  await t.canvasShot('game over new record');
  const stored = await t.page.evaluate(() => [
    localStorage.getItem('cannstatt-cruiser:highscore'),
    localStorage.getItem('cannstatt-cruiser:starsTotal'),
  ]);
  t.check('records persisted', stored[0] === '61234' && stored[1] === '101', stored);
  await t.screenshot('game over page');
}
