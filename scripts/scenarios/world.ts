/**
 * World slice showcase: the three distance-driven zone transitions as frame
 * sequences (the next zone streams in near first, far last, through the
 * gateways), the zoneChanged timing, setZone snapping, the Neckar bridge with
 * its tram crossing and the Grabkapelle on its hill in Cannstatt.
 *   npm run playtest -- --scenario scripts/scenarios/world.ts --viewports desktop,phone-landscape --name world
 */
import type { PlaytestContext } from '../playtest-lib';

const ZONES = ['mitte', 'neckar', 'cannstatt'];
/** Must match ZONE_LENGTH in src/world/zones.ts (gateway k reaches the player at k * ZONE_LENGTH). */
const ZONE_LENGTH = 3584;
const SPEED = 220;
/** Frames around each gateway, as ground distance relative to it. */
const SEQUENCE = [-650, -350, -120, 0, 250, 600, 1200, 2000];

export default async function world(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await t.game.seed(7);
  await t.game.startRun();
  await t.game.step(30);
  await t.canvasShot('zone 0 mitte start');
  await t.game.setSpeed(SPEED);

  for (let k = 1; k <= 3; k++) {
    const gate = k * ZONE_LENGTH;
    const name = `${ZONES[(k - 1) % 3]} to ${ZONES[k % 3]}`;
    const since = (await t.game.state()).frame;
    for (const offset of SEQUENCE) {
      const state = await rideTo(t, gate + offset);
      if (offset === -120) t.check(`${name}: no zone change before the gateway`, state.zoneIndex === (k - 1) % 3, state.zoneIndex);
      await t.canvasShot(`${name} ${offset >= 0 ? '+' : ''}${offset}`);
    }
    const events = await t.game.eventsSince(since, 'zoneChanged');
    t.check(`${name}: exactly one zoneChanged`, events.length === 1, events);
    await t.log(`gateway ${name}`, { gate, events });
  }

  // setZone snaps instantly to any zone.
  await t.game.setSpeed(null);
  for (let zone = 0; zone < 3; zone++) {
    await t.game.setZone(zone);
    const state = await t.game.step(2);
    t.check(`setZone(${zone}) snaps`, state.zoneIndex === zone, state.zoneIndex);
    await t.canvasShot(`snap ${ZONES[zone]}`);
  }
  await t.game.setZone(1);
  await bridgeCrossing(t);
  await t.game.setZone(2);
  await t.game.setSpeed(SPEED);
  await rideTo(t, (await t.game.state()).distance + 1500);
  await t.canvasShot('cannstatt grabkapelle');
  await t.game.setSpeed(null);
}

/** Rides at the current speed (kept alive) until the distance reaches `target`. */
async function rideTo(t: PlaytestContext, target: number) {
  let state = await t.game.state();
  while (state.distance < target) {
    const frames = Math.min(120, Math.max(1, Math.ceil(((target - state.distance) / Math.max(1, state.speed)) * 60)));
    await t.game.setHealth(5);
    state = await t.game.step(frames);
  }
  return state;
}

/** Slow ride past the Neckar bridge: the tram leaves one grove, crosses and enters the other. */
async function bridgeCrossing(t: PlaytestContext): Promise<void> {
  await t.game.setSpeed(40);
  for (let i = 1; i <= 4; i++) {
    await t.game.step(75);
    await t.canvasShot(`neckar bridge ${i}`);
  }
  await t.game.setSpeed(null);
}
