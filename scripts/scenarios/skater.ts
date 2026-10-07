/**
 * Skater showcase: pose lineup of every animation step, plus in-game shots of
 * ride, push, hold-jump apex, grind (simulated through the player contract),
 * jump off the rail and the crash with recovery.
 *   npm run playtest -- --scenario scripts/scenarios/skater.ts --viewports desktop,phone-landscape --name skater
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {} from '../../src/player/debug'; // window.__player
import type { GameState } from '../../src/types';
import type { PlaytestContext } from '../playtest-lib';

/** Steps until `done(state)` holds (at most `max` ticks); returns the last state. */
async function stepUntil(t: PlaytestContext, done: (s: GameState) => boolean, max = 240): Promise<GameState> {
  let s = await t.game.state();
  for (let i = 0; i < max && !done(s); i++) s = await t.game.step(1);
  return s;
}

export default async function skater(t: PlaytestContext): Promise<void> {
  const { game, page } = t;

  const lineup = await page.evaluate(() => window.__player!.lineup(6));
  await writeFile(join(t.outDir, '00-pose-lineup.png'), Buffer.from(lineup.split(',')[1]!, 'base64'));

  await game.pause();
  await game.seed(5);
  await game.startRun();
  await game.step(20);
  await t.canvasShot('push');
  await stepUntil(t, (s) => s.player.state === 'ride');
  await game.step(10);
  await t.canvasShot('ride');

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
}
