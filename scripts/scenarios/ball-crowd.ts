/**
 * The football at a fan crowd (GitHub issue #11, ROADMAP 90,
 * src/gameplay/ball-knock.ts): a crowd is laid ahead with
 * `window.__gameplay.pattern('fanCrowd', x, seed)`, the skater gets a football
 * (`window.__player.carry`) and throws it (`window.__game.input.use()`) when
 * the first fan is close (KNOCK_MOST fans fall) or far (one falls). Shots at
 * the throw and every few ticks while the fans fall front to back (do the
 * tumbling fans and the "Treffer!" popups read at 1x?), then the human bot
 * crosses what still stands (it starts after REACT_SECONDS, like a player who
 * has to see what fell). Checks per throw: the count, front to back, the rest
 * standing, no crash after it, no beer. The same close throw in kid mode.
 *   npm run playtest -- --scenario scripts/scenarios/ball-crowd.ts --viewports desktop,phone-landscape --name ball-crowd
 */
import { PLAYER_X, TICK_DT } from '../../src/core/config';
import { Rng } from '../../src/core/rng';
import { KNOCK_MOST, REACT_SECONDS } from '../../src/gameplay/ball-knock';
import { CROWD_TEMPLATE, crowdOf, type CrowdTheme } from '../../src/gameplay/crowd';
import { HumanBot } from '../../src/gameplay/testing';
import type {} from '../../src/player/debug'; // window.__player
import type { Entity, GameState } from '../../src/types';
import { adultMode, dismissRotateHint, type PlaytestContext } from '../playtest-lib';

/** Pinned speed: a crowd never comes before the first minute (~125 px/s and up). */
const SPEED = 150;
const CANNSTATT = 2;
/** Distance of the first fan at the throw (px from the skater): close knocks KNOCK_MOST over, far one. */
const CLOSE = 50;
const FAR = 175;

async function freshRun(t: PlaytestContext, kidMode: boolean): Promise<void> {
  const { game } = t;
  if ((await game.state()).mode === 'playing') await game.endRun();
  await game.seed(3);
  await game.startRun();
  await game.setSpeed(SPEED);
  await game.setZone(CANNSTATT);
  await game.step(20);
  await t.page.evaluate((kid) => {
    window.__gameplay!.clear();
    window.__player!.kidMode(kid);
  }, kidMode);
}

const fansOf = (s: GameState) => s.entities.filter((e) => crowdOf(e) !== null);

/** Lays a crowd of `theme` far ahead (the first seed that gives that theme); returns its fans. */
async function layCrowd(t: PlaytestContext, theme: CrowdTheme): Promise<Entity[]> {
  for (let seed = 1; seed <= 30; seed++) {
    await t.page.evaluate(([name, px, sd]) => window.__gameplay!.pattern(name as string, px as number, sd as number), [CROWD_TEMPLATE, PLAYER_X + 140, seed] as const);
    const fans = fansOf(await t.game.state());
    if (fans.length > 0 && crowdOf(fans[0]!) === theme) return fans;
  }
  throw new Error(`no ${theme} crowd in 30 seeds`);
}

/** Rides on until the first fan is at most `first` px ahead, then throws; shots while the fans fall; then the bot crosses. */
async function throwAt(t: PlaytestContext, theme: CrowdTheme, first: number, kidMode: boolean, label: string, expectFallen: (n: number) => boolean): Promise<void> {
  const { game } = t;
  await freshRun(t, kidMode);
  const fans = await layCrowd(t, theme);
  await t.page.evaluate(() => window.__player!.carry('football'));
  let s = await game.step(1);
  while (s.entities.find((e) => e.id === fans[0]!.id)!.x - s.player.x > first) s = await game.step(1);
  const since = s.frame;
  await t.page.evaluate(() => window.__game!.input.use());
  s = await game.step(1);
  await t.canvasShot(`${label} thrown`);
  let shots = 0;
  for (let i = 0; i < 60 && shots < 4; i++) {
    s = await game.step(1);
    const hits = await game.eventsSince(since, 'ballHit');
    if (hits.length > 0 && (i % 4 === 0 || shots === 0)) await t.canvasShot(`${label} falling ${++shots}`);
  }
  await game.step(10);
  await t.canvasShot(`${label} fallen`);
  const hits = (await game.eventsSince(since, 'ballHit')).map((e) => (e.payload as { entityId: number }).entityId);
  const order = fans.map((f) => f.id);
  t.check(`${label}: ${hits.length} fan(s) fell`, expectFallen(hits.length), hits);
  t.check(`${label}: front to back, the rest still stands`, hits.every((id, i) => id === order[i]), { hits, order });
  // A player needs a moment to see what fell: the bot takes over after REACT_SECONDS.
  const bot = new HumanBot(new Rng(7), true);
  const last = fans[fans.length - 1]!.id;
  for (let i = 0; i < 600; i++) {
    const move = i < Math.round(REACT_SECONDS / TICK_DT) ? null : bot.next(s);
    if (move === 'press') await game.press();
    if (move === 'release') await game.release();
    s = await game.step(1);
    const lastNow = s.entities.find((e) => e.id === last);
    if (s.player.grounded && (!lastNow || lastNow.x + lastNow.w < s.player.hitbox.x)) break;
  }
  await game.release();
  await t.canvasShot(`${label} crossed`);
  const crashes = await game.eventsSince(since, 'crash');
  const caught = await game.eventsSince(since, 'itemCaught');
  await t.log(`${label}: crossed`, { fell: hits.length, crashes: crashes.length, items: caught.map((c) => (c.payload as { item: string }).item) });
  t.check(`${label}: no crash after the hit`, crashes.length === 0, crashes);
  t.check(`${label}: no beer from a crowd`, caught.every((c) => (c.payload as { item: string }).item !== 'beer'), caught);
}

export default async function ballCrowdScenario(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await dismissRotateHint(t);
  await adultMode(t);
  await throwAt(t, 'vfb', CLOSE, false, 'vfb close throw', (n) => n === KNOCK_MOST);
  await throwAt(t, 'vfb', FAR, false, 'vfb far throw', (n) => n >= 1 && n < KNOCK_MOST);
  await throwAt(t, 'wasen', CLOSE, false, 'wasen close throw', (n) => n === KNOCK_MOST);
  await throwAt(t, 'wasen', FAR, false, 'wasen far throw', (n) => n >= 1 && n < KNOCK_MOST);
  await throwAt(t, 'wasen', CLOSE, true, 'kid mode wasen close throw', (n) => n === KNOCK_MOST);
  await t.page.evaluate(() => window.__player!.kidMode(false));
  await t.game.setSpeed(null);
}
