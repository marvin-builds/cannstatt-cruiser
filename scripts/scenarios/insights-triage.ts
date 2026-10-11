/**
 * Feedback triage on the insights board (ROADMAP 56) against a FAKE worker: a
 * route answers every request to the worker URL, so nothing reaches the live
 * worker or GitHub. Card actions, the issue editor, "Todo #N", the delete
 * confirm, the status filter, 'umgesetzt in Version' with Erledigt and the
 * 'mit Fehlerprotokoll' marker (ROADMAP 70).
 *   npm run playtest -- --scenario scripts/scenarios/insights-triage.ts --viewports desktop,phone-portrait --name triage
 */
import type { Route } from 'playwright';
import { sampleFeedback } from '../../src/insights/sample-feedback';
import { sampleStats } from '../../src/insights/sample-stats';
import { join, type PlaytestContext } from '../playtest-lib';

const API = 'https://cannstatt-cruiser-scores.marvinmai.workers.dev';
const TOKEN = 'geheim-123';

export default async function (t: PlaytestContext) {
  const browser = t.page.context().browser()!;
  const desktop = !t.viewport.touch;
  const context = await browser.newContext({ ...t.viewport.options, ...(desktop ? { viewport: { width: 1280, height: 800 } } : {}), serviceWorkers: 'block' });
  const calls: { method: string; path: string; body: string | null; auth?: string }[] = [];
  let entries = sampleFeedback();
  let issueFails = false;
  await context.route(`${API}/**`, async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const headers = {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Content-Type': 'application/json',
    };
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    calls.push({ method: req.method(), path: url.pathname, body: req.postData(), auth: req.headers()['authorization'] });
    if (req.headers()['authorization'] !== `Bearer ${TOKEN}`) return route.fulfill({ status: 401, headers, body: '{"ok":false,"error":"unauthorized"}' });
    if (url.pathname === '/stats') return route.fulfill({ status: 200, headers, body: JSON.stringify(sampleStats(7)) });
    if (url.pathname === '/feedback') return route.fulfill({ status: 200, headers, body: JSON.stringify({ entries }) });
    const m = /^\/feedback\/(\d+)(\/issue)?$/.exec(url.pathname);
    if (!m) return route.fulfill({ status: 404, headers, body: '{}' });
    const id = Number(m[1]);
    if (m[2] && req.method() === 'POST') {
      if (issueFails) return route.fulfill({ status: 502, headers, body: '{"ok":false,"error":"github","status":403}' });
      entries = entries.map((e) => (e.id === id ? { ...e, status: 'todo', issue: 21, doneVersion: null } : e));
      return route.fulfill({ status: 201, headers, body: '{"ok":true,"issue":21}' });
    }
    if (req.method() === 'PATCH') {
      const patch = JSON.parse(req.postData() ?? '{}');
      // Like the worker: a status patch sets the done version (the given one with done, else null).
      const version = patch.status === undefined ? {} : { doneVersion: patch.status === 'done' ? (patch.doneVersion ?? null) : null };
      entries = entries.map((e) => (e.id === id ? { ...e, ...patch, ...version } : e));
      const e = entries.find((x) => x.id === id)!;
      return route.fulfill({ status: 200, headers, body: JSON.stringify({ ok: true, status: e.status, issue: e.issue, reply: e.reply, doneVersion: e.doneVersion }) });
    }
    if (req.method() === 'DELETE') {
      entries = entries.filter((e) => e.id !== id);
      return route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    return route.fulfill({ status: 404, headers, body: '{}' });
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  let shot = 200;
  const card = page.locator('.card.feedback');
  const cardShot = (label: string) => card.screenshot({ path: join(t.outDir, `${++shot}-triage-${label}.png`) });
  const noScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
  try {
    await page.goto(new URL('insights.html', t.page.url()).href);
    await page.fill('input[name=token]', TOKEN);
    await page.click('button[type=submit]');
    await page.waitForSelector('.fb-item');
    const badges = await page.$$eval('.fb-status', (els) => els.map((e) => [e.tagName, e.textContent, e.getAttribute('href')]));
    t.check('Todo #12 links to the issue, rejected shows its badge', JSON.stringify(badges).includes('["A","Todo #12","https://github.com/marvinmai/cannstatt-cruiser/issues/12"]') && JSON.stringify(badges).includes('Abgelehnt'), badges);
    t.check('reply shown as text', (await page.textContent('.fb-reply')) === 'Antwort: Der Schlossgarten passt nicht zur Strecke.');
    t.check('no script element from player text', (await card.locator('script').count()) === 0);
    const logMarks = await page.$$eval('.fb-item', (els) => els.map((e) => [e.getAttribute('data-id'), e.querySelector('.fb-has-log')?.textContent ?? null]));
    t.check('only the report with a log is marked mit Fehlerprotokoll', JSON.stringify(logMarks) === '[["14",null],["13","mit Fehlerprotokoll"],["12",null],["11",null]]', logMarks);
    await cardShot('card');

    // Issue editor on the idea #14
    const first = page.locator('.fb-item[data-id="14"]');
    await first.locator('button:has-text("Todo")').click();
    const title = await first.locator('input[name=title]').inputValue();
    const body = await first.locator('textarea[name=body]').inputValue();
    t.check('editor prefilled title', title === 'Idee: Bitte mehr Hunde im Park!', title);
    t.check('editor prefilled body has text and meta', body.startsWith('> Bitte mehr Hunde') && body.includes('Version 2026-10-11.4 · Android'), body);
    t.check('no horizontal scroll with editor open', await noScroll());
    await cardShot('issue-editor');

    // Bug #12 has no log; open editor on bug #13? It has an issue already. Use the log checkbox via a list with logs: none open. Edit and fail once.
    issueFails = true;
    await first.locator('input[name=title]').fill('Idee: Mehr Hunde im Park');
    await first.locator('button:has-text("Issue anlegen")').click();
    await first.locator('.fb-error:not(:empty)').waitFor();
    t.check('GitHub failure shows a note', (await first.locator('.fb-error').textContent()) === 'GitHub hat abgelehnt (Status 403).');
    await cardShot('issue-error');
    issueFails = false;
    await first.locator('button:has-text("Issue anlegen")').click();
    await page.locator('.fb-item[data-id="14"] a.fb-status').waitFor();
    const post = calls.find((c) => c.method === 'POST' && c.path === '/feedback/14/issue' && c.body?.includes('Mehr Hunde'));
    t.check('POST /feedback/14/issue with the edited title and bearer', !!post && post.auth === `Bearer ${TOKEN}`, post);
    t.check('card shows Todo #21 after creating', (await page.locator('.fb-item[data-id="14"] a.fb-status').textContent()) === 'Todo #21');
    t.check('no Todo button once an issue exists', (await page.locator('.fb-item[data-id="14"] .fb-actions button:has-text("Todo")').count()) === 0);
    await cardShot('todo-link');

    // Status: set #12 rejected with a reply
    const long = page.locator('.fb-item[data-id="12"]');
    await long.locator('button:has-text("Status")').click();
    await long.locator('select[name=status]').selectOption('rejected');
    await long.locator('input[name=reply]').fill('Lässt sich leider nicht nachstellen.');
    await cardShot('status-editor');
    await long.locator('button:has-text("Speichern")').click();
    await page.locator('.fb-item[data-id="12"] .fb-reply').waitFor();
    const patch = calls.find((c) => c.method === 'PATCH');
    t.check('PATCH sends status and reply', patch?.path === '/feedback/12' && patch.body === '{"status":"rejected","reply":"Lässt sich leider nicht nachstellen."}', patch);

    // Delete with confirm on #11
    const del = page.locator('.fb-item[data-id="11"]');
    await del.locator('button:has-text("Löschen")').click();
    t.check('delete asks first, nothing sent yet', !calls.some((c) => c.method === 'DELETE'));
    await cardShot('delete-confirm');
    await del.locator('button:has-text("Ja, löschen")').click();
    await page.locator('.fb-item[data-id="11"]').waitFor({ state: 'detached' });
    t.check('DELETE sent and item gone', calls.some((c) => c.method === 'DELETE' && c.path === '/feedback/11'));

    // Status filter
    await page.selectOption('.fb-status-filter', 'todo');
    const todoIds = await page.$$eval('.fb-item', (els) => els.map((e) => e.getAttribute('data-id')));
    t.check('status filter Todo shows the todo entries', todoIds.join() === '14,13', todoIds);
    await cardShot('filter-todo');
    await page.selectOption('.fb-status-filter', 'rejected');
    await cardShot('filter-rejected');
    await page.selectOption('.fb-status-filter', 'all');

    // Erledigt with 'umgesetzt in Version' on #12 (rejected before)
    await long.locator('button:has-text("Status")').click();
    const versionField = long.locator('label.fb-field:has(input[name=doneVersion])');
    t.check('version field hidden while the status is not Erledigt', !(await versionField.isVisible()));
    await long.locator('select[name=status]').selectOption('done');
    t.check('version field shown for Erledigt, empty', (await versionField.isVisible()) && (await long.locator('input[name=doneVersion]').inputValue()) === '');
    t.check('reply hint names Mein Feedback', ((await long.locator('label.fb-field:has(input[name=reply]) span').textContent()) ?? '').includes('„Mein Feedback“'));
    const patchesBefore = calls.filter((c) => c.method === 'PATCH').length;
    await long.locator('input[name=doneVersion]').fill('bald');
    await long.locator('button:has-text("Speichern")').click();
    t.check('a malformed version is refused on the board, nothing sent',
      ((await long.locator('.fb-error').textContent()) ?? '').startsWith('Version im Format') && calls.filter((c) => c.method === 'PATCH').length === patchesBefore);
    await long.locator('input[name=doneVersion]').fill('2026-10-12.1');
    await long.locator('input[name=reply]').fill('Ist drin, danke!');
    await cardShot('status-editor-version');
    await long.locator('button:has-text("Speichern")').click();
    await page.locator('.fb-item[data-id="12"] .fb-status.done').waitFor();
    const donePatch = calls.filter((c) => c.method === 'PATCH').at(-1);
    t.check('PATCH sends status done with the version', donePatch?.body === '{"status":"done","reply":"Ist drin, danke!","doneVersion":"2026-10-12.1"}', donePatch);
    t.check('card shows Erledigt in 2026-10-12.1', (await page.locator('.fb-item[data-id="12"] .fb-status').textContent()) === 'Erledigt in 2026-10-12.1');
    await long.locator('button:has-text("Status")').click();
    t.check('editor prefills the stored version', (await long.locator('input[name=doneVersion]').inputValue()) === '2026-10-12.1');
    await long.locator('button:has-text("Abbrechen")').click();
    await cardShot('card-done-version');
    // log checkbox on #13 is not offered (it has an issue); check the editor log toggle through a reload with a fresh bug
    entries = [...entries, { ...sampleFeedback()[1]!, id: 15, status: 'open', issue: null }];
    await page.click('button:has-text("Neu laden")');
    await page.locator('.fb-item[data-id="15"]').waitFor();
    const withLog = page.locator('.fb-item[data-id="15"]');
    await withLog.locator('button:has-text("Todo")').click();
    await withLog.locator('input[name=log]').check();
    const logBody = await withLog.locator('textarea[name=body]').inputValue();
    t.check('ticking the log appends it', logBody.includes('<details><summary>Fehlerprotokoll</summary>') && logBody.includes('stepPlayer'), logBody);
    await withLog.locator('input[name=log]').uncheck();
    t.check('unticking removes it', !(await withLog.locator('textarea[name=body]').inputValue()).includes('Fehlerprotokoll'));
    await withLog.locator('input[name=log]').check();
    await withLog.screenshot({ path: join(t.outDir, `${++shot}-triage-editor-log.png`) });
    await page.emulateMedia({ colorScheme: 'dark' });
    await cardShot('card-dark');
    t.check('no horizontal scroll', await noScroll());
    t.check('no page errors', errors.length === 0, errors);
  } finally {
    await context.close();
  }
}
