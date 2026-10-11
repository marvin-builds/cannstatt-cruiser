/**
 * Kid mode switch and the hidden settings menu (ROADMAP 43): with nothing
 * stored the game is in adult mode, the title shows a "Kindermodus" button
 * (tap on touch, I on desktop) and the highscore entry offers the free text
 * field; the button turns kid mode on without starting a run, saves it and
 * shows "Kindermodus ist an" naming the way back, closed by OK (tap, Enter);
 * then the title has no button, also after a reload. The title shows no
 * settings button; a 3 s long press on the logo (touch / mouse) or holding K
 * (keyboard) opens "Einstellungen" without starting a run (progress only
 * after ~1 s); kid mode turns off there at once, which brings the title
 * button back; an explicit choice survives a reload; a kid-mode run shows
 * the bubble gum, the pink tint and the gum HUD icon. Also checks that every
 * button's tap area is >= 44 CSS px on touch viewports. The online list is
 * a fake (Playwright route): nothing reaches the live worker.
 *   npm run playtest -- --scenario scripts/scenarios/settings.ts --viewports desktop,phone-landscape,phone-portrait --name settings
 */
import { PLAYER_X } from '../../src/core/config';
import type {} from '../../src/gameplay/debug'; // window.__gameplay
import type { Rect } from '../../src/types';
import type { UiDebugHook } from '../../src/ui/debug';
import { cssPerViewPixel, dismissRotateHint, holdViewWhile, type PlaytestContext, stepWhile } from '../playtest-lib';

type UiWindow = Window & { __ui?: UiDebugHook };

const API = 'https://cannstatt-cruiser-scores.marvinmai.workers.dev';

const settings = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.settings());
const layout = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.layout());
const centre = (r: Rect) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });
const kidButton = async (t: PlaytestContext) => (await layout(t)).screen?.kidMode ?? null;
const highscores = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.highscores()!);
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

/** Nothing stored: adult mode, the title's Kindermodus button, and the free-text name entry. */
async function adultDefault(t: PlaytestContext): Promise<void> {
  const { game } = t;
  t.check('adult mode by default, nothing stored', !(await game.state()).kidMode && (await storedKidMode(t)) === null, await storedKidMode(t));
  const button = await kidButton(t);
  t.check('the title shows the Kindermodus button in adult mode', button !== null, button);
  if (button) await checkTapSizes(t, 'Kindermodus button', [button]);
  await game.step(2);
  await t.canvasShot('title adult with kindermodus button');
  await t.screenshot('title page');

  // Game over with a score the (fake, empty) list takes: "Eintragen" opens the entry with the text field.
  await game.seed(3);
  await game.startRun();
  await game.step(60);
  await game.setScore(500);
  await game.endRun();
  await game.step(60);
  if (t.viewport.touch) await tap(t, (await layout(t)).screen!.submit!);
  else {
    await t.page.keyboard.press('KeyE');
    await game.step(1);
  }
  await game.step(1);
  const entry = await highscores(t);
  t.check('adult default: the highscore entry has the free text field', entry.screen === 'entry' && (await t.page.locator('input').isVisible()), entry);
  await t.canvasShot('highscore entry adult default');
  await t.page.keyboard.press('Escape');
  await game.step(1);
  await t.page.keyboard.press('Escape');
  await game.step(2);
  t.check('back on the title after the entry', (await game.state()).mode === 'title', (await game.state()).mode);
}

/** Presses the Kindermodus button the way this device would (tap / I), checks the notice and closes it with OK (tap / Enter). */
async function kidModeButton(t: PlaytestContext, shots: boolean): Promise<void> {
  const { game } = t;
  const button = await kidButton(t);
  if (!button) {
    t.check('Kindermodus button there to press', false);
    return;
  }
  const before = (await game.state()).frame;
  if (t.viewport.touch) await tap(t, button);
  else {
    await t.page.keyboard.press('KeyI');
    await game.step(1);
  }
  const s = await game.state();
  t.check(`Kindermodus ${t.viewport.touch ? 'tap' : 'key I'}: kid mode on and saved, no run`, s.kidMode && (await storedKidMode(t)) === 'true' && s.mode === 'title' && (await game.eventsSince(before, 'runStarted')).length === 0, {
    kidMode: s.kidMode,
    mode: s.mode,
  });
  t.check('the notice shows', (await settings(t)).screen === 'kidNotice', await settings(t));
  const ok = (await layout(t)).kidNoticeOk;
  if (shots) {
    await checkTapSizes(t, 'notice OK', [ok]);
    await t.canvasShot('kid notice');
    await t.screenshot('kid notice page');
  }
  if (t.viewport.touch) await tap(t, ok);
  else {
    await t.page.keyboard.press('Enter');
    await game.step(1);
  }
  const after = await game.state();
  t.check('OK closes the notice, back on the title without the button', (await settings(t)).screen === 'closed' && after.mode === 'title' && (await kidButton(t)) === null, {
    mode: after.mode,
  });
  if (shots) {
    await game.step(2);
    await t.canvasShot('title kid mode no button');
  }
}

async function titleAndLongPress(t: PlaytestContext): Promise<void> {
  const { game } = t;

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

/** In kid mode (from the button): the hidden menu turns it off, which brings the title button back, and on again. */
async function toggleKidMode(t: PlaytestContext): Promise<void> {
  const { game } = t;
  await openMenu(t);
  const l = await layout(t);
  t.check('kid mode on from the button, the menu opens', (await game.state()).kidMode && (await settings(t)).screen === 'menu');
  await t.canvasShot('settings menu kid mode on');
  await t.screenshot('settings menu page');
  await checkTapSizes(t, 'settings menu', [l.menu.toggle, l.menu.back]);

  // Off at once: no question, the menu stays open.
  await tap(t, l.menu.toggle);
  const menu = await settings(t);
  t.check('Kindermodus turns off at once, no question', menu.screen === 'menu' && !(await game.state()).kidMode && (await storedKidMode(t)) === 'false', menu);
  await t.canvasShot('settings menu kid mode off');
  await closeMenu(t);
  t.check('kid mode off: the title button is back', (await kidButton(t)) !== null);
  await game.step(2);
  await t.canvasShot('title button back after the menu');

  // On again at once in the menu, off again for the reload check.
  await openMenu(t);
  await tap(t, l.menu.toggle);
  t.check('Kindermodus turns on at once in the menu', (await game.state()).kidMode && (await storedKidMode(t)) === 'true', await storedKidMode(t));
  await tap(t, l.menu.toggle);
  await closeMenu(t);
}

async function reload(t: PlaytestContext): Promise<void> {
  await t.page.reload();
  await t.page.waitForFunction(() => Boolean(window.__game));
  await t.game.pause();
  await dismissRotateHint(t);
}

/** Kid mode from the button survives a reload (no button); an explicit off does too (button back). */
async function persistsOn(t: PlaytestContext): Promise<void> {
  await reload(t);
  t.check('kid mode (on) is loaded after a reload, no title button', (await t.game.state()).kidMode && (await kidButton(t)) === null);
}

async function persistsOff(t: PlaytestContext): Promise<void> {
  await reload(t);
  t.check('an explicit kid mode off is kept after a reload, with the title button', !(await t.game.state()).kidMode && (await kidButton(t)) !== null, await storedKidMode(t));
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
  // A fake, empty online list: nothing reaches the live worker; a POST would fail the check below.
  let posts = 0;
  await t.page.route(`${API}/**`, (route) => {
    const req = route.request();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (req.method() === 'POST') posts++;
    return req.method() === 'POST' ? route.abort() : route.fulfill({ headers, json: { entries: [] } });
  });
  await reload(t);
  await adultDefault(t);
  await titleAndLongPress(t);
  await closeMenu(t);
  await kidModeButton(t, true);
  await persistsOn(t);
  await toggleKidMode(t);
  await persistsOff(t);
  await kidModeButton(t, false);
  await kidRun(t);
  t.check('no score was posted', posts === 0, posts);
}
