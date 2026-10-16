/**
 * README highlight screenshots (ROADMAP 51): real, seeded game scenes driven
 * through window.__game and the debug hooks, saved as crisp PNGs to
 * docs/screenshots/ (the view buffer upscaled x3 nearest-neighbour, 960x540 on
 * the 16:9 desktop view; the phone shot is the page in CSS pixels, where the
 * canvas sits at an integer 2 CSS px per view pixel). Re-run it after art
 * changes:
 *
 *   npm run playtest -- --scenario scripts/scenarios/readme-shots.ts --viewports desktop,phone-landscape --name readme-shots
 *
 * desktop: title (a sent report whose fake status answer changed, so the
 * feedback icon wears its red dot), the online Bestenliste (the worker faked by a Playwright
 * route with a fixture of local nicknames; nothing reaches the live list), a
 * stomp at the Wasen, a stunt line grind in Stuttgart-Mitte, the NorDIY high
 * five and kid mode. phone-landscape: a jump at the Neckar with the touch
 * HUD. Other viewports take no shots.
 */
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Route } from 'playwright';
import { PLAYER_X } from '../../src/core/config';
import type { PlaceableKind } from '../../src/gameplay/debug';
import { KLATSCH_DELAY } from '../../src/gameplay/klatsch';
import { gapHolds } from '../../src/gameplay/stunt-line';
import { jumpWindow, stepOf, windowMiddle } from '../../src/gameplay/stunt-sim';
import { planStomp } from '../../src/gameplay/testing';
import { SCORES_URL } from '../../src/net/api';
import type { FeedbackStatusEntry } from '../../src/net/feedback-types';
import type {} from '../../src/player/debug';
import type { CarriedItem, Entity, GameState } from '../../src/types';
import type { FeedbackDebug, UiDebugHook } from '../../src/ui/debug';
import { KICKER_HINT_LAUNCHES } from '../../src/ui/kicker-hint';
import { blinkOn } from '../../src/ui/layout';
import { adultMode, captureCanvas, ensureDir, nextKicker, onRamp, type PlaytestContext, stepWhile, tapJump } from '../playtest-lib';

const OUT_DIR = resolve('docs/screenshots');
/** View buffer upscale: 320x180 -> 960x540. */
const SCALE = 3;
/** README budget per image. */
const MAX_BYTES = 400 * 1024;
const SEED = 4;
/** A calm mid-run speed for every scene. */
const SPEED = 110;

/** Zone indices (src/world/zones.ts). */
const MITTE = 0;
const NECKAR = 1;
const CANNSTATT = 2;

/** Shot timing in ticks: after the stomp lands, into the grind trick, after the klatsch, kid-mode scene, into the phone jump. */
const STOMP_SHOT_DELAY = 6;
const GRIND_TRICK_TICKS = 14;
const KLATSCH_SHOT_TICKS = 1;
const KID_SHOT_TICKS = 40;
const PHONE_JUMP_TICKS = 18;
/** The use press when the high fiver's centre is this close ahead (as scripts/scenarios/nordiy.ts). */
const HIGH_FIVE_AHEAD = 4;

/**
 * Run distances whose background shows the landmarks (the parallax depends on
 * the distance only): the Wasen with Riesenrad, beer tents and Fruchtsäule;
 * Fernsehturm and Hauptbahnhof tower in Mitte; the Neckar bridge with the
 * Stadtbahn; the Kursaal by the Wasen tents; the Wasen again for NorDIY.
 */
const AT = { wasenStomp: 170, mitteLine: 1060, neckarBridge: 300, kursaal: 420, parkWasen: 1880 } as const;

/** Kid-safe local nicknames for the faked Bestenliste. */
const NICKNAMES = [
  'Wasen-Wiesel',
  'Neckarblitz',
  'Brezel-Boss',
  'Stäffele-Star',
  'Fernsehturm-Fee',
  'Kursaal-Kid',
  'Riesenrad-Rudi',
  'Mineral-Maxi',
  'Kessel-Kicker',
  'Grabkapelle-Gabi',
  'Fruchtsäule',
  'Stadtbahn-Sam',
];

type UiWindow = Window & { __ui?: UiDebugHook };

/** The fake feedback endpoint (window.__feedbackUrl): only its status lookup answers. */
const FAKE_FEEDBACK = 'https://feedback.example.test';
/** A report this device sent earlier, last seen as open; the fake status answer says it is planned. */
const SENT_REPORT = {
  id: 1, key: '1'.padStart(32, 'a'), day: '2026-10-12', kind: 'idea', text: 'Mehr Brezeln auf der Strecke bitte!', version: '2026-10-11.4',
  platform: 'other', input: 'keys', orientation: 'landscape', viewWidth: 427, log: [],
  status: 'open', reply: null, doneVersion: null, seen: JSON.stringify(['open', null, null]),
};
const SENT_STATUS: FeedbackStatusEntry[] = [{ id: 1, status: 'todo', reply: 'Kommt auf die Liste. Danke!', doneVersion: null }];

/** Saves the view buffer as docs/screenshots/<name>.png and checks its size. */
async function save(t: PlaytestContext, name: string): Promise<void> {
  const file = resolve(OUT_DIR, `${name}.png`);
  await captureCanvas(t.page, file, SCALE);
  await checkSize(t, file);
}

async function checkSize(t: PlaytestContext, file: string): Promise<void> {
  const { size } = await stat(file);
  t.check(`${file}: under ${MAX_BYTES / 1024} KB`, size < MAX_BYTES, { size });
}

/** The fake worker: GET answers the nickname list; nothing is ever posted. */
async function routeFakeWorker(t: PlaytestContext): Promise<void> {
  const entries = NICKNAMES.map((name, i) => ({
    rank: i + 1,
    name,
    score: 48_200 - i * 3_650 - (i % 3) * 170,
    distance: 4_100 - i * 280,
    date: `2026-10-${String(11 - (i % 9)).padStart(2, '0')}T18:00:00.000Z`,
  }));
  await t.page.route(`${SCORES_URL}/**`, async (route: Route) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (route.request().method() !== 'GET') return route.abort();
    return route.fulfill({ headers, json: { entries, own: null } });
  });
}

/** The fake feedback worker: the status lookup answers SENT_STATUS; nothing is ever posted. */
async function routeFakeFeedback(t: PlaytestContext): Promise<void> {
  await t.page.context().addInitScript((url) => ((window as { __feedbackUrl?: string }).__feedbackUrl = url), FAKE_FEEDBACK);
  await t.page.route(`${FAKE_FEEDBACK}/**`, (route: Route) => {
    const headers = { 'Access-Control-Allow-Origin': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (new URL(route.request().url()).pathname === '/feedback/status') return route.fulfill({ status: 200, headers, json: { entries: SENT_STATUS } });
    return route.abort();
  });
}

/**
 * First-time hints a returning player has seen (stored like the ui stores
 * them), so they don't cover the scenes: the air trick, grind trick and item
 * hints and the ramp hint (shown until KICKER_HINT_LAUNCHES launches).
 */
const SEEN_HINTS: Record<string, unknown> = {
  airTrickSeen: true,
  grindTrickSeen: true,
  itemHintSeen: true,
  rampLaunches: KICKER_HINT_LAUNCHES,
  feedbackSent: [SENT_REPORT],
};

/** Reloads as a returning adult-mode player with the fake workers in place, the clock frozen. */
async function returningPlayer(t: PlaytestContext): Promise<void> {
  await routeFakeWorker(t);
  await routeFakeFeedback(t);
  await t.page.evaluate((seen) => {
    for (const [key, value] of Object.entries(seen)) localStorage.setItem(`cannstatt-cruiser:${key}`, JSON.stringify(value));
  }, SEEN_HINTS);
  await t.page.reload();
  await t.page.waitForFunction(() => Boolean(window.__game));
  await t.game.pause();
  await adultMode(t);
}

/** A fresh frozen run in `zone` at the pinned speed, the street cleared. */
async function freshRun(t: PlaytestContext, zone: number): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'paused') await game.resumeGame();
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(SEED);
  await game.startRun();
  await game.setSpeed(SPEED);
  await game.setZone(zone);
  await game.step(1);
  await clearStreet(t);
}

const clearStreet = (t: PlaytestContext) => t.page.evaluate(() => window.__gameplay!.clear());

/** Rides an empty street until run distance `d` (the background then shows the landmark there). */
async function rideTo(t: PlaytestContext, d: number): Promise<void> {
  let s = await t.game.state();
  while (s.distance < d) {
    await clearStreet(t);
    s = await t.game.step(Math.max(1, Math.min(10, Math.ceil((d - s.distance) / stepOf(s.speed)))));
  }
  await clearStreet(t);
}

function place(t: PlaytestContext, kind: PlaceableKind, x: number, variant = 0, prop = 0): Promise<number> {
  return t.page.evaluate(
    ([k, px, v, p]) => window.__gameplay!.place(k as PlaceableKind, px as number, v as number, p as number),
    [kind, x, variant, prop] as const,
  );
}

const setKidMode = (t: PlaytestContext, on: boolean) => t.page.evaluate((v) => window.__player!.kidMode(v), on);
const carry = (t: PlaytestContext, item: CarriedItem) => t.page.evaluate((i) => window.__player!.carry(i), item);

/** The title with a lived-in record (highscore and star total). */
async function titleShot(t: PlaytestContext): Promise<void> {
  await t.page.evaluate(() => (window as UiWindow).__ui!.setRecords(27_450, 386));
  const dot = async () => ((await t.page.evaluate(() => (window as UiWindow).__ui!.feedback())) as FeedbackDebug).dot;
  for (let i = 0; i < 40 && !(await dot()); i++) {
    await t.wait(50);
    await t.game.step(1);
  }
  t.check('title: the feedback icon has its red dot', await dot());
  let s = await t.game.step(30);
  // The start prompt blinks: wait for its on phase.
  for (let i = 0; i < 60 && !blinkOn(s.modeTime); i++) s = await t.game.step(1);
  await save(t, 'title');
}

async function bestenlisteShot(t: PlaytestContext): Promise<void> {
  await t.page.keyboard.press('KeyB');
  await t.game.step(1);
  const ready = async () => (await t.page.evaluate(() => (window as UiWindow).__ui!.highscores()!)).topState === 'ready';
  for (let i = 0; i < 50 && !(await ready()); i++) {
    await t.wait(100);
    await t.game.step(1);
  }
  t.check('the Bestenliste shows the fake list', await ready());
  await t.game.step(10);
  await save(t, 'bestenliste');
  await t.page.keyboard.press('Escape');
  await t.game.step(2);
}

/** A real stomp (planned by planStomp) on a Wasen visitor in front of the Riesenrad. */
async function stompShot(t: PlaytestContext): Promise<void> {
  await freshRun(t, CANNSTATT);
  await rideTo(t, AT.wasenStomp);
  await place(t, 'wasenGuest', PLAYER_X + 130, 1, 1);
  const plan = planStomp(await t.game.state(), true);
  t.check('stomp: a stomp jump exists', plan !== null);
  if (!plan) return;
  await t.game.step(plan.tick);
  await t.game.press();
  await t.game.step(plan.hold);
  await t.game.release();
  await stepWhile(t, (s) => !s.entities.some((e) => typeof e.data?.stompedAt === 'number'), { max: 120 });
  await t.game.step(STOMP_SHOT_DELAY);
  await save(t, 'stomp');
}

/** The ledge the skater grinds and the line's next piece if it is a ledge across a gap. */
function ledgeUnder(s: GameState): { ledge: Entity; next: Entity | undefined } | null {
  const step = (e: Entity) => Number(e.data?.step ?? 0);
  const ledge = s.entities.find((e) => e.kind === 'ledge' && e.y === s.player.y && e.x - 12 <= PLAYER_X && PLAYER_X <= e.x + e.w);
  if (!ledge) return null;
  const next = s.entities.find((e) => e.kind === 'ledge' && e.data?.line === ledge.data?.line && step(e) === step(ledge) + 1);
  return { ledge, next };
}

/**
 * Rides a stunt line like a player until `done(state)`: a jump press on every
 * kicker's ramp, and on a ledge before a gap the jump at the middle of its
 * take-off window (as gameplay's StuntBot).
 */
async function rideLine(t: PlaytestContext, done: (s: GameState) => boolean, max = 60 * 20): Promise<GameState> {
  const pressed = new Set<number>();
  const jumpedFrom = new Set<number>();
  let s = await t.game.state();
  for (let n = 0; !done(s); n++) {
    if (n > max || s.mode !== 'playing') throw new Error(`rideLine: stopped at frame ${s.frame} (mode ${s.mode})`);
    const kicker = nextKicker(s);
    const on = s.player.grinding ? ledgeUnder(s) : null;
    if (kicker && !pressed.has(kicker.id) && onRamp(s, kicker)) {
      pressed.add(kicker.id);
      await tapJump(t, 'hook');
    } else if (on?.next && !jumpedFrom.has(on.ledge.id)) {
      jumpedFrom.add(on.ledge.id);
      const w = jumpWindow(on.ledge, PLAYER_X, stepOf(s.speed), on.next, gapHolds(on.ledge));
      if (w) {
        await t.game.step(windowMiddle(w));
        await t.game.press();
        await t.game.step(w.hold);
        await t.game.release();
      }
    }
    s = await t.game.step(1);
  }
  return s;
}

/** A designed stunt line in Stuttgart-Mitte: the grind trick on its first ledge, Fernsehturm and Hauptbahnhof behind. */
async function stuntShot(t: PlaytestContext): Promise<void> {
  await freshRun(t, MITTE);
  await rideTo(t, AT.mitteLine);
  await t.page.evaluate((x) => window.__gameplay!.stuntLine(x), PLAYER_X + 50);
  const s = await rideLine(t, (x) => x.player.grinding);
  t.check('stunt line: the skater grinds a ledge', s.player.grinding);
  await t.page.evaluate(() => window.__game!.input.duck.press());
  await t.game.step(GRIND_TRICK_TICKS);
  await save(t, 'stunt-line');
  await t.page.evaluate(() => window.__game!.input.duck.release());
}

/** The NorDIY park in front of the Wasen: the high five with its "klatsch" burst. */
async function highFiveShot(t: PlaytestContext): Promise<void> {
  await freshRun(t, CANNSTATT);
  await adultMode(t);
  await rideTo(t, AT.parkWasen);
  await t.page.evaluate(() => window.__gameplay!.park());
  const fiverReached = (s: GameState) => s.entities.some((e) => e.kind === 'highFiver' && e.x + e.w / 2 <= PLAYER_X + HIGH_FIVE_AHEAD);
  const before = await stepWhile(t, (s) => !fiverReached(s), { max: 60 * 10 });
  await t.page.evaluate(() => window.__game!.input.use());
  await t.game.step(KLATSCH_DELAY + KLATSCH_SHOT_TICKS);
  const fives = await t.game.eventsSince(before.frame, 'highFive');
  t.check('NorDIY: the use press gives a high five', fives.length === 1, fives);
  await save(t, 'nordiy-high-five');
}

/** Kid mode at the Kursaal: bubble gum (pink tint, gum timer) and visitors with Lebkuchenherz and Brezel. */
async function kidModeShot(t: PlaytestContext): Promise<void> {
  await freshRun(t, CANNSTATT);
  await rideTo(t, AT.kursaal);
  await setKidMode(t, true);
  await place(t, 'wasenGuest', PLAYER_X + 120, 1, 0);
  await place(t, 'wasenGuest', PLAYER_X + 190, 0, 1);
  await t.page.evaluate(() => window.__player!.chill(6));
  await carry(t, 'gingerbread');
  await t.game.setScore(2_350);
  await t.game.step(KID_SHOT_TICKS);
  await save(t, 'kid-mode');
  await setKidMode(t, false);
}

/** Phone landscape at the Neckar bridge: a jump with the football and the touch HUD (item button). */
async function phoneShot(t: PlaytestContext): Promise<void> {
  await freshRun(t, NECKAR);
  await rideTo(t, AT.neckarBridge);
  await carry(t, 'football');
  await t.game.setScore(1_840);
  await t.game.press();
  await t.game.step(PHONE_JUMP_TICKS);
  const file = resolve(OUT_DIR, 'phone.png');
  await t.page.screenshot({ path: file, scale: 'css' });
  await t.game.release();
  await checkSize(t, file);
}

export default async function readmeShots(t: PlaytestContext): Promise<void> {
  await ensureDir(OUT_DIR);
  if (t.viewport.name === 'desktop') {
    await returningPlayer(t);
    await titleShot(t);
    await bestenlisteShot(t);
    await stompShot(t);
    await stuntShot(t);
    await highFiveShot(t);
    await kidModeShot(t);
  } else if (t.viewport.name === 'phone-landscape') {
    await returningPlayer(t);
    await phoneShot(t);
  } else {
    await t.log(`readme-shots: no shots for viewport ${t.viewport.name} (use desktop,phone-landscape)`);
    return;
  }
  await t.game.setSpeed(null);
}
