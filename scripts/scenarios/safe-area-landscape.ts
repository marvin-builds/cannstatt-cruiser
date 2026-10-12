/**
 * Display cutouts in landscape (ROADMAP 75, issue #4): a punch-hole camera at
 * a side edge (Pixel 10 Pro turned to landscape) must not cover a canvas
 * button. Chromium cannot fake env(safe-area-inset-*), so the scenario sets
 * the `--cc-safe-<side>` override (playtest-lib.ts fakeSafeInsets) and core
 * measures it into `display.safeInsets` (src/core/safe-area.ts). A red band
 * marks each faked cutout on the full-page shots (it lets taps through).
 *
 * - Without a cutout: display.safeInsets is 0 on every side.
 * - 40 CSS px left and right: 20 view px on a phone in landscape; on the
 *   title, the running HUD (with the item button) and the pause screen every
 *   button, its tap area and the stats plate lie inside the safe span, and real
 *   taps on them still work (mute, the settings gear, pause). The world stays
 *   full-bleed (no black bars).
 * - A camera on the left only: the left corner moves, the right one stays.
 * - Taken away again: every button is back where it was.
 *
 *   npm run playtest -- --scenario scripts/scenarios/safe-area-landscape.ts --viewports phone-landscape,desktop --name safe-area
 */
import type { Rect, SafeInsets } from '../../src/types';
import type {} from '../../src/ui/debug'; // window.__ui
import { adultMode, type FakeInsets, fakeSafeInsets, type PlaytestContext } from '../playtest-lib';

const CUTOUT = 40;
const centre = (r: Rect) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)] as const;
const layout = (t: PlaytestContext) => t.page.evaluate(() => window.__ui!.layout());

/** Red translucent bands where the fake cutouts are (shots only; pointer-events none). */
async function markCutouts(t: PlaytestContext, insets: FakeInsets): Promise<void> {
  await t.page.evaluate((px) => {
    document.querySelectorAll('[data-fake-cutout]').forEach((el) => el.remove());
    for (const side of ['left', 'right'] as const) {
      const w = px[side];
      if (!w) continue;
      const band = document.createElement('div');
      band.dataset.fakeCutout = side;
      Object.assign(band.style, { position: 'fixed', top: '0', bottom: '0', [side]: '0', width: `${w}px`, background: 'rgba(255, 0, 0, 0.35)', pointerEvents: 'none', zIndex: '9999' });
      document.body.appendChild(band);
    }
  }, insets);
}

async function cutout(t: PlaytestContext, insets: FakeInsets): Promise<SafeInsets> {
  await fakeSafeInsets(t, insets);
  await markCutouts(t, insets);
  return (await t.game.display()).safeInsets;
}

/** Every named rect lies inside the view less the insets. */
function checkInside(t: PlaytestContext, label: string, rects: Record<string, Rect | null | undefined>, insets: SafeInsets, viewWidth: number): void {
  const outside = Object.entries(rects).filter(([, r]) => r && (r.x < insets.left || r.x + r.w > viewWidth - insets.right));
  t.check(`${label}: every button and the stats plate clear of the cutouts`, outside.length === 0, { insets, viewWidth, outside });
}

async function tapView(t: PlaytestContext, r: Rect): Promise<void> {
  const [x, y] = centre(r);
  await t.realTapView(x, y, 60);
  await t.game.step(2);
}

/** The title: buttons inside, a real tap on mute (twice) and on the settings gear. */
async function title(t: PlaytestContext, insets: SafeInsets, label: string): Promise<Record<string, Rect | null>> {
  const { viewWidth } = await t.game.display();
  const l = await layout(t);
  const trophy = await t.page.evaluate(() => {
    const h = window.__ui!.highscores();
    return h?.trophyShown ? h.trophy : null;
  });
  const rects = { mute: l.hud.mute, fullscreen: l.hud.fullscreen, gear: l.screen?.settings ?? null, feedback: l.screen?.feedback ?? null, trophy };
  checkInside(t, label, rects, insets, viewWidth);
  await t.canvasShot(label);
  await t.screenshot(`${label} page`);
  const muted = (await t.game.state()).muted;
  await tapView(t, l.hud.mute);
  const toggled = (await t.game.state()).muted;
  await tapView(t, l.hud.mute);
  t.check(`${label}: a tap on mute toggles the sound, no run starts`, toggled !== muted && (await t.game.state()).muted === muted && (await t.game.state()).mode === 'title');
  if (l.screen?.settings) {
    await tapView(t, l.screen.settings);
    const opened = await t.page.evaluate(() => window.__ui!.settings().screen);
    t.check(`${label}: a tap on the gear opens the settings`, opened === 'menu', opened);
    await tapView(t, (await layout(t)).menu.back);
  }
  return rects;
}

/** A run with an item in hand: the HUD inside, a real tap on pause, the pause screen inside. */
async function hud(t: PlaytestContext, insets: SafeInsets, label: string): Promise<Record<string, Rect | null>> {
  const { game } = t;
  await game.seed(5);
  await game.startRun();
  await game.step(40);
  await t.page.evaluate(() => window.__ui!.carry('pretzel'));
  await game.step(2);
  const { viewWidth, touch } = await game.display();
  const l = await layout(t);
  const rects = { pause: l.hud.pause, mute: l.hud.mute, fullscreen: l.hud.fullscreen, plate: l.plate, item: touch ? l.itemButton : null };
  checkInside(t, label, rects, insets, viewWidth);
  await t.canvasShot(label);
  await t.screenshot(`${label} page`);
  await tapView(t, l.hud.pause);
  t.check(`${label}: a tap on pause pauses`, (await game.state()).mode === 'paused');
  const paused = (await layout(t)).screen;
  checkInside(t, `${label} pause screen`, { toTitle: paused?.toTitle, logo: paused?.logo, feedback: paused?.feedback, plate: (await layout(t)).plate }, insets, viewWidth);
  await t.canvasShot(`${label} paused`);
  await game.resumeGame();
  await game.endRun();
  await game.step(60);
  await t.page.keyboard.press('Escape');
  await game.step(2);
  return rects;
}

export default async function safeAreaScenario(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await adultMode(t);
  await t.game.step(2);
  const none = (await t.game.display()).safeInsets;
  t.check('no cutout: safeInsets are 0 on every side', Object.values(none).every((v) => v === 0), none);
  const before = { title: await title(t, none, 'no cutout title'), hud: await hud(t, none, 'no cutout hud') };

  const both = await cutout(t, { left: CUTOUT, right: CUTOUT });
  if (t.viewport.name === 'phone-landscape') t.check('40 CSS px are 20 view px on each side', both.left === 20 && both.right === 20, both);
  await title(t, both, 'cutouts left and right title');
  await hud(t, both, 'cutouts left and right hud');

  const left = await cutout(t, { left: CUTOUT });
  t.check('left only: no right inset', left.left > 0 && left.right === 0, left);
  await title(t, left, 'cutout left title');
  await hud(t, left, 'cutout left hud');

  const gone = await cutout(t, {});
  t.check('taken away: safeInsets 0 again', Object.values(gone).every((v) => v === 0), gone);
  const after = { title: await title(t, gone, 'cutout removed title'), hud: await hud(t, gone, 'cutout removed hud') };
  t.check('taken away: every button is back where it was', JSON.stringify(after) === JSON.stringify(before), { before, after });
}
