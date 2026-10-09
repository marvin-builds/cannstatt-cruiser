/**
 * Final playtest, persona: experienced desktop keyboard player. Drives every
 * input through real key events (Space/ArrowUp jump, ArrowDown/S duck, P/Esc
 * pause, M mute, K hidden settings) on the frozen clock, with a HumanBot or
 * SolverBot choosing when to press.
 *   npm run playtest -- --scenario scripts/scenarios/final-keyboard.ts --viewports desktop,laptop --name final-keyboard
 */
import { PLAYER_X } from '../../src/core/config';
import { Rng } from '../../src/core/rng';
import type { PlaceableKind } from '../../src/gameplay/debug';
import { TOP_SPEED } from '../../src/gameplay/difficulty';
import { HumanBot, planStomp, SolverBot } from '../../src/gameplay/testing';
import type { GameState } from '../../src/types';
import type { PlaytestContext } from '../playtest-lib';

type Bot = { next(s: GameState): 'press' | 'release' | null; duck(s: GameState): boolean };

function place(t: PlaytestContext, kind: PlaceableKind, x: number, variant = 0, prop = 0): Promise<number> {
  return t.page.evaluate(
    ([k, px, v, p]) => window.__gameplay!.place(k as PlaceableKind, px as number, v as number, p as number),
    [kind, x, variant, prop] as const,
  );
}

const near = (s: GameState) =>
  s.entities
    .filter((e) => Math.abs(e.x - PLAYER_X) < 140)
    .map((e) => `${e.kind}@${Math.round(e.x - PLAYER_X)}${e.done ? '(done)' : ''}`);

/** Rides with real keys until game over or `maxTicks`; screenshots every `shotEvery` ticks and on crash / zone change. */
async function ride(t: PlaytestContext, bot: Bot, label: string, maxTicks: number, shotEvery = 1800, jumpKey = 'Space', duckKey = 'ArrowDown') {
  const kb = t.page.keyboard;
  let s = await t.game.state();
  let ducking = false;
  let lastHealth = s.health;
  let lastZone = s.zoneIndex;
  const crashes: unknown[] = [];
  const timeline: unknown[] = [];
  let crashShots = 0;
  for (let i = 0; i < maxTicks && s.mode === 'playing'; i++) {
    const move = bot.next(s);
    if (move === 'press') await kb.down(jumpKey);
    if (move === 'release') await kb.up(jumpKey);
    const d = bot.duck(s);
    if (d && !ducking) await kb.down(duckKey);
    if (!d && ducking) await kb.up(duckKey);
    ducking = d;
    s = await t.game.step(1);
    if (s.health < lastHealth) {
      crashes.push({ t: Math.round(s.time * 10) / 10, speed: Math.round(s.speed), zone: s.zoneIndex, near: near(s), health: s.health });
      if (crashShots++ < 4) await t.canvasShot(`${label} crash ${crashShots}`);
    }
    lastHealth = s.health;
    if (s.zoneIndex !== lastZone) {
      lastZone = s.zoneIndex;
      await t.canvasShot(`${label} zone ${s.zoneIndex} t${Math.round(s.time)}`);
      s = await t.game.step(40);
      await t.canvasShot(`${label} zone ${s.zoneIndex} banner`);
    }
    if (i % shotEvery === shotEvery - 1) {
      await t.canvasShot(`${label} t${Math.round(s.time)}`);
      timeline.push({ t: Math.round(s.time), speed: Math.round(s.speed), dist: Math.round(s.distance), score: s.score, zone: s.zoneIndex, health: s.health, stars: s.stars });
    }
  }
  await kb.up(jumpKey);
  await kb.up(duckKey);
  await t.log(`${label} end`, { crashes, timeline });
  return { s, crashes, timeline };
}

export default async function (t: PlaytestContext) {
  const { game } = t;
  const kb = t.page.keyboard;
  await game.pause();
  // A keyboard persona: phones (touch viewports) have no keyboard, and in portrait the rotate hint holds every run paused.
  if (t.viewport.touch) {
    await t.log('skipped: keyboard persona on a touch viewport', { viewport: t.viewport });
    return;
  }
  t.check('a fresh player starts in kid mode (no stored choice)', (await game.state()).kidMode);
  await t.canvasShot('title');
  await t.screenshot('title page');

  // Real Space on the title starts.
  await game.seed(11);
  await kb.down('Space');
  await game.step(2);
  await kb.up('Space');
  await game.step(30);
  let s = await game.state();
  t.check('space starts a run', s.mode === 'playing', s.mode);

  // Tap vs hold with real keys.
  const apex = async (key: string, frames: number) => {
    const g0 = (await game.state()).player.y;
    let min = g0;
    await kb.down(key);
    for (let i = 0; i < 120; i++) {
      if (i === frames) await kb.up(key);
      const x = await game.step(1);
      min = Math.min(min, x.player.y);
      if (i > frames && x.player.grounded) break;
    }
    await kb.up(key);
    return g0 - min;
  };
  await t.page.evaluate(() => window.__gameplay!.clear());
  const tapA = await apex('Space', 2);
  const midA = await apex('ArrowUp', 10);
  const holdA = await apex('KeyW', 40);
  await t.log('apex', { tapA, midA, holdA });
  t.check('hold jumps higher than tap', holdA > tapA, { tapA, midA, holdA });

  // Pause (P), screenshot, Esc resume? then mute M.
  await kb.press('KeyP');
  await game.step(5);
  s = await game.state();
  await t.canvasShot('paused with P');
  t.check('P pauses', s.mode === 'paused', s.mode);
  await kb.press('Space');
  await game.step(5);
  await t.log('after space in pause', { mode: (await game.state()).mode });
  if ((await game.state()).mode === 'paused') {
    await kb.press('Escape');
    await game.step(5);
  }
  t.check('Esc/Space resumes', (await game.state()).mode === 'playing', (await game.state()).mode);
  await kb.press('Escape');
  await game.step(3);
  t.check('Esc pauses', (await game.state()).mode === 'paused');
  await kb.press('KeyP');
  await game.step(3);
  await kb.press('KeyM');
  await game.step(3);
  s = await game.state();
  await t.canvasShot('muted hud');
  t.check('M mutes', s.muted, s.muted);
  await kb.press('KeyM');
  await game.step(3);

  // Run 1: sloppy human from a fresh start until game over (max 5 min).
  await game.endRun();
  await game.step(60);
  await game.seed(21);
  await game.startRun();
  const r1 = await ride(t, new HumanBot(new Rng(5)), 'run1 human', 5 * 3600);
  await game.step(30);
  await t.canvasShot('run1 game over');
  await t.screenshot('run1 game over page');
  const score1 = r1.s.score;

  // Immediate restart attempt (should be ignored), then later.
  await kb.press('Space');
  await game.step(2);
  t.check('restart tap ignored right after game over', (await game.state()).mode === 'gameover', (await game.state()).mode);
  await game.step(60);
  await t.canvasShot('run1 game over later');
  await game.seed(22);
  await kb.press('Space');
  await game.step(5);
  t.check('space restarts after delay', (await game.state()).mode === 'playing');

  // Run 2: careful expert, 6 minutes, reaching top speed and all zones; use S and ArrowUp keys.
  const r2 = await ride(t, new SolverBot(), 'run2 expert', 6 * 3600, 1800, 'ArrowUp', 'KeyS');
  await t.log('run2', { score: r2.s.score, speed: r2.s.speed, mode: r2.s.mode });
  if (r2.s.mode === 'playing') {
    await game.endRun();
  }
  await game.step(30);
  await t.canvasShot('run2 game over');
  t.check('highscore kept', true, { score1, score2: r2.s.score });

  // Run 3: human at top speed (pinned) for 2 minutes, to judge fairness at max.
  await game.step(60);
  await game.seed(33);
  await game.startRun();
  await game.setSpeed(TOP_SPEED);
  const r3 = await ride(t, new HumanBot(new Rng(9), true), 'run3 top speed human', 2 * 3600, 1200);
  await game.setSpeed(null);
  if (r3.s.mode === 'playing') await game.endRun();
  await game.step(30);
  await t.canvasShot('run3 game over');

  // Specials: stomp, bubble gum (kid mode is the default), overhead duck, rail grind in zone 1 at real speed.
  await game.step(60);
  await game.seed(3);
  await game.startRun();
  await game.setSpeed(120);
  await game.setZone(1);
  await game.step(20);
  await t.page.evaluate(() => window.__gameplay!.clear());
  await place(t, 'vfbFan', PLAYER_X + 130, 0, 0);
  const plan = planStomp(await game.state(), true);
  if (plan) {
    await game.step(plan.tick);
    await kb.down('Space');
    await game.step(plan.hold);
    await kb.up('Space');
    for (let i = 0; i < 60; i++) {
      s = await game.step(1);
      if (i === 30) await t.canvasShot('stomp fan mid');
    }
    await t.canvasShot('stomp fan after');
    const ev = await game.events('stomp');
    t.check('stomp happened', ev.length > 0);
  }
  await t.page.evaluate(() => window.__gameplay!.clear());
  await place(t, 'joint', PLAYER_X + 80);
  await game.step(50);
  await t.canvasShot('gum pickup');
  await game.step(120);
  await t.canvasShot('kid chill running');
  await t.page.evaluate(() => window.__gameplay!.clear());
  for (const kind of ['banner', 'bench', 'stopSign'] as PlaceableKind[]) {
    await t.page.evaluate(() => window.__gameplay!.clear());
    try {
      await place(t, kind, PLAYER_X + 120);
    } catch (e) {
      await t.log(`place ${kind} failed`, String(e));
      continue;
    }
    const bot = new SolverBot(true);
    let shot = false;
    for (let i = 0; i < 200; i++) {
      s = await game.state();
      const m = bot.next(s);
      if (m === 'press') await kb.down('Space');
      if (m === 'release') await kb.up('Space');
      if (bot.duck(s)) await kb.down('ArrowDown');
      else await kb.up('ArrowDown');
      s = await game.step(1);
      if (!shot && (s.player.grinding || s.player.state === 'duck')) {
        await game.step(3);
        await t.canvasShot(`${kind} interaction`);
        shot = true;
      }
    }
    await kb.up('Space');
    await kb.up('ArrowDown');
    if (!shot) await t.canvasShot(`${kind} no interaction`);
  }
  await game.setSpeed(null);
  await game.endRun();
  await game.step(60);

  // Hidden settings via K held on title (kid mode is on by default).
  await kb.press('Escape');
  await game.step(10);
  await t.canvasShot('title after escape');
  await kb.down('KeyK');
  await game.step(185);
  await kb.up('KeyK');
  await game.step(2);
  await t.canvasShot('settings menu');
  await t.log('settings', await t.page.evaluate(() => (window as unknown as { __ui: { settings(): unknown } }).__ui.settings()));

  // Enter toggles kid mode off, Esc closes, adult run with the joint, then K again: Enter turns it on at once.
  await kb.press('Enter');
  await game.step(3);
  await t.canvasShot('kid mode off');
  t.check('Enter turns kid mode off at once', !(await game.state()).kidMode);
  await kb.press('Escape');
  await game.step(3);
  await t.canvasShot('title adult mode');
  await game.seed(5);
  await kb.press('Space');
  await game.step(30);
  await game.setZone(2);
  await game.step(10);
  await t.page.evaluate(() => window.__gameplay!.clear());
  await place(t, 'joint', PLAYER_X + 60);
  await place(t, 'wasenGuest', PLAYER_X + 250, 1, 0);
  await game.step(30);
  await t.canvasShot('adult joint and guest');
  await game.step(40);
  await t.canvasShot('adult chill');
  await game.endRun();
  await game.step(80);
  await t.canvasShot('adult game over');
  await kb.press('Escape');
  await game.step(5);
  await kb.down('KeyK');
  await game.step(185);
  await kb.up('KeyK');
  await game.step(2);
  await kb.press('Enter');
  await game.step(3);
  const st = await t.page.evaluate(() => (window as unknown as { __ui: { settings(): { screen: string } } }).__ui.settings());
  await t.canvasShot('kid mode on again');
  await t.log('settings after Enter', st);
  t.check('Enter turns kid mode on again at once', (await game.state()).kidMode);
  // Highscore survives a reload.
  const hsBefore = await t.page.evaluate(() => JSON.stringify(localStorage));
  await t.page.reload();
  await t.page.waitForFunction(() => !!window.__game);
  await t.game.pause();
  await t.game.step(5);
  await t.canvasShot('title after reload');
  await t.log('storage', hsBefore);
}
