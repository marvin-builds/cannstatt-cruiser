/**
 * Online highscore list (ROADMAP 34) end to end, against a FAKE worker
 * (Playwright route; nothing reaches the live list): the title's trophy
 * opens the "Bestenliste" (scrolling by drag on phones, wheel on desktop),
 * game over offers "Eintragen" only for a top-20 score, name entry and submit
 * show the own entry highlighted, kid mode picks generated nicknames, and
 * offline shows the notes and queues the run (resent once online, desktop).
 *
 *   npm run playtest -- --scenario <this file> --viewports desktop,phone-landscape,phone-portrait --name highscores
 */
import type { Page, Route } from 'playwright';
import type {} from '../../src/player/debug';
import type { Rect } from '../../src/types';
import type { HighscoresDebug, UiDebugHook } from '../../src/ui/debug';
import { dismissRotateHint, Fingers, type PlaytestContext } from '../playtest-lib';

const API = 'https://cannstatt-cruiser-scores.marvinmai.workers.dev';
type UiWindow = Window & { __ui?: UiDebugHook };

interface FakeEntry {
  name: string;
  score: number;
  distance: number;
  date: string;
}

/** A fake worker with a full list (20 runs, 20.000 down to 1.000 points). */
class FakeServer {
  rows: FakeEntry[] = Array.from({ length: 20 }, (_, i) => ({
    name: ['Ada', 'Bob', 'Cleo', 'Dana', 'Emil'][i % 5]! + ` ${i + 1}`,
    score: 20000 - i * 1000,
    distance: 3000 - i * 100,
    date: `2026-10-0${1 + (i % 8)}T10:00:00.000Z`,
  }));
  posts: Record<string, unknown>[] = [];
  gets = 0;

  top() {
    return [...this.rows]
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map((e, i) => ({ rank: i + 1, ...e }));
  }

  async handle(route: Route): Promise<void> {
    const req = route.request();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>;
      this.posts.push(body);
      const row = { name: String(body.name), score: Number(body.score), distance: Number(body.distance), date: new Date().toISOString() };
      this.rows.push(row);
      const entries = this.top();
      const rank = entries.find((e) => e.name === row.name && e.score === row.score)?.rank ?? null;
      return route.fulfill({ headers, json: { ok: true, rank, entries } });
    }
    this.gets++;
    return route.fulfill({ headers, json: { entries: this.top() } });
  }
}

const hs = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.highscores()!) as Promise<HighscoresDebug>;
const menuButtons = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.layout().screen);
const centre = (r: Rect) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

async function tap(t: PlaytestContext, r: Rect): Promise<void> {
  const c = centre(r);
  await t.realTapView(c.x, c.y);
  await t.game.step(1);
}

async function waitFor(t: PlaytestContext, label: string, ok: (h: HighscoresDebug) => boolean, timeout = 8000): Promise<HighscoresDebug> {
  const start = Date.now();
  let h = await hs(t);
  while (!ok(h) && Date.now() - start < timeout) {
    await t.wait(100);
    await t.game.step(1);
    h = await hs(t);
  }
  t.check(label, ok(h), h);
  return h;
}

async function reloadGame(page: Page): Promise<void> {
  await page.reload();
  await page.waitForFunction(() => Boolean(window.__game));
}

/** A run that ends in game over with `score`, ready for input (frozen clock). */
async function crash(t: PlaytestContext, score: number): Promise<void> {
  await t.game.seed(3);
  await t.game.startRun();
  await t.game.step(120);
  await t.game.setScore(score);
  await t.game.endRun();
  await t.game.step(60);
}

/** Types into the name input like a player: desktop has it focused already, a phone taps it first. */
async function typeName(t: PlaytestContext, name: string): Promise<void> {
  if (t.viewport.touch) await tap(t, (await hs(t)).field);
  await t.page.keyboard.press('Control+A');
  await t.page.keyboard.press('Backspace');
  await t.page.keyboard.type(name, { delay: 20 });
  await t.game.step(1);
}

export default async function highscores(t: PlaytestContext): Promise<void> {
  const server = new FakeServer();
  await t.page.route(`${API}/**`, (route) => server.handle(route));
  await reloadGame(t.page);
  await t.game.pause();
  await dismissRotateHint(t);
  const tag = t.viewport.name;

  // Title: the trophy in the button row opens the list.
  await t.game.step(2);
  await t.canvasShot('title with trophy');
  await tap(t, (await hs(t)).trophy);
  t.check('trophy opens the Bestenliste', (await hs(t)).screen === 'list');
  await waitFor(t, 'list loaded from the fake server', (h) => h.topState === 'ready' && h.entries === 20);
  t.check('list GET reached the fake server', server.gets > 0);
  await t.game.step(1);
  await t.canvasShot('bestenliste');
  await t.screenshot('bestenliste page');

  // Scrolling: drag on phones, wheel on desktop.
  const before = await hs(t);
  if (t.viewport.touch) {
    const cdp = await t.page.context().newCDPSession(t.page);
    const fingers = new Fingers(t, cdp);
    const x = Math.floor((await t.game.display()).viewWidth / 2);
    await fingers.down(1, x, 140);
    for (let y = 130; y >= 70; y -= 10) await fingers.move(1, x, y);
    await fingers.up(1);
    await cdp.detach();
  } else {
    const box = await t.page.locator('#game').boundingBox();
    await t.page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    await t.page.mouse.wheel(0, 300);
    await t.wait(100);
  }
  await t.game.step(1);
  const scrolled = await hs(t);
  t.check(`${tag}: list scrolls (${t.viewport.touch ? 'drag' : 'wheel'})`, scrolled.scroll > before.scroll && scrolled.maxScroll > 0, { before: before.scroll, after: scrolled.scroll, max: scrolled.maxScroll });
  t.check('still on the title (no run started by the drag)', (await t.game.state()).mode === 'title');
  await t.canvasShot('bestenliste scrolled');
  await tap(t, scrolled.close);
  t.check('X closes the list', (await hs(t)).screen === 'closed');

  // Game over with a low score: no Eintragen.
  await crash(t, 500);
  const low = await hs(t);
  t.check('low score: no Eintragen', !low.offered && (await menuButtons(t))?.submit === null, low);
  await t.canvasShot('game over low score');

  // Game over with a top-20 score: Eintragen, name entry, submit, highlighted own entry.
  await crash(t, 5000);
  const high = await hs(t);
  const submit = (await menuButtons(t))?.submit;
  t.check('top-20 score: Eintragen offered', high.offered && !!submit, high);
  await t.canvasShot('game over eintragen');
  await t.screenshot('game over eintragen page');
  if (t.viewport.touch) await tap(t, submit!);
  else {
    await t.page.keyboard.press('KeyE');
    await t.game.step(1);
  }
  t.check('Eintragen opens the name entry', (await hs(t)).screen === 'entry');
  await t.canvasShot('name entry empty');
  const name = tag === 'desktop' ? 'Jörg_Ä.ü-ß 7' : tag === 'phone-portrait' ? 'Portrait Paul' : 'Lena Land';
  await typeName(t, name);
  const typed = await hs(t);
  t.check('typed name reaches the entry', typed.name === name, typed);
  t.check('the native input is visible over the field', await t.page.locator('input').isVisible());
  await t.screenshot('name entry typed page');
  await t.canvasShot('name entry typed');
  if (t.viewport.touch) await tap(t, typed.submit);
  else await t.page.keyboard.press('Enter');
  const after = await waitFor(t, 'submit shows the list with the own entry highlighted', (h) => h.screen === 'list' && h.highlight !== null);
  const post = server.posts[server.posts.length - 1] ?? {};
  t.check('POST body: name, integer score, metres and seconds, version and device', post.name === name && post.score === 5000 && Number.isInteger(post.distance) && Number.isInteger(post.duration) && (post.duration as number) >= 1 && typeof post.version === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(String(post.device)), post);
  t.check('input hidden after submit', !(await t.page.locator('input').isVisible()));
  await t.game.step(1);
  await t.canvasShot('bestenliste own entry');
  await t.screenshot('bestenliste own entry page');
  await t.page.keyboard.press('Escape');
  await tap(t, after.close);
  t.check('after the entry: back on game over, no second Eintragen', (await t.game.state()).mode === 'gameover' && !(await hs(t)).offered);
  // A tap elsewhere / Space starts a new run as before.
  if (t.viewport.touch) await t.realTapView(Math.floor((await t.game.display()).viewWidth / 2), 170);
  else await t.page.keyboard.press('Space');
  await t.game.step(2);
  t.check('a new run starts from game over as before', (await t.game.state()).mode === 'playing');

  // Remembered name: one tap ("Als <Name> eintragen").
  await crash(t, 6000);
  if (t.viewport.touch) await tap(t, (await menuButtons(t))!.submit!);
  else await t.page.keyboard.press('KeyE');
  await t.game.step(1);
  t.check('remembered name prefilled', (await hs(t)).name === name);
  await t.canvasShot('name entry remembered');

  // Kid mode: generated nicknames only.
  await t.page.keyboard.press('Escape');
  await t.game.step(1);
  if ((await hs(t)).screen !== 'closed') await tap(t, (await hs(t)).close);
  await t.page.evaluate(() => window.__player!.kidMode(true));
  await crash(t, 7000);
  if (t.viewport.touch) await tap(t, (await menuButtons(t))!.submit!);
  else await t.page.keyboard.press('KeyE');
  await t.game.step(1);
  const kid = await hs(t);
  t.check('kid mode: a generated nickname, no text input', kid.kid && /^\S+ \S+ \d\d$/.test(kid.name) && !(await t.page.locator('input').isVisible()), kid);
  await t.canvasShot('kid name entry');
  await tap(t, kid.reroll!);
  t.check('kid mode: Neuer Name rerolls', (await hs(t)).name !== kid.name);
  await t.canvasShot('kid name entry rerolled');
  await t.page.evaluate(() => window.__player!.kidMode(false));
  await tap(t, (await hs(t)).close);

  // Offline: the list shows the note, an entry is queued.
  await t.page.context().setOffline(true);
  await t.page.keyboard.press('Escape');
  await t.game.step(2);
  if ((await t.game.state()).mode !== 'title') await tap(t, (await menuButtons(t))!.toTitle!);
  await t.game.step(2);
  await tap(t, (await hs(t)).trophy);
  await waitFor(t, 'offline: list shows the offline note', (h) => h.screen === 'list' && h.topState === 'offline');
  await t.canvasShot('bestenliste offline');
  await tap(t, (await hs(t)).close);
  await crash(t, 8000);
  t.check('offline: Eintragen still offered', (await hs(t)).offered);
  if (t.viewport.touch) await tap(t, (await menuButtons(t))!.submit!);
  else await t.page.keyboard.press('KeyE');
  await t.game.step(1);
  const posts = server.posts.length;
  if (t.viewport.touch) await tap(t, (await hs(t)).submit);
  else await t.page.keyboard.press('Enter');
  const queued = await waitFor(t, 'offline: entry queued with the note', (h) => h.screen === 'list' && h.message === 'Wird gesendet, sobald du online bist');
  t.check('offline: nothing was sent', server.posts.length === posts, queued);
  const pending = await t.page.evaluate(() => localStorage.getItem('cannstatt-cruiser:pendingScore'));
  t.check('offline: the run waits in the store', !!pending && JSON.parse(pending).score === 8000, pending);
  await t.game.step(1);
  await t.canvasShot('bestenliste queued offline');

  // Back online: the queue is resent (at most one send per 20 s), desktop only to keep the run short.
  await t.page.context().setOffline(false);
  if (tag === 'desktop') {
    const start = Date.now();
    while (server.posts.length === posts && Date.now() - start < 25000) await t.wait(500);
    t.check('online again: the queued run is sent', server.posts.length === posts + 1 && server.posts[posts]!.score === 8000, server.posts.length);
    t.check('online again: the queue is empty', (await t.page.evaluate(() => localStorage.getItem('cannstatt-cruiser:pendingScore'))) === 'null');
  }
}
