/**
 * "Mein Feedback", the red dot and "Ansehen" (ROADMAP 70) end to end against a
 * FAKE endpoint: the base URL is injected (window.__feedbackUrl) and
 * `POST /feedback` and `POST /feedback/status` are Playwright routes, nothing
 * reaches the live worker. The device keeps five reports (seeded under
 * feedbackSent with their keys); the fake worker answers their status by id
 * and key: one open, one planned, one done with a version and a reply, one not
 * planned with a reply, one left out (shown as "Entfernt").
 *
 * - The title asks once with ids and keys in the POST body (never in the URL)
 *   and the red dot shows on the title icon and the pause menu's "Feedback".
 * - "Neu" shows "Ansehen" beside the log toggle; "Das wird gesendet" lists the
 *   whole message with the recorded error lines (the online list is routed to
 *   a 503, which the game logs); "Senden" posts exactly that
 *   snapshot (with a 32 hex key).
 * - "Mein Feedback" lists every status, newest first, the dot gone after
 *   opening it; a row opens its details (version, reply), "Ansehen" there
 *   shows what was sent; the empty state; kid mode asks nothing and shows no
 *   dot. Phones also run at a 320 px wide view.
 *
 *   npm run playtest -- --scenario scripts/scenarios/feedback-inbox.ts --viewports desktop,phone-landscape,phone-portrait --name feedback-inbox
 */
import type { Route } from 'playwright';
import { SCORES_URL } from '../../src/net/api';
import type { FeedbackStatusEntry } from '../../src/net/feedback-types';
import type { Rect } from '../../src/types';
import type { FeedbackDebug, UiDebugHook } from '../../src/ui/debug';
import { adultMode, dismissRotateHint, type PlaytestContext } from '../playtest-lib';

type UiWindow = Window & { __ui?: UiDebugHook };

const FAKE = 'https://feedback.example.test';
const SHEET = '[role=dialog][aria-label="Feedback"]';
const keyOf = (id: number) => `${id}`.padStart(32, 'a');
const REPLY = 'Kommt in die nächste Version, danke!';
const REJECT = 'Das passt leider nicht zur Strecke.';
const mid = (r: Rect) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)] as const;

/** Five reports this device sent earlier, oldest first, all seen as open. */
function seed(): unknown[] {
  const texts = [
    'Der Skater bleibt an der Bank hängen',
    'Mehr Brezeln auf der Strecke bitte!',
    'Die Musik ist nach der Pause weg',
    'Ein Level im Schlossgarten wäre toll',
    'Test bitte ignorieren',
  ];
  return texts.map((text, i) => ({
    id: i + 1,
    key: keyOf(i + 1),
    day: `2026-10-0${i + 3}`,
    kind: i % 2 ? 'idea' : 'bug',
    text,
    version: '2026-10-09.2',
    platform: 'android',
    input: 'touch',
    orientation: 'landscape',
    viewWidth: 390,
    log: i % 2 ? [] : ['error: boom (index.js:12)', 'state: mode playing, version 2026-10-09.2, view 390x180'],
    status: 'open',
    reply: null,
    doneVersion: null,
    seen: JSON.stringify(['open', null, null]),
  }));
}

/** What the fake worker knows: id 5 was deleted on the board. */
const ROWS: FeedbackStatusEntry[] = [
  { id: 1, status: 'open', reply: null, doneVersion: null },
  { id: 2, status: 'todo', reply: null, doneVersion: null },
  { id: 3, status: 'done', reply: REPLY, doneVersion: '2026-10-12.1' },
  { id: 4, status: 'rejected', reply: REJECT, doneVersion: null },
];

export default async function feedbackInbox(t: PlaytestContext): Promise<void> {
  const { page } = t;
  const statusBodies: { items: { id: number; key: string }[] }[] = [];
  const sent: Record<string, unknown>[] = [];
  const urls: string[] = [];
  let nextId = 40;
  await page.context().addInitScript((url) => ((window as { __feedbackUrl?: string }).__feedbackUrl = url), FAKE);
  await page.route(`${FAKE}/**`, async (route: Route) => {
    const req = route.request();
    const headers = { 'Access-Control-Allow-Origin': '*' };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const url = new URL(req.url());
    urls.push(`${req.method()} ${url.pathname}${url.search}`);
    const body = JSON.parse(req.postData() ?? 'null');
    if (url.pathname === '/feedback/status') {
      statusBodies.push(body);
      const items = body.items as { id: number; key: string }[];
      const entries = ROWS.filter((r) => items.some((i) => i.id === r.id && i.key === keyOf(r.id)));
      return route.fulfill({ status: 200, headers, json: { entries } });
    }
    sent.push(body);
    return route.fulfill({ status: 201, headers, json: { ok: true, id: nextId++ } });
  });
  // The online list fails (never the live worker): the game logs the failed request, so the error log has lines.
  await page.route(`${SCORES_URL}/**`, (route) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
    return route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers }) : route.fulfill({ status: 503, headers });
  });

  const fb = () => page.evaluate(() => (window as UiWindow).__ui!.feedback()) as Promise<FeedbackDebug>;
  const screen = () => page.evaluate(() => (window as UiWindow).__ui!.layout());
  const tap = async (r: Rect | null | undefined) => {
    if (!r) return;
    await t.realTapView(...mid(r));
    await t.game.step(3);
  };

  /** Seeds the device (reports, kid mode), reloads to the title and waits for the status answer. */
  async function freshTitle({ reports = seed() as unknown[] | null, kid = false } = {}): Promise<void> {
    await page.evaluate(
      ({ reports, kid }) => {
        if (reports) localStorage.setItem('cannstatt-cruiser:feedbackSent', JSON.stringify(reports));
        else localStorage.removeItem('cannstatt-cruiser:feedbackSent');
        localStorage.setItem('cannstatt-cruiser:kidMode', String(kid));
        localStorage.removeItem('cannstatt-cruiser:feedbackCheckedAt'); // the minute between checks holds across reloads
      },
      { reports, kid },
    );
    await page.reload();
    await page.waitForFunction(() => Boolean(window.__game));
    await t.game.pause();
    await dismissRotateHint(t);
    if (!kid) await adultMode(t);
    for (let i = 0; i < 40 && !kid && reports && !(await fb())?.dot; i++) {
      await t.wait(50);
      await t.game.step(1);
    }
    await t.game.step(3);
  }

  const narrow = { 'phone-landscape': { width: 640, height: 360 }, 'phone-portrait': { width: 320, height: 640 } }[t.viewport.name];
  for (const size of narrow ? [null, narrow] : [null]) {
    if (size) await page.setViewportSize(size);
    await freshTitle();
    const { viewWidth, portrait } = await t.game.display();
    const label = `${viewWidth}px`;
    const sheet = page.locator(SHEET);
    const sheetButton = (name: string | RegExp) => sheet.getByRole('button', { name, exact: typeof name === 'string' });
    const press = async (control: 'mineTab' | 'newTab' | 'view' | 'send' | 'log' | 'ok', sheetName?: string) => {
      if (!portrait) return tap((await fb()).form[control]);
      if (control === 'log') await sheet.locator('input[type=checkbox]').tap();
      else await sheetButton(sheetName!).tap();
      await t.game.step(3);
    };

    // The status check: ids and keys in the POST body, the dot on the title.
    const asked = statusBodies.at(-1);
    t.check(`${label}: the title asked POST /feedback/status with id and key of each kept report`, JSON.stringify(asked?.items) === JSON.stringify([1, 2, 3, 4, 5].map((id) => ({ id, key: keyOf(id) }))), asked);
    t.check(`${label}: no key in any URL, no GET`, urls.every((u) => u.startsWith('POST ') && !u.includes('?')), urls);
    t.check(`${label}: the red dot is on`, (await fb()).dot);
    t.check(`${label}: the title offers the feedback icon`, !!(await screen()).screen?.feedback);
    await t.canvasShot(`${label} title with the red dot`);

    // Pause menu with the dot.
    await t.game.startRun();
    await t.game.step(20);
    await t.game.pauseGame();
    await t.game.step(3);
    const pauseButton = (await screen()).screen?.feedback;
    t.check(`${label}: pause menu has Feedback with the dot`, !!pauseButton && (await fb()).dot);
    await t.canvasShot(`${label} pause with the red dot`);

    // "Neu" with "Ansehen" (the run start's list request failed: the log has a line).
    await t.wait(100);
    await tap(pauseButton);
    let state = await fb();
    t.check(`${label}: opens on Neu`, state.open && state.tab === 'new' && state.page === 'form' && state.logAvailable, state);
    if (portrait) {
      t.check(`${label}: the sheet has the tabs and Ansehen`, (await sheetButton('Neu').isVisible()) && (await sheetButton('Mein Feedback').isVisible()) && (await sheetButton('Ansehen').isVisible()));
      const right = async (name: string) => Math.round(((await sheetButton(name).boundingBox()) ?? { x: 0, width: 0 }).x + ((await sheetButton(name).boundingBox())?.width ?? 0));
      t.check(`${label}: Ansehen stays inside the gutter like Senden`, (await right('Ansehen')) <= (await right('Senden')), { ansehen: await right('Ansehen'), senden: await right('Senden') });
    }
    await t.screenshot(`${label} neu tab with ansehen`);
    if (!portrait) await t.canvasShot(`${label} neu tab with ansehen`);
    if (t.viewport.touch) await page.locator(portrait ? `${SHEET} textarea` : 'body > textarea').tap();
    await page.keyboard.type('Nach dem Grind hängt das Bild kurz', { delay: 5 });
    await t.game.step(2);
    await press('log');
    await press('view', 'Ansehen');
    state = await fb();
    const labels = state.sections.map((s) => s.label);
    const logLines = state.sections.find((s) => s.label === 'Fehlerprotokoll')?.lines ?? [];
    t.check(`${label}: Das wird gesendet lists the whole message`, state.page === 'preview' && labels.includes('Sitzungsnummer (nur gegen Spam, wird nicht gespeichert)') && labels.includes('Gerät') && labels.at(-1) === null, labels);
    t.check(`${label}: the error lines are in it`, logLines.some((l) => /^request: \/\S+ 503$/.test(l)) && /^state: mode paused/.test(logLines.at(-1) ?? ''), logLines);
    await t.screenshot(`${label} das wird gesendet`);
    if (portrait) {
      // The scroll keys move the sheet's text page (Ansehen, now hidden, had the focus).
      const list = sheet.locator(`div[aria-label="Feedback"]`);
      const scroll = () => list.evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
      await page.keyboard.press('End');
      const end = await scroll();
      await page.keyboard.press('Home');
      t.check(`${label}: End and Home scroll the sheet's text page (it overflows at 320 px)`, end.top === end.max && (await scroll()).top === 0, end);
    }
    if (!portrait) await t.canvasShot(`${label} das wird gesendet`);
    const shown = state.preview;
    if (portrait) await sheetButton('Zurück').tap();
    else await tap(state.pageLayout?.back);
    await t.game.step(2);
    await press('send', 'Senden');
    await page.waitForFunction(() => (window as UiWindow).__ui!.feedback()!.status !== 'sending', undefined, { timeout: 8000 }).catch(() => {});
    await t.game.step(2);
    const posted = sent.at(-1);
    t.check(`${label}: Senden posts exactly the snapshot`, JSON.stringify(posted) === JSON.stringify(shown) && /^[0-9a-f]{32}$/.test(String(posted?.key)), { posted, shown });
    await press('ok', 'OK');

    // "Mein Feedback": all statuses, newest first; the dot goes.
    await tap((await screen()).screen?.feedback);
    await press('mineTab', 'Mein Feedback');
    state = await fb();
    t.check(`${label}: Mein Feedback lists every status, newest first`, JSON.stringify(state.rows.map((r) => r.label)) === JSON.stringify(['Offen', 'Entfernt', 'Nicht geplant', 'Umgesetzt', 'Geplant', 'Offen']), state.rows);
    t.check(`${label}: changed rows keep their dot, the tab dot is gone`, !state.dot && JSON.stringify(state.rows.map((r) => r.changed)) === JSON.stringify([false, true, true, true, true, false]), state.rows);
    await t.screenshot(`${label} mein feedback list`);
    if (!portrait) await t.canvasShot(`${label} mein feedback list`);

    // The done report: details with version and reply, then what was sent.
    if (portrait) await sheet.getByRole('button', { name: /Umgesetzt/ }).tap();
    else await tap(state.rowRects[3]);
    await t.game.step(3);
    state = await fb();
    t.check(`${label}: details with version and reply`, state.page === 'detail' && state.detail?.headline === 'Umgesetzt in Version 2026-10-12.1' && state.detail.reply === `Antwort: „${REPLY}“`, state.detail);
    await t.screenshot(`${label} detail with reply and version`);
    if (!portrait) await t.canvasShot(`${label} detail with reply and version`);
    if (portrait) await sheetButton('Ansehen').tap();
    else await tap(state.pageLayout?.view);
    await t.game.step(3);
    state = await fb();
    t.check(`${label}: Ansehen shows what was sent, with its log`, state.page === 'sent' && (state.sections.find((s) => s.label === 'Fehlerprotokoll')?.lines.length ?? 0) === 2, state.sections);
    await t.screenshot(`${label} das wurde gesendet`);
    if (!portrait) await t.canvasShot(`${label} das wurde gesendet`);

    // The empty state.
    await freshTitle({ reports: null });
    await tap((await screen()).screen?.feedback);
    await press('mineTab', 'Mein Feedback');
    state = await fb();
    t.check(`${label}: empty list`, state.page === 'list' && state.rows.length === 0);
    await t.screenshot(`${label} mein feedback empty`);
    if (!portrait) await t.canvasShot(`${label} mein feedback empty`);

    // Kid mode: no check, no dot, no icon.
    const before = statusBodies.length;
    await freshTitle({ kid: true });
    await t.wait(300);
    await t.game.step(5);
    t.check(`${label}: kid mode asks nothing and offers no feedback`, statusBodies.length === before && !(await screen()).screen?.feedback, statusBodies.length - before);
    await t.canvasShot(`${label} kid title`);
  }
  await t.log('feedback inbox requests', { urls, statusBodies: statusBodies.length, sent: sent.length });
  await adultMode(t);
}
