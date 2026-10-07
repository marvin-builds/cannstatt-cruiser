/**
 * Example custom scenario: a canvas shot of every zone.
 *   npm run playtest -- --scenario scripts/scenarios/zones.ts --viewports desktop --name zones
 */
import type { PlaytestContext } from '../playtest-lib';

export default async function zones(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await t.game.seed(7);
  await t.game.startRun();
  for (let zone = 0; zone < 3; zone++) {
    await t.game.setZone(zone);
    await t.game.step(60);
    await t.log(`zone ${zone}`);
    await t.canvasShot(`zone ${zone}`);
  }
}
