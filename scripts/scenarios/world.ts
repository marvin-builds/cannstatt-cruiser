/**
 * World slice showcase: the title and run start in Bad Cannstatt, the
 * distance-driven route back and forth (Cannstatt -> Neckar -> Mitte -> Neckar
 * -> Cannstatt) as frame sequences around each gateway (the next zone streams
 * in near first, far last; both directions of every crossing), the
 * zoneChanged timing, the Mombachquelle at the Neckar, the Mitte traffic below
 * the riding line, setZone snapping, the Neckar bridge with its tram crossing
 * and the Grabkapelle on its hill in Cannstatt.
 *   npm run playtest -- --scenario scripts/scenarios/world.ts --viewports desktop,phone-landscape --name world
 */
import { MAX_SPEED, START_ZONE } from '../../src/core/config';
import type {} from '../../src/gameplay/debug'; // window.__gameplay
import type {} from '../../src/world/debug'; // window.__world
import { TRAFFIC_TOP } from '../../src/world/traffic';
import { ZONE_LENGTH, ZoneRoute } from '../../src/world/zones';
import { dismissRotateHint, type PlaytestContext } from '../playtest-lib';

const ZONES = ['mitte', 'neckar', 'cannstatt'];
const MITTE = 0;
const NECKAR = 1;
/** A fresh route: leg k is the zone after the k-th gateway, which reaches the player at k * ZONE_LENGTH. */
const ROUTE = new ZoneRoute();
/** Gateways ridden through: one full back-and-forth cycle, so every crossing is seen in both directions. */
const GATEWAYS = 4;
const SPEED = MAX_SPEED;
/** Frames around each gateway, as ground distance relative to it. */
const SEQUENCE = [-650, -350, -120, 0, 250, 600, 1200, 2000];
/** Frame of the sequence that shows the Mombachquelle on the far Neckar bank. */
const MOMBACH_OFFSET = 600;

export default async function world(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await t.game.step(5);
  t.check('title shows Bad Cannstatt', (await t.game.state()).zoneIndex === START_ZONE);
  await t.canvasShot('title background');
  await dismissRotateHint(t);
  await t.game.seed(7);
  await t.game.startRun();
  const start = await t.game.step(30);
  t.check('run starts in Bad Cannstatt', start.zoneIndex === START_ZONE && ROUTE.zoneOf(0) === START_ZONE, start.zoneIndex);
  await t.canvasShot(`zone ${START_ZONE} ${ZONES[START_ZONE]} start`);
  await t.game.setSpeed(SPEED);

  for (let k = 1; k <= GATEWAYS; k++) {
    const gate = k * ZONE_LENGTH;
    const from = ROUTE.zoneOf(k - 1);
    const to = ROUTE.zoneOf(k);
    const name = `${ZONES[from]} to ${ZONES[to]}`;
    const since = (await t.game.state()).frame;
    let state = start;
    for (const offset of SEQUENCE) {
      state = await rideTo(t, gate + offset);
      if (offset === -120) t.check(`${name}: no zone change before the gateway`, state.zoneIndex === from, state.zoneIndex);
      const poi = offset === MOMBACH_OFFSET && to === NECKAR ? ' mombachquelle' : '';
      await t.canvasShot(`${name} ${offset >= 0 ? '+' : ''}${offset}${poi}`);
      if (offset === 1200 && to === MITTE) await mitteTraffic(t);
    }
    t.check(`${name}: zone after the gateway`, state.zoneIndex === to, state.zoneIndex);
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
  await t.game.setZone(NECKAR);
  await bridgeCrossing(t);
  await t.game.setZone(2);
  await t.game.setSpeed(SPEED);
  await rideTo(t, (await t.game.state()).distance + 1500);
  await t.canvasShot('cannstatt grabkapelle');
  await t.game.setSpeed(null);
}

/** Rides at the current speed (kept alive) until the distance reaches `target`; throws if the run stops. */
async function rideTo(t: PlaytestContext, target: number) {
  let state = await t.game.state();
  while (state.distance < target) {
    if (state.mode !== 'playing') throw new Error(`rideTo(${target}): run stopped (mode ${state.mode})`);
    const frames = Math.min(120, Math.max(1, Math.ceil(((target - state.distance) / Math.max(1, state.speed)) * 60)));
    await t.game.setHealth(5);
    state = await t.game.step(frames);
  }
  return state;
}

/**
 * Stuttgart-Mitte: dense foreground traffic that never rises above
 * TRAFFIC_TOP (below the riding line), drawn behind obstacles and people; on
 * desktop also at wider views. Rides on at the current speed afterwards.
 */
async function mitteTraffic(t: PlaytestContext): Promise<void> {
  const speed = (await t.game.state()).speed;
  await t.game.setSpeed(90);
  let maxVehicles = 0;
  let highest = Infinity;
  for (let i = 0; i < 20; i++) {
    await t.game.step(15);
    const traffic = await t.page.evaluate(() => window.__world!.traffic());
    maxVehicles = Math.max(maxVehicles, traffic.vehicles.length);
    for (const v of traffic.vehicles) highest = Math.min(highest, v.y);
    for (const p of traffic.puffs) highest = Math.min(highest, p.y);
  }
  const density = await t.page.evaluate(() => window.__world!.trafficDensity());
  t.check('mitte: dense traffic', maxVehicles >= 5 && density === 1, { maxVehicles, density });
  t.check('mitte: traffic stays below the riding line', highest >= TRAFFIC_TOP, { highest, TRAFFIC_TOP });
  await t.page.evaluate(() => {
    window.__gameplay!.place('bin', 150);
    window.__gameplay!.place('vfbFan', 230);
  });
  await t.game.step(2);
  await t.canvasShot('mitte traffic with obstacles');
  const original = t.page.viewportSize();
  if (t.viewport.name === 'desktop' && original) {
    for (const width of [1536, 1708]) {
      await t.page.setViewportSize({ width, height: original.height });
      await t.wait(300);
      await t.game.step(30);
      const d = await t.game.display();
      await t.canvasShot(`mitte traffic view ${d.viewWidth}`);
    }
    await t.page.setViewportSize(original);
    await t.wait(300);
  }
  await t.page.evaluate(() => window.__gameplay!.clear());
  await t.game.setSpeed(speed);
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
