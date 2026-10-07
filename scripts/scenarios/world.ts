/**
 * World slice showcase: every zone after its crossfade, one mid-crossfade
 * frame, the Neckar bridge with its tram crossing (both ends), a later stretch
 * of each zone, and a natural distance-driven zone change.
 *   npm run playtest -- --scenario scripts/scenarios/world.ts --viewports desktop,phone-landscape --name world
 */
import type { PlaytestContext } from '../playtest-lib';

const ZONES = ['mitte', 'neckar', 'cannstatt'];
/** Ticks for a full crossfade (2 s) plus a margin. */
const SETTLE = 150;

export default async function world(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await t.game.seed(7);
  await t.game.startRun();
  await t.game.step(SETTLE);
  await t.canvasShot('zone 0 mitte');

  for (let zone = 1; zone < 3; zone++) {
    const since = (await t.game.state()).frame;
    await t.game.setZone(zone);
    if (zone === 1) {
      await t.game.step(60);
      await t.canvasShot('transition mitte to neckar');
      await t.game.step(SETTLE - 60);
    } else {
      await t.game.step(SETTLE);
    }
    const events = await t.game.eventsSince(since, 'zoneChanged');
    t.check(`setZone(${zone}) emits zoneChanged`, events.length === 1, events);
    await t.canvasShot(`zone ${zone} ${ZONES[zone]}`);
    if (zone === 1) await bridgeCrossing(t);
  }

  // Ride on at top speed: scenery keeps varying, then the zone advances by distance.
  await t.game.setSpeed(220);
  await t.game.step(600);
  await t.canvasShot('cannstatt later');
  const start = await t.game.state();
  let state = start;
  for (let i = 0; i < 20 && state.zoneIndex === start.zoneIndex; i++) state = await t.game.step(60);
  await t.log('natural zone change', { from: start.zoneIndex, to: state.zoneIndex });
  t.check('zone advances by distance', state.zoneIndex === (start.zoneIndex + 1) % 3, { from: start.zoneIndex, to: state.zoneIndex });
  await t.game.step(60);
  await t.canvasShot('natural transition to mitte');
  await t.game.step(600);
  await t.canvasShot('mitte later');
  await t.game.setSpeed(null);
}

/** Slow ride past the Neckar bridge: the tram leaves one grove, crosses and enters the other. */
async function bridgeCrossing(t: PlaytestContext): Promise<void> {
  await t.game.setSpeed(40);
  for (let i = 1; i <= 6; i++) {
    await t.game.step(75);
    await t.canvasShot(`neckar bridge ${i}`);
  }
  await t.game.setSpeed(null);
}
