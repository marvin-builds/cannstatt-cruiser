/**
 * Hidden settings menu and kid mode: the title shows no settings button; a
 * 3 s long press on the logo (touch / mouse) or holding K (keyboard) opens
 * "Einstellungen" without starting a run (progress only after ~1 s); kid mode
 * is on by default with nothing stored (ROADMAP 39) and turns off and on at
 * once (the long press is the only guard); an explicit choice (off as well
 * as on) survives a reload; a kid-mode run shows the
 * bubble gum, the pink tint and the gum HUD icon. Also checks that every
 * button's tap area is >= 44 CSS px on touch viewports.
 *   npm run playtest -- --scenario scripts/scenarios/settings.ts --viewports desktop,phone-landscape,phone-portrait --name settings
 */
import { PLAYER_X } from '../../src/core/config';
import type {} from '../../src/gameplay/debug'; // window.__gameplay
import type { Rect } from '../../src/types';
import type { UiDebugHook } from '../../src/ui/debug';
import { cssPerViewPixel, dismissRotateHint, holdViewWhile, type PlaytestContext, stepWhile } from '../playtest-lib';

type UiWindow = Window & { __ui?: UiDebugHook };

const settings = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.settings());
const layout = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.layout());
const centre = (r: Rect) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });
const storedKidMode = (t: PlaytestContext) => t.page.evaluate(() => localStorage.getItem('cannstatt-cruiser:kidMode'));

async function tap(t: PlaytestContext, r: Rect): Promise<void> {
  const c = centre(r);
  await t.realTapView(c.x, c.y);
  await t.game.step(1);
}

/** Holds the logo with the real pointer for `frames` ticks of the frozen clock; `shot` labels a mid-hold screenshot. */
async function holdLogo(t: PlaytestContext, frames: number, shot?: { at: number; label: string }): Promise<void> {
  const logo = centre((await layout(t)).logo);
  await holdViewWhile(t, logo.x, logo.y, async () => {
    if (shot) {
      await t.game.step(shot.at);
      const progress = (await settings(t)).holdProgress;
      const hinted = shot.at >= 60;
      t.check(`${shot.label}: progress ${hinted ? 'shows' : 'stays hidden'} after ${shot.at} ticks`, hinted ? progress > 0 : progress === 0, { progress });
      await t.canvasShot(shot.label);
      await t.game.step(frames - shot.at);
    } else {
      await t.game.step(frames);
    }
  });
  await t.game.step(1);
}

/** Opens the menu the way this device would: K held on desktop, a long press on the logo on touch. */
async function openMenu(t: PlaytestContext): Promise<void> {
  if (t.viewport.touch) {
    await holdLogo(t, 185);
  } else {
    await t.page.keyboard.down('KeyK');
    await t.game.step(185);
    await t.page.keyboard.up('KeyK');
    await t.game.step(1);
  }
}

/** Every tap area of the menu and the HUD, in CSS px at the real scale, must be >= 44 on touch. */
async function checkTapSizes(t: PlaytestContext, label: string, rects: Rect[]): Promise<void> {
  if (!t.viewport.touch) return;
  const css = await cssPerViewPixel(t.page);
  const sizes = rects.map((r) => Math.round(Math.min(r.w, r.h) * css));
  t.check(`${label}: tap areas >= 44 CSS px`, sizes.every((s) => s >= 44), { css, sizes });
}

async function titleAndLongPress(t: PlaytestContext): Promise<void> {
  const { game } = t;
  await t.canvasShot('title without settings button');
  await t.screenshot('title page');

  await holdLogo(t, 40, { at: 30, label: 'short hold no hint' });
  const hint = await settings(t);
  // A short hold is a tap: it starts the run; Escape on the game-over screen goes back to the title.
  const short = await game.state();
  t.check('short hold on the logo: no menu, starts the run like a tap', short.mode === 'playing' && hint.screen === 'closed', {
    mode: short.mode,
    hint,
  });
  if (short.mode === 'playing') {
    await game.endRun();
    await game.step(1);
    await t.page.keyboard.press('Escape');
    await game.step(2);
  }
  t.check('back on the title', (await game.state()).mode === 'title', { mode: (await game.state()).mode });

  const before = (await game.state()).frame;
  await holdLogo(t, 185, { at: 120, label: 'long press progress' });
  const s = await game.state();
  const menu = await settings(t);
  t.check('3 s long press on the logo opens the settings', menu.screen === 'menu', menu);
  t.check('the long press does not start a run', s.mode === 'title' && (await game.eventsSince(before, 'runStarted')).length === 0, { mode: s.mode });
}

/** Closes the menu with Zurück (touch) or Escape (desktop). */
async function closeMenu(t: PlaytestContext): Promise<void> {
  if (t.viewport.touch) await tap(t, (await layout(t)).menu.back);
  else {
    await t.page.keyboard.press('Escape');
    await t.game.step(1);
  }
  t.check('menu closes, still on the title', (await settings(t)).screen === 'closed' && (await t.game.state()).mode === 'title');
}

async function toggleKidMode(t: PlaytestContext): Promise<void> {
  const { game } = t;
  const l = await layout(t);
  t.check('kid mode is on by default, nothing stored', (await game.state()).kidMode && (await storedKidMode(t)) === null, await storedKidMode(t));
  await t.canvasShot('settings menu kid mode default');
  await t.screenshot('settings menu page');
  await checkTapSizes(t, 'settings menu', [l.menu.toggle, l.menu.back]);

  // Off at once: no question, the menu stays open.
  await tap(t, l.menu.toggle);
  const menu = await settings(t);
  t.check('Kindermodus turns off at once, no question', menu.screen === 'menu' && !(await game.state()).kidMode && (await storedKidMode(t)) === 'false', menu);
  await t.canvasShot('settings menu kid mode off');
  await t.screenshot('settings menu kid mode off page');

  // On again at once.
  await tap(t, l.menu.toggle);
  t.check('Kindermodus turns on at once', (await game.state()).kidMode && (await storedKidMode(t)) === 'true', await storedKidMode(t));
  await t.canvasShot('settings menu kid mode on');

  // The menu still opens again the same way; switch off for the reload check.
  await tap(t, l.menu.back);
  await openMenu(t);
  t.check(`reopened (${t.viewport.touch ? 'long press' : 'K held'})`, (await settings(t)).screen === 'menu');
  await tap(t, l.menu.toggle);
  await closeMenu(t);
}

async function reload(t: PlaytestContext): Promise<void> {
  await t.page.reload();
  await t.page.waitForFunction(() => Boolean(window.__game));
  await t.game.pause();
  await dismissRotateHint(t);
}

/** An explicit off survives a reload (the default does not override it); on again, which survives too. */
async function persists(t: PlaytestContext): Promise<void> {
  await reload(t);
  t.check('an explicit kid mode off is kept after a reload', !(await t.game.state()).kidMode, await storedKidMode(t));
  await openMenu(t);
  await tap(t, (await layout(t)).menu.toggle);
  await closeMenu(t);
  await reload(t);
  t.check('kid mode (on) is loaded after a reload', (await t.game.state()).kidMode);
}

async function kidRun(t: PlaytestContext): Promise<void> {
  const { game } = t;
  await game.seed(3);
  await game.startRun();
  await game.setSpeed(110);
  await game.step(20);
  await t.page.evaluate(() => window.__gameplay!.clear());
  const l = await layout(t);
  await checkTapSizes(t, 'HUD buttons', [l.hud.pause, l.hud.mute, ...(l.hud.fullscreen ? [l.hud.fullscreen] : [])]);
  await t.page.evaluate((x) => window.__gameplay!.place('joint', x), PLAYER_X + 70);
  await game.step(10);
  await t.canvasShot('kid mode gum ahead');
  const since = (await game.state()).frame;
  await stepWhile(t, (s) => s.chillTimer <= 0, { max: 240 });
  await game.step(4);
  await t.canvasShot('kid mode gum pickup');
  await game.step(50);
  await t.canvasShot('kid mode pink tint and gum icon');
  await game.setZone(2);
  await game.step(10);
  await t.canvasShot('kid mode pink tint cannstatt');
  await t.screenshot('kid mode run page');
  t.check('the gum works like the joint (chillStart)', (await game.eventsSince(since, 'chillStart')).length === 1);
  await game.setSpeed(null);
}

export default async function settingsScenario(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await dismissRotateHint(t);
  await titleAndLongPress(t);
  await toggleKidMode(t);
  await persists(t);
  await kidRun(t);
}
