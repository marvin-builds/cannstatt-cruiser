/**
 * Skater showcase: pose lineup of every animation step (normal and chill),
 * plus in-game shots of ride, push, hold-jump apex, grind (simulated through
 * the player contract), jump off the rail and the crash with recovery; then
 * the chill look (joint pickup) riding, ducking, in the air and grinding, and
 * 1x crops of the skater to judge the hair and the chill look at game scale.
 *   npm run playtest -- --scenario scripts/scenarios/skater.ts --viewports desktop,phone-landscape,phone-portrait --name skater
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PLAYER_X } from '../../src/core/config';
import type {} from '../../src/gameplay/debug'; // window.__gameplay
import type {} from '../../src/player/debug'; // window.__player
import type { GameState } from '../../src/types';
import type { PlaytestContext } from '../playtest-lib';

/** Steps until `done(state)` holds (at most `max` ticks); returns the last state. */
async function stepUntil(t: PlaytestContext, done: (s: GameState) => boolean, max = 240): Promise<GameState> {
  let s = await t.game.state();
  for (let i = 0; i < max && !done(s); i++) s = await t.game.step(1);
  return s;
}

async function writeDataUrl(t: PlaytestContext, name: string, dataUrl: string): Promise<void> {
  await writeFile(join(t.outDir, name), Buffer.from(dataUrl.split(',')[1]!, 'base64'));
}

/**
 * Saves the 64x64 view pixels around the skater twice: at 1x (true game
 * scale) and upscaled `zoom`x without smoothing (same pixels, easier to read).
 */
async function skaterCrop(t: PlaytestContext, name: string, zoom = 4): Promise<void> {
  const { player } = await t.game.state();
  const area = { x: PLAYER_X - 28, y: Math.round(player.y) - 54, w: 64, h: 64 };
  const [one, big] = await t.page.evaluate(
    async ({ area, zoom }) => {
      const img = new Image();
      img.src = window.__game!.capture(1);
      await img.decode();
      return [1, zoom].map((z) => {
        const c = document.createElement('canvas');
        c.width = area.w * z;
        c.height = area.h * z;
        const g = c.getContext('2d')!;
        g.imageSmoothingEnabled = false;
        g.drawImage(img, area.x, area.y, area.w, area.h, 0, 0, c.width, c.height);
        return c.toDataURL('image/png');
      });
    },
    { area, zoom },
  );
  await writeDataUrl(t, `${name}-1x.png`, one!);
  await writeDataUrl(t, `${name}-1x-pixels-zoom${zoom}.png`, big!);
}

export default async function skater(t: PlaytestContext): Promise<void> {
  const { game, page } = t;

  await writeDataUrl(t, '00-pose-lineup.png', await page.evaluate(() => window.__player!.lineup(6)));
  await writeDataUrl(t, '00-pose-lineup-chill.png', await page.evaluate(() => window.__player!.lineup(6, true)));

  await game.pause();
  const { viewWidth, touch, portrait } = await game.display();
  if (touch && portrait) {
    // The rotate hint pauses a run until a tap dismisses it (see ui.ts).
    await t.realTapView(Math.floor(viewWidth / 2), 90);
    await game.step(2);
  }
  await game.seed(5);
  await game.startRun();
  await game.step(20);
  await t.canvasShot('push');
  const moving = await stepUntil(t, (s) => s.player.state === 'ride');
  await game.step(20);
  await t.canvasShot('ride (world moving)');
  t.check('run is playing and the world moves', moving.mode === 'playing' && moving.distance > 0, {
    mode: moving.mode,
    distance: moving.distance,
  });
  // Freeze an empty world: no obstacle can crash the skater during the pose shots.
  await page.evaluate(() => window.__gameplay!.clear());
  await game.setSpeed(0);
  await stepUntil(t, (s) => s.player.state === 'ride');
  await game.step(10);
  await t.canvasShot('ride');
  await t.canvasShot('ride 1x', 1);
  await t.canvasShot('ride 2x', 2);
  await skaterCrop(t, 'crop-hair-ride');

  const tap = await game.jumpApex(2);
  await game.step(30);
  const hold = await game.jumpApex(60);
  t.check('hold apex >= 2.5x tap apex', hold >= tap * 2.5, { tap, hold });
  await game.step(30);

  await game.press();
  await game.step(1);
  await stepUntil(t, (s) => s.player.vy >= 0);
  await t.canvasShot('hold jump apex');
  await t.screenshot('hold jump apex');
  await game.release();
  await stepUntil(t, (s) => s.player.grounded);
  await game.step(2);
  await t.canvasShot('land');
  await game.step(30);

  const railId = await page.evaluate(() => window.__player!.grind(26));
  const grinding = await game.step(20);
  t.check('grind via contract', grinding.player.grinding && grinding.player.state === 'grind', grinding.player);
  await t.canvasShot('grind');
  await t.screenshot('grind');
  await game.press();
  const off = await game.step(12);
  t.check('jump off the rail', !off.player.grinding && off.player.y < grinding.player.y, off.player);
  await t.canvasShot('jump off rail');
  await game.release();
  await page.evaluate((id) => window.__player!.removeRail(id), railId);
  await stepUntil(t, (s) => s.player.grounded);
  await game.step(40);

  await page.evaluate(() => window.__player!.crash());
  const frames: [number, string][] = [
    [6, 'crash thrown'],
    [12, 'crash tumble'],
    [18, 'crash lying'],
    [16, 'crash getting up'],
    [12, 'crash back on board'],
  ];
  for (const [ticks, label] of frames) {
    const s = await game.step(ticks);
    await t.log(label, { anim: s.player.state, invulnerable: s.player.invulnerableTimer });
    await t.canvasShot(label);
  }
  await t.screenshot('after crash');
  const recovered = await stepUntil(t, (s) => s.player.invulnerableTimer === 0, 120);
  t.check('crash recovers and invulnerability ends', recovered.player.state !== 'crash', recovered.player);

  await chillShots(t);
}

/** The chill look (state.chillTimer > 0) in every situation, and the lower chill jump. */
async function chillShots(t: PlaytestContext): Promise<void> {
  const { game, page } = t;
  await game.step(20);
  const normalHold = await game.jumpApex(60);
  await game.step(20);
  await page.evaluate(() => window.__player!.chill(60));
  const chillHold = await game.jumpApex(60);
  t.check('chill full-hold jump is lower', chillHold < normalHold, { normalHold, chillHold });
  await game.step(20);
  await t.canvasShot('chill push');
  await skaterCrop(t, 'crop-chill-push');
  await stepUntil(t, (s) => s.player.state === 'ride');
  await game.step(8);
  await t.canvasShot('chill ride');
  await t.canvasShot('chill ride 1x', 1);
  await skaterCrop(t, 'crop-chill-ride');

  await page.evaluate(() => window.__game!.input.duck.press());
  await game.step(10);
  await t.canvasShot('chill duck');
  await skaterCrop(t, 'crop-chill-duck');
  await page.evaluate(() => window.__game!.input.duck.release());
  await game.step(4);

  await game.press();
  await game.step(1);
  await stepUntil(t, (s) => s.player.vy >= 0);
  await t.canvasShot('chill air apex');
  await skaterCrop(t, 'crop-chill-air');
  await game.release();
  await stepUntil(t, (s) => s.player.grounded);
  await game.step(20);

  const railId = await page.evaluate(() => window.__player!.grind(26));
  const grinding = await game.step(20);
  t.check('chill grind', grinding.player.grinding && grinding.chillTimer > 0, grinding.player);
  await t.canvasShot('chill grind');
  await skaterCrop(t, 'crop-chill-grind');
  await page.evaluate((id) => window.__player!.removeRail(id), railId);
  await stepUntil(t, (s) => s.player.grounded);
  await game.step(10);

  await page.evaluate(() => window.__player!.crash());
  await game.step(14);
  await t.canvasShot('chill crash (joint dropped)');
}
