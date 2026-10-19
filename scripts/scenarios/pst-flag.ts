/**
 * The PST flag in Bad Cannstatt waits for the second visit of a run (ROADMAP
 * 89): the title and the whole start leg show the plain Fachwerk house, the
 * flag hangs once the route came back (Cannstatt -> Neckar -> Mitte -> Neckar
 * -> Cannstatt). Rides there at a pinned top speed with stepped ticks (no
 * real-time wait) and finds the flag by its green and red pixels in the view
 * buffer (no other art uses these exact colours).
 *   npm run playtest -- --scenario scripts/scenarios/pst-flag.ts --viewports desktop,phone-landscape --name pst-flag
 */
import { START_ZONE } from '../../src/core/config';
import { TOP_SPEED } from '../../src/gameplay/difficulty';
import type {} from '../../src/gameplay/debug'; // window.__gameplay
import { ZoneRoute } from '../../src/world/zones';
import { dismissRotateHint, type PlaytestContext } from '../playtest-lib';

/** Flag colours from world/art/flags.ts (PST_COLORS green and red). */
const FLAG_RGB: ReadonlyArray<readonly [number, number, number]> = [
  [0x2a, 0x9a, 0x4a],
  [0xd8, 0x30, 0x2f],
];
/** A fresh route, as every run starts: leg k begins at boundary(k). */
const ROUTE = new ZoneRoute();
/** The second Bad Cannstatt leg of a run. */
const SECOND_VISIT = 4;
/** Ticks between two flag scans while riding. */
const SCAN_TICKS = 30;
/** Ground distance at which the start leg's plain house stands where the flag would hang. */
const FIRST_VISIT_HOUSE = 1000;

interface FlagScan {
  /** Matching pixels in the view buffer. */
  count: number;
  /** Left-most matching view x, or -1. */
  x: number;
}

export default async function pstFlag(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await t.game.step(5);
  t.check('title shows Bad Cannstatt', (await t.game.state()).zoneIndex === START_ZONE);
  const title = await scan(t);
  t.check('title: no PST flag', title.count === 0, title);
  await t.canvasShot('title no flag');
  await dismissRotateHint(t);
  await t.game.seed(7);
  await t.game.startRun();
  await t.game.setSpeed(TOP_SPEED);

  t.check('route: leg 4 is Bad Cannstatt again', ROUTE.zoneOf(0) === START_ZONE && ROUTE.zoneOf(SECOND_VISIT) === START_ZONE);
  let shotHouse = false;
  const firstVisit = await rideScanning(t, ROUTE.boundary(1), async (distance) => {
    if (shotHouse || distance < FIRST_VISIT_HOUSE) return;
    shotHouse = true;
    await t.canvasShot('first visit plain house');
  });
  t.check('first Cannstatt visit: no PST flag', firstVisit.every((s) => s.count === 0), firstVisit.filter((s) => s.count > 0).slice(0, 3));

  await rideScanning(t, ROUTE.boundary(SECOND_VISIT), async () => undefined);
  let shotFlag = false;
  const secondVisit = await rideScanning(t, ROUTE.boundary(SECOND_VISIT + 1), async (_distance, found) => {
    // Shoot the flag once it is well inside the view.
    if (shotFlag || found.x < 120 || found.x > 220) return;
    shotFlag = true;
    await t.canvasShot('second visit flag');
  });
  const seen = secondVisit.filter((s) => s.count > 0);
  t.check('second Cannstatt visit: the PST flag hangs', seen.length > 0 && shotFlag, { frames: seen.length });
  await t.log('pst flag scans', { firstVisit: firstVisit.length, secondVisit: seen.slice(0, 5) });
  await t.game.setSpeed(null);
}

/**
 * Rides (kept alive, without obstacles or items) until the distance reaches
 * `target`, scanning the view for the flag every SCAN_TICKS ticks; `each`
 * may take a shot.
 */
async function rideScanning(t: PlaytestContext, target: number, each: (distance: number, found: FlagScan) => Promise<void>): Promise<FlagScan[]> {
  const scans: FlagScan[] = [];
  let state = await t.game.state();
  while (state.distance < target) {
    if (state.mode !== 'playing') throw new Error(`rideScanning(${target}): run stopped (mode ${state.mode})`);
    await t.game.setHealth(5);
    // No pickups: the chill effect would tint the flag's colours.
    await t.page.evaluate(() => window.__gameplay!.clear());
    state = await t.game.step(SCAN_TICKS);
    const found = await scan(t);
    scans.push(found);
    await each(state.distance, found);
  }
  return scans;
}

/** Counts the flag's pixels in the view buffer. */
async function scan(t: PlaytestContext): Promise<FlagScan> {
  return t.page.evaluate(async (colours) => {
    const img = new Image();
    img.src = window.__game!.capture(1);
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const { data, width } = g.getImageData(0, 0, c.width, c.height);
    let count = 0;
    let x = -1;
    for (let i = 0; i < data.length; i += 4) {
      if (!colours.some(([r, gr, b]) => data[i] === r && data[i + 1] === gr && data[i + 2] === b)) continue;
      count++;
      const px = (i / 4) % width;
      if (x < 0 || px < x) x = px;
    }
    return { count, x };
  }, FLAG_RGB);
}
