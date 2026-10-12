/**
 * The ticket workflow of the insights board (ROADMAP 56, 79-83) against a FAKE worker: a route answers
 * every request to the worker URL like the real one (issue, link, PATCH with the issue state, DELETE), so
 * nothing reaches the live worker or GitHub. Tabs Statistik/Feedback with the action count (hash and
 * sessionStorage), status chips, the issue state next to the link, the state-driven actions (Umsetzen with a
 * new or linked issue, Ablehnen with templates, Abschließen gated on the issue state, Öffnen, Wieder öffnen,
 * Antwort ändern, Löschen), light and dark. Runs in Firefox too (ROADMAP 81):
 *   npm run playtest -- --scenario scripts/scenarios/insights-triage.ts --viewports desktop,phone-portrait --name triage
 *   PLAYTEST_BROWSER=firefox npm run playtest -- --scenario scripts/scenarios/insights-triage.ts --viewports desktop,phone-portrait --name triage-firefox
 */
import type { Locator, Page, Route } from 'playwright';
import { BUILD_VERSION } from '../../src/changelog';
import { doneMessage, NOT_PLANNED_MESSAGE, PLANNED_MESSAGE, rejectMessages, REOPEN_DONE_MESSAGE, REOPEN_REJECTED_MESSAGE } from '../../src/insights/messages';
import { sampleFeedback } from '../../src/insights/sample-feedback';
import { sampleStats } from '../../src/insights/sample-stats';
import type { TriagedFeedbackEntry } from '../../src/insights/triage-types';
import { join, type PlaytestContext, scenarioBrowser } from '../playtest-lib';

const API = 'https://cannstatt-cruiser-scores.marvinmai.workers.dev';
const TOKEN = 'geheim-123';
/** Issues the fake GitHub knows for POST /feedback/:id/link; any other number is 'issue-not-found'. */
const GITHUB_ISSUES: Record<number, Pick<TriagedFeedbackEntry, 'issueState' | 'issueClosedDay'>> = {
  30: { issueState: 'open', issueClosedDay: null },
  31: { issueState: 'completed', issueClosedDay: '2026-10-12' },
};

type Call = { method: string; path: string; body: string | null; auth?: string };

/** The fake worker: state in `entries`, every call recorded; `issueFails` makes the next issue creations fail at GitHub. */
function fakeWorker() {
  const fake = { entries: sampleFeedback(), calls: [] as Call[], issueFails: false };
  const triageOf = (e: TriagedFeedbackEntry) => ({
    status: e.status, issue: e.issue, reply: e.reply, doneVersion: e.doneVersion, issueState: e.issueState, issueClosedDay: e.issueClosedDay,
  });
  const update = (id: number, change: Partial<TriagedFeedbackEntry>) => (fake.entries = fake.entries.map((e) => (e.id === id ? { ...e, ...change } : e)));
  const handle = async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Content-Type': 'application/json',
    };
    const json = (status: number, body: unknown) => route.fulfill({ status, headers, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    fake.calls.push({ method: req.method(), path: url.pathname, body: req.postData(), auth: req.headers()['authorization'] });
    if (req.headers()['authorization'] !== `Bearer ${TOKEN}`) return json(401, { ok: false, error: 'unauthorized' });
    if (url.pathname === '/stats') return json(200, sampleStats(7));
    if (url.pathname === '/feedback') return json(200, { entries: fake.entries });
    const m = /^\/feedback\/(\d+)(\/issue|\/link)?$/.exec(url.pathname);
    const entry = m ? fake.entries.find((e) => e.id === Number(m[1])) : undefined;
    if (!m || !entry) return json(404, { ok: false, error: 'not-found' });
    const body = JSON.parse(req.postData() ?? '{}');
    const reply = body.reply === undefined ? entry.reply : (body.reply?.trim() || null);
    if (m[2] === '/issue' && req.method() === 'POST') {
      if (fake.issueFails) return json(502, { ok: false, error: 'github', status: 403 });
      update(entry.id, { status: 'todo', issue: 21, reply, doneVersion: null, issueState: 'open', issueClosedDay: null });
      return json(201, { ok: true, issue: 21 });
    }
    if (m[2] === '/link' && req.method() === 'POST') {
      // Like the worker: only an issue GitHub no longer has (state missing) may be replaced.
      if (entry.issue !== null && entry.issueState !== 'missing') return json(409, { ok: false, error: 'exists', issue: entry.issue });
      const state = GITHUB_ISSUES[body.issue];
      if (!state) return json(422, { ok: false, error: 'issue-not-found' });
      update(entry.id, { status: 'todo', issue: body.issue, reply, doneVersion: null, ...state });
      return json(200, { ok: true, issue: body.issue, ...state });
    }
    if (req.method() === 'PATCH') {
      // Like the worker: Geplant needs an issue; a status patch sets the done version (the given one with done, else null).
      if (body.status === 'todo' && entry.issue === null) return json(409, { ok: false, error: 'no-issue' });
      const version = body.status === undefined ? {} : { doneVersion: body.status === 'done' ? (body.doneVersion ?? null) : null };
      update(entry.id, { ...(body.status ? { status: body.status } : {}), reply, ...version });
      return json(200, { ok: true, ...triageOf(fake.entries.find((e) => e.id === entry.id)!) });
    }
    if (req.method() === 'DELETE') {
      fake.entries = fake.entries.filter((e) => e.id !== entry.id);
      return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    return json(404, { ok: false, error: 'not-found' });
  };
  return { fake, handle };
}

const ids = (page: Page) => page.$$eval('.fb-item', (els) => els.map((e) => Number(e.getAttribute('data-id'))));
const actionLabels = (item: Locator) => item.locator('.fb-actions button').allTextContents();

export default async function (t: PlaytestContext) {
  const { engine, browser, contextOptions, close } = await scenarioBrowser(t);
  const desktop = !t.viewport.touch;
  const context = await browser.newContext(contextOptions({ ...t.viewport.options, ...(desktop ? { viewport: { width: 1280, height: 800 } } : {}), serviceWorkers: 'block' }));
  const { fake, handle } = fakeWorker();
  await context.route(`${API}/**`, handle);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  let shot = 200;
  const card = page.locator('.card.feedback');
  const cardShot = (label: string) => card.screenshot({ path: join(t.outDir, `${++shot}-triage-${label}.png`) });
  const itemShot = (item: Locator, label: string) => item.screenshot({ path: join(t.outDir, `${++shot}-triage-${label}.png`) });
  const pageShot = (label: string) => page.screenshot({ path: join(t.outDir, `${++shot}-triage-${label}.png`) });
  const noScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  const item = (id: number) => page.locator(`.fb-item[data-id="${id}"]`);
  const action = (id: number, label: string) => item(id).locator('.fb-actions button', { hasText: new RegExp(`^${label}$`) });
  const tabCount = () => page.locator('#tab-feedback .tab-count').evaluate((el) => ((el as HTMLElement).hidden ? '' : el.firstChild?.textContent ?? ''));
  const lastCall = (method: string) => fake.calls.filter((c) => c.method === method).at(-1);
  const unlock = async () => {
    await page.fill('input[name=token]', TOKEN);
    await page.click('button[type=submit]');
    await page.waitForSelector('[role=tablist]');
  };
  const board = new URL('insights.html', t.page.url()).href;
  t.check(`engine ${engine}`, true);
  try {
    await page.goto(board);
    await unlock();

    // ROADMAP 79: tabs, Statistik first, the Feedback count (Neu 14, 12 + ready to close 10, 9)
    const tabState = () => page.$$eval('[role=tab]', (els) => els.map((e) => [e.id, e.getAttribute('aria-selected'), e.getAttribute('tabindex')]));
    t.check('two ARIA tabs, Statistik selected first', JSON.stringify(await tabState()) === '[["tab-stats","true","0"],["tab-feedback","false","-1"]]', await tabState());
    t.check('Feedback tab counts Neu and ready to close (4)', (await tabCount()) === '4', await tabCount());
    t.check('feedback panel hidden on Statistik', !(await card.isVisible()) && (await page.isVisible('#panel-stats .tiles')));
    t.check('no <select> on the board (ROADMAP 81)', (await page.locator('select').count()) === 0);
    await pageShot('tab-statistik');
    await page.click('#tab-feedback');
    t.check('Feedback tab shows the card and writes #feedback and sessionStorage',
      (await card.isVisible()) && !(await page.isVisible('#panel-stats')) && page.url().endsWith('#feedback') &&
      (await page.evaluate(() => sessionStorage.getItem('cannstatt-cruiser:boardTab'))) === 'feedback');
    t.check('sessionStorage holds nothing but the tab', (await page.evaluate(() => Object.keys(sessionStorage))).join() === 'cannstatt-cruiser:boardTab');
    await pageShot('tab-feedback');

    // ROADMAP 80: chips, Neu + Geplant on by default
    const chips = await page.$$eval('.chips .chip', (els) => els.map((e) => [e.textContent?.trim(), e.getAttribute('aria-pressed')]));
    t.check('chips Neu, Geplant on; Erledigt, Abgelehnt off', JSON.stringify(chips) === '[["Neu","true"],["Geplant","true"],["Erledigt","false"],["Abgelehnt","false"]]', chips);
    t.check('default list hides Erledigt and Abgelehnt', (await ids(page)).join() === '14,13,12,10,9,8', await ids(page));

    // ROADMAP 82: issue state next to the link
    const issueText = (id: number) => item(id).locator('a.fb-issue').textContent();
    t.check('issue states: offen, erledigt am, verworfen am, nicht gefunden',
      (await issueText(13)) === '#12 · offen' && (await issueText(10)) === '#9 · erledigt am 12.10.' &&
      (await issueText(9)) === '#8 · verworfen am 11.10.' && (await issueText(8)) === '#5 · nicht gefunden',
      [await issueText(13), await issueText(10), await issueText(9), await issueText(8)]);
    t.check('issue link opens GitHub', (await item(13).locator('a.fb-issue').getAttribute('href')) === 'https://github.com/marvinmai/cannstatt-cruiser/issues/12');
    t.check('bereit zum Abschließen on 10 and 9 only', (await page.locator('.fb-ready').count()) === 2 && (await item(10).locator('.fb-ready').count()) === 1);
    t.check('status badge reads Neu', (await item(14).locator('.fb-status').textContent()) === 'Neu');

    // ROADMAP 83: actions by state
    t.check('Neu: Umsetzen, Ablehnen, Antwort ändern, Löschen', (await actionLabels(item(14))).join() === 'Umsetzen,Ablehnen,Antwort ändern,Löschen', await actionLabels(item(14)));
    t.check('Geplant, issue open: Abschließen disabled with reason, no Löschen',
      (await actionLabels(item(13))).join() === 'Abschließen,Antwort ändern' && (await action(13, 'Abschließen').isDisabled()) &&
      (await item(13).locator('.fb-why').textContent()) === 'erst wenn das Issue geschlossen ist');
    t.check('Geplant, issue closed: Abschließen enabled', !(await action(10, 'Abschließen').isDisabled()) && !(await action(9, 'Abschließen').isDisabled()));
    t.check('Geplant, issue missing: hint and Issue verknüpfen',
      (await actionLabels(item(8))).join() === 'Abschließen,Issue verknüpfen,Antwort ändern' && (await item(8).locator('.fb-why').textContent()) === 'Issue auf GitHub nicht gefunden');
    await itemShot(item(13), 'abschliessen-gesperrt');
    await itemShot(item(10), 'abschliessen-bereit');
    await cardShot('card');

    // Umsetzen on #14: one form, prefilled, fails once at GitHub, then creates the issue with the message
    await action(14, 'Umsetzen').click();
    const first = item(14);
    t.check('Umsetzen prefills title, text and the player message',
      (await first.locator('input[name=title]').inputValue()) === 'Idee: Bitte mehr Hunde im Park!' &&
      (await first.locator('textarea[name=body]').inputValue()).startsWith('> Bitte mehr Hunde') &&
      (await first.locator('textarea[name=reply]').inputValue()) === PLANNED_MESSAGE);
    t.check('Umsetzen offers Ergänzung (Entwickler), empty', (await first.locator('textarea[name=addition]').inputValue()) === '');
    await first.locator('textarea[name=addition]').fill('Passt zum Park-Level im Herbst.');
    t.check('no horizontal scroll with the form open', await noScroll());
    await itemShot(first, 'umsetzen');
    fake.issueFails = true;
    await first.locator('button:has-text("Issue anlegen")').click();
    await first.locator('.fb-error:not(:empty)').waitFor();
    t.check('GitHub failure shows a note, status unchanged', (await first.locator('.fb-error').textContent()) === 'GitHub hat abgelehnt (Status 403).' &&
      (await first.locator('.fb-status').textContent()) === 'Neu');
    fake.issueFails = false;
    await first.locator('button:has-text("Issue anlegen")').click();
    await item(14).locator('a.fb-issue').waitFor();
    const post = lastCall('POST');
    t.check('POST /feedback/14/issue sends title, addition and reply in one request',
      post?.path === '/feedback/14/issue' && post.auth === `Bearer ${TOKEN}` &&
      JSON.parse(post.body ?? '{}').reply === PLANNED_MESSAGE && JSON.parse(post.body ?? '{}').addition === 'Passt zum Park-Level im Herbst.', post);
    t.check('no PATCH for Umsetzen', !fake.calls.some((c) => c.method === 'PATCH'));
    t.check('#14 now Geplant with #21 · offen and its message',
      (await item(14).locator('.fb-status').textContent()) === 'Geplant' && (await item(14).locator('a.fb-issue').textContent()) === '#21 · offen' &&
      (await item(14).locator('.fb-reply').textContent()) === `Antwort: ${PLANNED_MESSAGE}`);
    t.check('tab count follows (3)', (await tabCount()) === '3');

    // Umsetzen on #12 with "Bestehendes Issue verknüpfen": an unknown number, then #30
    await action(12, 'Umsetzen').click();
    const long = item(12);
    await long.locator('label.switch').click();
    t.check('link switch swaps title/text for the issue number',
      (await long.locator('input[name=issue]').isVisible()) && !(await long.locator('input[name=title]').isVisible()) &&
      (await long.locator('button[type=submit]').textContent()) === 'Verknüpfen');
    await long.locator('input[name=issue]').fill('abc');
    await long.locator('button[type=submit]').click();
    t.check('a bad number is refused on the board', ((await long.locator('.fb-error').textContent()) ?? '').startsWith('Issue-Nummer eingeben'));
    await long.locator('input[name=issue]').fill('404');
    await long.locator('button[type=submit]').click();
    await long.locator('.fb-error:text("Dieses Issue")').waitFor();
    t.check('unknown issue maps to a German note', (await long.locator('.fb-error').textContent()) === 'Dieses Issue gibt es nicht (Nummer prüfen).');
    await long.locator('input[name=issue]').fill('#30');
    await itemShot(long, 'umsetzen-verknuepfen');
    await long.locator('button[type=submit]').click();
    await item(12).locator('a.fb-issue').waitFor();
    const link = lastCall('POST');
    t.check('POST /feedback/12/link with the number and the message', link?.path === '/feedback/12/link' && link.body === JSON.stringify({ issue: 30, reply: PLANNED_MESSAGE }), link);
    t.check('#12 shows #30 · offen', (await item(12).locator('a.fb-issue').textContent()) === '#30 · offen');

    // Abschließen: issue done -> Erledigt with BUILD_VERSION; not planned -> Abgelehnt
    await action(10, 'Abschließen').click();
    const done = item(10);
    t.check('Abschließen (done) prefills BUILD_VERSION and the message',
      (await done.locator('input[name=doneVersion]').inputValue()) === BUILD_VERSION && (await done.locator('textarea[name=reply]').inputValue()) === doneMessage(BUILD_VERSION));
    await itemShot(done, 'abschliessen-erledigt');
    await done.locator('button[type=submit]').click();
    await item(10).waitFor({ state: 'detached' });
    t.check('PATCH done with version and message; hidden by the chips',
      lastCall('PATCH')?.body === JSON.stringify({ status: 'done', doneVersion: BUILD_VERSION, reply: doneMessage(BUILD_VERSION) }), lastCall('PATCH'));
    await action(9, 'Abschließen').click();
    t.check('Abschließen (not planned) prefills the we-tried message', (await item(9).locator('textarea[name=reply]').inputValue()) === NOT_PLANNED_MESSAGE);
    await itemShot(item(9), 'abschliessen-verworfen');
    await item(9).locator('button[type=submit]').click();
    await item(9).waitFor({ state: 'detached' });
    t.check('PATCH rejected with the message', lastCall('PATCH')?.body === JSON.stringify({ status: 'rejected', reply: NOT_PLANNED_MESSAGE }));
    t.check('no ticket left to act on: the count is gone', (await tabCount()) === '');

    // Missing issue: Issue verknüpfen replaces it (the worker allows that only for state missing)
    await action(8, 'Issue verknüpfen').click();
    t.check('link form explains the missing issue', ((await item(8).locator('.fb-hint').first().textContent()) ?? '').includes('#5 gibt es auf GitHub nicht mehr'));
    await item(8).locator('input[name=issue]').fill('99');
    await item(8).locator('button[type=submit]').click();
    await item(8).locator('.fb-error:not(:empty)').waitFor();
    t.check('an unknown number maps to the issue-not-found note', (await item(8).locator('.fb-error').textContent()) === 'Dieses Issue gibt es nicht (Nummer prüfen).');
    await itemShot(item(8), 'verknuepfen-fehlt');
    await item(8).locator('input[name=issue]').fill('#31');
    await item(8).locator('button[type=submit]').click();
    await item(8).locator('.fb-panel').waitFor({ state: 'detached' });
    t.check('re-link: POST /feedback/8/link with the new number and the message',
      lastCall('POST')?.path === '/feedback/8/link' && lastCall('POST')?.body === JSON.stringify({ issue: 31, reply: PLANNED_MESSAGE }), lastCall('POST'));
    t.check('re-linked ticket shows the new issue, ready to close', (await issueText(8)) === '#31 · erledigt am 12.10.' &&
      !(await action(8, 'Abschließen').isDisabled()) && (await actionLabels(item(8))).join() === 'Abschließen,Antwort ändern');
    t.check('tab count follows the re-link (1)', (await tabCount()) === '1', await tabCount());
    await itemShot(item(8), 'verknuepft-ersetzt');

    // Chips: show everything
    await page.click('.chip:has-text("Erledigt")');
    await page.click('.chip:has-text("Abgelehnt")');
    t.check('all chips on: every ticket', (await ids(page)).join() === '14,13,12,11,10,9,8,7', await ids(page));
    t.check('Erledigt: Wieder öffnen; Abgelehnt: Öffnen and Löschen',
      (await actionLabels(item(7))).join() === 'Wieder öffnen,Antwort ändern' && (await actionLabels(item(11))).join() === 'Öffnen,Antwort ändern,Löschen');
    await cardShot('alle-status');

    // Öffnen #11 (rejected, no issue) -> Neu with the fresh message
    await action(11, 'Öffnen').click();
    t.check('Öffnen replaces the rejection with the look-again message', (await item(11).locator('textarea[name=reply]').inputValue()) === REOPEN_REJECTED_MESSAGE);
    await itemShot(item(11), 'oeffnen');
    await item(11).locator('button[type=submit]').click();
    await item(11).locator('.fb-status:text("Neu")').waitFor();
    t.check('PATCH open with the message', lastCall('PATCH')?.body === JSON.stringify({ status: 'open', reply: REOPEN_REJECTED_MESSAGE }));

    // Wieder öffnen #7 (done, with issue) -> Geplant
    await action(7, 'Wieder öffnen').click();
    t.check('Wieder öffnen prefills the again message and names Geplant',
      (await item(7).locator('textarea[name=reply]').inputValue()) === REOPEN_DONE_MESSAGE && (await item(7).locator('button[type=submit]').textContent()) === 'Zurück auf Geplant');
    await item(7).locator('button[type=submit]').click();
    await item(7).locator('.fb-status:text("Geplant")').waitFor();
    t.check('PATCH todo with the message', lastCall('PATCH')?.body === JSON.stringify({ status: 'todo', reply: REOPEN_DONE_MESSAGE }));

    // Ablehnen #11 with the second template
    await action(11, 'Ablehnen').click();
    const ablehnen = item(11);
    t.check('Ablehnen offers the idea templates, the first picked', (await ablehnen.locator('input[type=radio]').count()) === rejectMessages('idea').length &&
      (await ablehnen.locator('textarea[name=reply]').inputValue()) === rejectMessages('idea')[0]);
    await ablehnen.locator('label.fb-check').nth(1).click();
    t.check('picking a template fills the message', (await ablehnen.locator('textarea[name=reply]').inputValue()) === rejectMessages('idea')[1]);
    await itemShot(ablehnen, 'ablehnen');
    await ablehnen.locator('button[type=submit]').click();
    await item(11).locator('.fb-status:text("Abgelehnt")').waitFor();
    t.check('PATCH rejected with the template', lastCall('PATCH')?.body === JSON.stringify({ status: 'rejected', reply: rejectMessages('idea')[1] }));

    // Antwort ändern on #13: only the message
    await action(13, 'Antwort ändern').click();
    await item(13).locator('textarea[name=reply]').fill('Wir sind dran!');
    await item(13).locator('button[type=submit]').click();
    await item(13).locator('.fb-reply').waitFor();
    t.check('Antwort ändern sends only the reply', lastCall('PATCH')?.path === '/feedback/13' && lastCall('PATCH')?.body === '{"reply":"Wir sind dran!"}');

    // Löschen #11 (Abgelehnt) with confirm
    await action(11, 'Löschen').click();
    t.check('delete asks first', !fake.calls.some((c) => c.method === 'DELETE'));
    await item(11).locator('button:has-text("Ja, löschen")').click();
    await item(11).waitFor({ state: 'detached' });
    t.check('DELETE sent', lastCall('DELETE')?.path === '/feedback/11');

    // A legacy Geplant without issue and a fresh bug with a log, after a reload
    const bug = sampleFeedback()[1]!;
    fake.entries = [...fake.entries, { ...bug, id: 16, status: 'open', issue: null, issueState: null, reply: null }, { ...bug, id: 15, log: [], status: 'todo', issue: null, issueState: null }];
    await page.click('button:has-text("Neu laden")');
    await item(16).waitFor();
    t.check('reload keeps the Feedback tab', (await page.getAttribute('#tab-feedback', 'aria-selected')) === 'true');
    t.check('Geplant without issue: Issue verknüpfen and Ablehnen', (await actionLabels(item(15))).join() === 'Issue verknüpfen,Ablehnen,Antwort ändern');
    await action(16, 'Umsetzen').click();
    await item(16).locator('label.fb-check:has(input[name=log])').click();
    t.check('ticking the log appends it', (await item(16).locator('textarea[name=body]').inputValue()).includes('<details><summary>Fehlerprotokoll</summary>'));
    await item(16).locator('label.fb-check:has(input[name=log])').click();
    t.check('unticking removes it', !(await item(16).locator('textarea[name=body]').inputValue()).includes('Fehlerprotokoll'));
    await page.emulateMedia({ colorScheme: 'dark' });
    await itemShot(item(16), 'umsetzen-dark');
    await item(16).locator('button:has-text("Abbrechen")').click();
    await cardShot('card-dark');
    await pageShot('tab-feedback-dark');
    await page.emulateMedia({ colorScheme: 'light' });

    // Keyboard on the tabs, then a fresh load: sessionStorage brings Feedback back, the hash wins
    await page.focus('#tab-feedback');
    await page.keyboard.press('ArrowLeft');
    t.check('ArrowLeft selects and focuses Statistik, hash #statistik',
      (await page.getAttribute('#tab-stats', 'aria-selected')) === 'true' && (await page.evaluate(() => document.activeElement?.id)) === 'tab-stats' && page.url().endsWith('#statistik'));
    await page.keyboard.press('End');
    t.check('End selects Feedback', (await page.getAttribute('#tab-feedback', 'aria-selected')) === 'true');
    await page.goto(board);
    await unlock();
    t.check('without hash, sessionStorage brings back Feedback', (await page.getAttribute('#tab-feedback', 'aria-selected')) === 'true');
    await page.goto(`${board}#statistik`);
    t.check('a link to #statistik on the open board switches the tab', (await page.getAttribute('#tab-stats', 'aria-selected')) === 'true');
    await page.goto('about:blank');
    await page.goto(`${board}#feedback`);
    await unlock();
    t.check('the hash wins over sessionStorage on a fresh load', (await page.getAttribute('#tab-feedback', 'aria-selected')) === 'true' &&
      (await page.evaluate(() => sessionStorage.getItem('cannstatt-cruiser:boardTab'))) === 'stats');
    await page.click('#tab-stats');
    t.check('charts drawn on Statistik', (await page.locator('#panel-stats [data-day-chart="sessions"] svg').count()) === 1);
    t.check('no horizontal scroll', await noScroll());
    t.check('no page errors', errors.length === 0, errors);
  } finally {
    await context.close();
    await close();
  }
}
