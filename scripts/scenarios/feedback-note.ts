/**
 * What happened to the player's own feedback (ROADMAP 57) end to end against a
 * FAKE endpoint: the base URL is injected (window.__feedbackUrl) and
 * `GET /feedback/status` is a Playwright route, nothing reaches the live worker
 * and nothing is POSTed. The device keeps two report ids (3 and 5); the title
 * asks for their status once, shows a "done" note, then (statuses changed,
 * notes cleared) a "rejected" note with the operator's reply, each once: OK
 * closes it, a reload shows it no more and asks nothing again the same day.
 * The note covers the title, so no title button, the update card or the
 * install card shows under it; after OK they are back. Kid mode shows no note
 * and asks nothing. Phones also run at a 320 px wide view (landscape 640 x
 * 360, portrait 320 x 640).
 *
 *   npm run playtest -- --scenario scripts/scenarios/feedback-note.ts --viewports desktop,phone-landscape,phone-portrait --name feedback-note
 */
import type { Route } from 'playwright';
import type { FeedbackStatusEntry } from '../../src/net/feedback-types';
import type { Rect } from '../../src/types';
import type { UiDebugHook } from '../../src/ui/debug';
import { adultMode, cssPerViewPixel, dismissRotateHint, type PlaytestContext } from '../playtest-lib';

type UiWindow = Window & { __ui?: UiDebugHook };

const FAKE = 'https://feedback.example.test';
const REPLY = 'Der Schlossgarten passt leider nicht zur Strecke. Danke für die Idee!';
const mid = (r: Rect) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)] as const;

/** Sets what the device keeps (ids, kid mode) and forgets shown notes and the day's check, then reloads to the title. */
async function freshTitle(t: PlaytestContext, { kid = false, cards = false } = {}): Promise<void> {
  await t.page.evaluate((kidMode) => {
    localStorage.setItem('cannstatt-cruiser:feedbackIds', '[3,5]');
    localStorage.removeItem('cannstatt-cruiser:feedbackNotes');
    localStorage.setItem('cannstatt-cruiser:kidMode', String(kidMode));
  }, kid);
  await reloadTitle(t, kid, cards);
}

async function reloadTitle(t: PlaytestContext, kid = false, cards = false): Promise<void> {
  await t.page.reload();
  await t.page.waitForFunction(() => Boolean(window.__game));
  await t.game.pause();
  await dismissRotateHint(t);
  if (!kid) await adultMode(t);
  if (cards) {
    await t.page.evaluate(() => window.__game!.simulateUpdateReady());
    if (t.viewport.touch) await t.game.simulateInstall({ visits: 3, canPrompt: true });
  }
  await t.game.step(3);
}

const note = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.feedbackNote());
const layout = (t: PlaytestContext) => t.page.evaluate(() => (window as UiWindow).__ui!.layout());

/** Steps until the status answer arrived and the note shows (or a few seconds passed). */
async function waitForNote(t: PlaytestContext): Promise<Awaited<ReturnType<typeof note>>> {
  for (let i = 0; i < 40; i++) {
    const n = await note(t);
    if (n) return n;
    await t.wait(50);
    await t.game.step(1);
  }
  return null;
}

/** The note on screen: readable, inside the view, nothing of the title (buttons, cards) under or beside it. */
async function checkNote(t: PlaytestContext, label: string, status: FeedbackStatusEntry['status']): Promise<void> {
  const n = await waitForNote(t);
  t.check(`${label}: the ${status} note shows`, n?.note.status === status, n?.note);
  if (!n) return;
  const { viewWidth, viewHeight } = await t.game.display();
  const { ok, headlineY, linesY, lines, lineH } = n.layout;
  t.check(`${label}: note inside the view`, headlineY >= 0 && ok.x >= 0 && ok.x + ok.w <= viewWidth && ok.y + ok.h <= viewHeight, n.layout);
  t.check(`${label}: OK below the text`, ok.y >= linesY + lines.length * lineH, n.layout);
  t.check(`${label}: no title buttons or cards under the note`, (await layout(t)).screen === null);
  if (t.viewport.touch) {
    const css = await cssPerViewPixel(t.page);
    t.check(`${label}: OK tap area >= 44 CSS px`, Math.min(ok.w, ok.h) * css >= 44, { css, ok });
  }
  await t.canvasShot(`${label} ${status} note`);
}

export default async function feedbackNote(t: PlaytestContext): Promise<void> {
  const { page } = t;
  const asked: string[] = [];
  let posts = 0;
  let rows: FeedbackStatusEntry[] = [];
  await page.context().addInitScript((url) => ((window as { __feedbackUrl?: string }).__feedbackUrl = url), FAKE);
  await page.route(`${FAKE}/**`, async (route: Route) => {
    const req = route.request();
    const headers = { 'Access-Control-Allow-Origin': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (req.method() !== 'GET') {
      posts++;
      return route.abort();
    }
    const url = new URL(req.url());
    asked.push(`${url.pathname}${url.search}`);
    const ids = (url.searchParams.get('ids') ?? '').split(',').map(Number);
    return route.fulfill({ status: 200, headers, json: { entries: rows.filter((r) => ids.includes(r.id)) } });
  });
  const narrow = { 'phone-landscape': { width: 640, height: 360 }, 'phone-portrait': { width: 320, height: 640 } }[t.viewport.name];
  for (const size of narrow ? [null, narrow] : [null]) {
    if (size) await page.setViewportSize(size);
    await reloadTitle(t);
    const { viewWidth } = await t.game.display();
    const label = `${viewWidth}px`;

    // A done report: the note once, with the update and install cards waiting behind it.
    rows = [{ id: 3, status: 'done', reply: null }, { id: 5, status: 'open', reply: null }];
    const before = asked.length;
    await freshTitle(t, { cards: true });
    await checkNote(t, label, 'done');
    t.check(`${label}: asked once, only the kept ids`, asked.length === before + 1 && asked.at(-1) === '/feedback/status?ids=3,5', asked.slice(before));
    await t.realTapView(...mid((await note(t))!.layout.ok));
    await t.game.step(3);
    t.check(`${label}: OK closes the note, the title is back`, (await note(t)) === null && (await t.game.state()).mode === 'title' && (await layout(t)).screen !== null);
    await t.canvasShot(`${label} title after the note`);
    await reloadTitle(t);
    await t.game.step(10);
    t.check(`${label}: no note again after a reload, nothing asked again today`, (await note(t)) === null && asked.length === before + 1, asked.slice(before));

    // A rejected report with the operator's reply (newest first), then the done one is already seen.
    rows = [{ id: 3, status: 'done', reply: null }, { id: 5, status: 'rejected', reply: REPLY }];
    await freshTitle(t);
    await checkNote(t, label, 'rejected');
    const shown = await note(t);
    t.check(`${label}: the reply is on the note`, !!shown?.layout.reply && shown.layout.lines.join(' ').includes('Strecke'), shown?.layout.lines);
    if (!t.viewport.touch) await page.keyboard.press('Enter');
    else await t.realTapView(...mid(shown!.layout.ok));
    await t.game.step(3);
    await checkNote(t, `${label} next`, 'done');
    await t.realTapView(4, 4);
    await t.game.step(3);
    t.check(`${label}: both notes closed`, (await note(t)) === null && (await t.game.state()).mode === 'title');

    // Kid mode: no note, nothing asked.
    const kidBefore = asked.length;
    await freshTitle(t, { kid: true });
    await t.game.step(10);
    await t.wait(300);
    t.check(`${label}: kid mode shows no note and asks nothing`, (await note(t)) === null && asked.length === kidBefore);
  }
  t.check('nothing was POSTed', posts === 0, posts);
}
