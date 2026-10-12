/**
 * Fan crowds (ROADMAP 76, src/gameplay/crowd.ts): a crowd of VfB fans and one
 * of Wasen visitors is laid right ahead in Bad Cannstatt with
 * `window.__gameplay.pattern('fanCrowd', x, seed)` (src/gameplay/debug.ts),
 * shot as an overview (do they read as VfB fans with scarves and a flag, as
 * Wasen visitors with Lebkuchenherzen? one row of heads to bounce on?), then
 * crossed head to head: the human bot (src/gameplay/testing.ts, which plans
 * with stomps when a crowd is ahead) jumps onto the first heads and lets the
 * bounces carry it, with a shot at every stomp and after the landing.
 * Checks per crowd: at least two stomps, no crash, back on the street past
 * the last fan, no beer anywhere. Then the kid mode row (four heads) and a
 * plain jump into a crowd (a crash: one jump never clears it).
 *   npm run playtest -- --scenario scripts/scenarios/fan-crowd.ts --viewports desktop,phone-landscape --name fan-crowd
 */
import { PLAYER_X } from '../../src/core/config';
import { Rng } from '../../src/core/rng';
import { CROWD_HEADS, CROWD_TEMPLATE, crowdOf, type CrowdTheme } from '../../src/gameplay/crowd';
import { HumanBot } from '../../src/gameplay/testing';
import type {} from '../../src/player/debug'; // window.__player
import type { Entity, GameState } from '../../src/types';
import { adultMode, dismissRotateHint, type PlaytestContext } from '../playtest-lib';

/** Pinned speed: a crowd never comes before the first minute (~125 px/s and up). */
const SPEED = 150;
const CANNSTATT = 2;

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

/** Lays a crowd of `theme` with its origin at screen x (the first seed that gives that theme); returns its fans. */
async function layCrowd(t: PlaytestContext, theme: CrowdTheme, x: number): Promise<Entity[]> {
  for (let seed = 1; seed <= 30; seed++) {
    await t.page.evaluate(([name, px, sd]) => window.__gameplay!.pattern(name as string, px as number, sd as number), [CROWD_TEMPLATE, x, seed] as const);
    const fans = fansOf(await t.game.state());
    if (fans.length > 0 && crowdOf(fans[0]!) === theme) return fans;
  }
  throw new Error(`no ${theme} crowd in 30 seeds`);
}

/** An overview with the whole row in view. */
async function overview(t: PlaytestContext, theme: CrowdTheme, kidMode: boolean, label: string): Promise<void> {
  await freshRun(t, kidMode);
  const fans = await layCrowd(t, theme, PLAYER_X - 40);
  await t.game.step(2);
  await t.canvasShot(label);
  const [least, most] = kidMode ? CROWD_HEADS.kid : CROWD_HEADS.adult;
  t.check(`${label}: ${least}-${most} fans of one kind`, fans.length >= least && fans.length <= most && fans.every((f) => crowdOf(f) === theme), fans.map((f) => f.kind));
}

/** The human bot crosses a crowd head to head; shots at every stomp and after the landing. */
async function bounceAcross(t: PlaytestContext, theme: CrowdTheme, label: string): Promise<void> {
  const { game } = t;
  await freshRun(t, false);
  const fans = await layCrowd(t, theme, PLAYER_X);
  const last = fans[fans.length - 1]!;
  const since = (await game.state()).frame;
  const bot = new HumanBot(new Rng(7), true);
  let s = await game.state();
  let stomps = 0;
  for (let i = 0; i < 600; i++) {
    const move = bot.next(s);
    if (move === 'press') await game.press();
    if (move === 'release') await game.release();
    s = await game.step(1);
    const now = (await game.eventsSince(since, 'stomp')).length;
    if (now > stomps) {
      stomps = now;
      await t.canvasShot(`${label} stomp ${stomps}`);
    }
    const lastNow = s.entities.find((e) => e.id === last.id);
    if (s.player.grounded && (!lastNow || lastNow.x + lastNow.w < s.player.hitbox.x)) break;
  }
  await game.release();
  await game.step(6);
  await t.canvasShot(`${label} landed`);
  const crashes = await game.eventsSince(since, 'crash');
  const caught = await game.eventsSince(since, 'itemCaught');
  await t.log(`${label}: crossed`, { stomps, crashes: crashes.length, items: caught.map((c) => (c.payload as { item: string }).item) });
  t.check(`${label}: bounced on at least two heads`, stomps >= 2, { stomps });
  t.check(`${label}: no crash`, crashes.length === 0, crashes);
  t.check(`${label}: no beer from a crowd`, caught.every((c) => (c.payload as { item: string }).item !== 'beer'), caught);
}

/** A plain full jump at the crowd, nothing pressed in the air: it never clears it. */
async function plainJump(t: PlaytestContext): Promise<void> {
  const { game } = t;
  await freshRun(t, false);
  await layCrowd(t, 'vfb', PLAYER_X);
  const since = (await game.state()).frame;
  // Take off so the full jump peaks over the front of the crowd, the best a single jump can do.
  await game.step(30);
  await game.press();
  await game.step(20);
  await game.release();
  for (let i = 0; i < 120 && (await game.eventsSince(since, 'crash')).length === 0; i++) await game.step(1);
  const crashes = await game.eventsSince(since, 'crash');
  const stomps = await game.eventsSince(since, 'stomp');
  await t.canvasShot('plain jump into the crowd');
  t.check('a plain jump never gets across: it crashes, unless the bounces carry it over at least two heads', crashes.length > 0 || stomps.length >= 2, { crashes: crashes.length, stomps: stomps.length });
}

export default async function fanCrowdScenario(t: PlaytestContext): Promise<void> {
  await t.game.pause();
  await dismissRotateHint(t);
  await adultMode(t);
  await overview(t, 'vfb', false, 'vfb crowd');
  await overview(t, 'wasen', false, 'wasen crowd');
  await overview(t, 'wasen', true, 'kid mode wasen crowd');
  await overview(t, 'vfb', true, 'kid mode vfb crowd');
  await bounceAcross(t, 'vfb', 'vfb bounce');
  await bounceAcross(t, 'wasen', 'wasen bounce');
  await plainJump(t);
  await t.page.evaluate(() => window.__player!.kidMode(false));
  await t.game.setSpeed(null);
}
