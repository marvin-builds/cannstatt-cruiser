/**
 * Online highscore list (ROADMAP 34, 44) end to end, against a FAKE worker
 * (Playwright route; nothing reaches the live list) that keeps one row per
 * device like the real one: the title's trophy opens the "Bestenliste"
 * (scrolling by drag on phones, wheel on desktop), game over offers
 * "Eintragen" only for a top-20 score that beats the device's own entry,
 * name entry and submit show the own entry highlighted (by the server's
 * rank), a higher run replaces the row (one row per device), a stale client
 * gets the "Dein Eintrag bleibt" note, kid mode has no trophy, list or entry
 * (only its own local record, ROADMAP 45), and offline shows the notes and
 * queues the run (resent once online, desktop).
 *
 *   npm run playtest -- --scenario <this file> --viewports desktop,phone-landscape,phone-portrait --name highscores
 */
import type { Page, Route } from 'playwright';
import type {} from '../../src/player/debug';
import type { Rect } from '../../src/types';
import type { HighscoresDebug, UiDebugHook } from '../../src/ui/debug';
import { adultMode, dismissRotateHint, Fingers, type PlaytestContext } from '../playtest-lib';

const API = 'https://cannstatt-cruiser-scores.marvinmai.workers.dev';
type UiWindow = Window & { __ui?: UiDebugHook };

interface FakeEntry {
  device: string;
  name: string;
  score: number;
  distance: number;
  date: string;
}

/** A fake worker with a full list (20 devices, 20.000 down to 1.000 points) and the real contract: one row per device, only a higher score replaces it. */
class FakeServer {
  rows: FakeEntry[] = Array.from({ length: 20 }, (_, i) => ({
    device: `fake-device-${i + 1}`,
    name: ['Ada', 'Bob', 'Cleo', 'Dana', 'Emil'][i % 5]! + ` ${i + 1}`,
    score: 20000 - i * 1000,
    distance: 3000 - i * 100,
    date: `2026-10-0${1 + (i % 8)}T10:00:00.000Z`,
  }));
  posts: Record<string, unknown>[] = [];
  gets = 0;
  /** The device ids the list was asked with. */
  asked: string[] = [];

  top() {
    return [...this.rows]
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(({ name, score, distance, date }, i) => ({ rank: i + 1, name, score, distance, date }));
  }

  row(device: string): FakeEntry | undefined {
    return this.rows.find((r) => r.device === device);
  }

  /** The device's row as `own` (rank within the top 20 or null), null without one. */
  own(device: string) {
    const row = this.row(device);
    if (!row) return null;
    const place = [...this.rows].sort((a, b) => b.score - a.score).indexOf(row);
    return { rank: place < 20 ? place + 1 : null, score: row.score };
  }

  async handle(route: Route): Promise<void> {
    const req = route.request();
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (req.method() === 'POST') {
      const body = req.postDataJSON() as Record<string, unknown>;
      this.posts.push(body);
      const device = String(body.device);
      const run = { device, name: String(body.name), score: Number(body.score), distance: Number(body.distance), date: new Date().toISOString() };
      const old = this.row(device);
      const stored = !old || run.score > old.score;
      if (stored && old) Object.assign(old, run);
      else if (stored) this.rows.push(run);
      const own = this.own(device)!;
      return route.fulfill({ headers, json: { ok: true, stored, rank: own.rank, best: own.score, entries: this.top() } });
    }
    this.gets++;
    const device = new URL(req.url()).searchParams.get('device');
    if (device === null) return route.fulfill({ headers, json: { entries: this.top() } });
    this.asked.push(device);
    return route.fulfill({ headers, json: { entries: this.top(), own: this.own(device) } });
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

/** From game over (or the title) to the title, ready for input. */
async function toTitle(t: PlaytestContext): Promise<void> {
  await t.game.step(2);
  if ((await t.game.state()).mode !== 'title') await tap(t, (await menuButtons(t))!.toTitle!);
  await t.game.step(2);
}

const stored = (t: PlaytestContext, key: string) => t.page.evaluate((k) => localStorage.getItem(`cannstatt-cruiser:${k}`), key);

/** Kid mode from the title: no trophy (B and its spot open nothing), game over shows the kid record and no Eintragen. */
async function kidMode(t: PlaytestContext, server: FakeServer): Promise<void> {
  const title = await hs(t);
  t.check('kid title: no trophy', !title.trophyShown && title.screen === 'closed', title);
  await t.canvasShot('kid title without trophy');
  await t.page.keyboard.press('KeyB');
  await t.game.step(1);
  t.check('kid title: B opens nothing', (await hs(t)).screen === 'closed' && (await t.game.state()).mode === 'title');
  await tap(t, title.trophy);
  t.check('kid title: the trophy spot opens no list', (await hs(t)).screen === 'closed');

  const adultBest = await stored(t, 'highscore');
  const posts = server.posts.length;
  await crash(t, 7000);
  const over = await hs(t);
  t.check('kid game over: no Eintragen', !over.offered && (await menuButtons(t))?.submit === null, over);
  await t.canvasShot('kid game over own record');
  await t.page.keyboard.press('KeyE');
  await t.game.step(1);
  t.check('kid game over: E opens no entry', (await hs(t)).screen === 'closed');
  const pending = await stored(t, 'pendingScore');
  t.check('kid game over: nothing sent or queued', server.posts.length === posts && (pending === null || pending === 'null'), { posts: server.posts.length, pending });
  t.check('kid record stored apart, adult record untouched', (await stored(t, 'kidHighscore')) === '7000' && (await stored(t, 'highscore')) === adultBest, {
    kid: await stored(t, 'kidHighscore'),
    adult: await stored(t, 'highscore'),
  });
  await crash(t, 3000);
  await t.canvasShot('kid game over below own record');
}

export default async function highscores(t: PlaytestContext): Promise<void> {
  const server = new FakeServer();
  await t.page.route(`${API}/**`, (route) => server.handle(route));
  await reloadGame(t.page);
  await t.game.pause();
  await dismissRotateHint(t);
  await adultMode(t); // the free-text name entry is adult mode only; explicit, whatever the default
  const tag = t.viewport.name;

  // Title: the trophy in the button row opens the list.
  await t.game.step(2);
  await t.canvasShot('title with trophy');
  await tap(t, (await hs(t)).trophy);
  t.check('trophy opens the Bestenliste', (await hs(t)).screen === 'list');
  await waitFor(t, 'list loaded from the fake server', (h) => h.topState === 'ready' && h.entries === 20);
  t.check('list GET reached the fake server', server.gets > 0);
  t.check('list GET carries the device id', server.asked.length > 0 && /^[A-Za-z0-9-]{8,64}$/.test(server.asked[0]!), server.asked);
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
  const device = String(post.device);
  t.check('the highlight is the server rank of the own row', after.highlight === server.own(device)?.rank && after.ownBest === 5000, after);
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

  // A lower run (still top-20 worthy) after the own entry: no Eintragen.
  await crash(t, 4000);
  const lower = await waitFor(t, 'lower run: the list with the own best loaded', (h) => h.topState === 'ready' && h.ownBest === 5000);
  t.check('lower run (top-20 worthy): no Eintragen', !lower.offered && (await menuButtons(t))?.submit === null, lower);
  t.check('own best persisted', (await stored(t, 'scoreOwnBest')) === '5000', await stored(t, 'scoreOwnBest'));
  await t.canvasShot('game over below own entry');

  // A higher run: Eintragen again, the remembered name prefilled (one tap), the row is replaced.
  await crash(t, 6000);
  await waitFor(t, 'higher run: Eintragen offered again', (h) => h.offered);
  if (t.viewport.touch) await tap(t, (await menuButtons(t))!.submit!);
  else await t.page.keyboard.press('KeyE');
  await t.game.step(1);
  t.check('remembered name prefilled', (await hs(t)).name === name);
  await t.canvasShot('name entry remembered');
  const newName = `${name} II`;
  await typeName(t, newName);
  if (t.viewport.touch) await tap(t, (await hs(t)).submit);
  else await t.page.keyboard.press('Enter');
  const replaced = await waitFor(t, 'higher run: list with the replaced own entry', (h) => h.screen === 'list' && h.ownBest === 6000 && h.highlight !== null);
  const mine = server.rows.filter((r) => r.device === device);
  t.check('one row for this device with the new score and name', mine.length === 1 && mine[0]!.score === 6000 && mine[0]!.name === newName, mine);
  const shown = server.top().filter((e) => e.name === name || e.name === newName);
  t.check('the list shows only the new row, highlighted', shown.length === 1 && shown[0]!.rank === replaced.highlight && replaced.entries === 20, { shown, replaced });
  await t.game.step(1);
  await t.canvasShot('bestenliste replaced entry');
  await t.page.keyboard.press('Escape');
  await tap(t, replaced.close);

  // A stale client: the server already holds a better run of this device, so it keeps that one.
  await crash(t, 7000);
  await waitFor(t, 'stale: Eintragen offered for a run above the known best', (h) => h.offered && h.topState === 'ready');
  server.row(device)!.score = 9000;
  if (t.viewport.touch) await tap(t, (await menuButtons(t))!.submit!);
  else await t.page.keyboard.press('KeyE');
  await t.game.step(1);
  if (t.viewport.touch) await tap(t, (await hs(t)).submit);
  else await t.page.keyboard.press('Enter');
  const kept = await waitFor(t, 'stale: the kept entry note and the new best', (h) => h.screen === 'list' && h.message === 'Dein Eintrag bleibt: 9.000 Punkte' && h.ownBest === 9000);
  t.check('stale: still one row for this device', server.rows.filter((r) => r.device === device).length === 1 && server.row(device)!.score === 9000, kept);
  await t.game.step(1);
  await t.canvasShot('bestenliste entry kept');
  await t.screenshot('bestenliste entry kept page');
  await tap(t, kept.close);

  // Kid mode (ROADMAP 45): no trophy, no list, no Eintragen; only the local kid record.
  await t.page.keyboard.press('Escape');
  await t.game.step(1);
  if ((await hs(t)).screen !== 'closed') await tap(t, (await hs(t)).close);
  await t.page.evaluate(() => window.__player!.kidMode(true));
  await toTitle(t);
  await kidMode(t, server);
  await t.page.evaluate(() => window.__player!.kidMode(false));
  await toTitle(t);
  const adult = await hs(t);
  t.check('adult mode again: the title shows the trophy', adult.trophyShown, adult);
  await t.canvasShot('adult title trophy back');

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
  t.check('offline: a run below the known best offers nothing', !(await hs(t)).offered);
  await crash(t, 10000);
  t.check('offline: Eintragen still offered above the known best', (await hs(t)).offered);
  if (t.viewport.touch) await tap(t, (await menuButtons(t))!.submit!);
  else await t.page.keyboard.press('KeyE');
  await t.game.step(1);
  const posts = server.posts.length;
  if (t.viewport.touch) await tap(t, (await hs(t)).submit);
  else await t.page.keyboard.press('Enter');
  const queued = await waitFor(t, 'offline: entry queued with the note', (h) => h.screen === 'list' && h.message === 'Wird gesendet, sobald du online bist');
  t.check('offline: nothing was sent', server.posts.length === posts, queued);
  const pending = await t.page.evaluate(() => localStorage.getItem('cannstatt-cruiser:pendingScore'));
  t.check('offline: the run waits in the store', !!pending && JSON.parse(pending).score === 10000, pending);
  await t.game.step(1);
  await t.canvasShot('bestenliste queued offline');

  // Back online: the queue is resent (at most one send per 20 s), desktop only to keep the run short.
  await t.page.context().setOffline(false);
  if (tag === 'desktop') {
    const start = Date.now();
    while (server.posts.length === posts && Date.now() - start < 25000) await t.wait(500);
    t.check('online again: the queued run is sent', server.posts.length === posts + 1 && server.posts[posts]!.score === 10000, server.posts.length);
    t.check('online again: the queue is empty', (await t.page.evaluate(() => localStorage.getItem('cannstatt-cruiser:pendingScore'))) === 'null');
  }
}
