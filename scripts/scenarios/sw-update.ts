/**
 * Service worker update regression check (standalone, not a playtest scenario):
 * a cold start of the installed app must pick up a new deploy although the
 * host sends `cache-control: max-age=600` (GitHub Pages does). The worker's
 * background page refresh has to revalidate past the browser's HTTP cache,
 * otherwise it compares the old page with itself and never signals.
 *
 * Steps: build the game once, serve it as build A from a local server under a
 * Pages-like sub-path (max-age=600, ETag + 304), open it in a persistent
 * Chromium profile so the worker installs, close the app, switch the server to
 * build B (same files, page marked differently), cold-start the app again (new
 * browser, no reload, no `checkForUpdate`: those posts are dropped) and expect
 * `updateReady`; the start after that must run build B.
 *
 *   npx tsx scripts/scenarios/sw-update.ts
 *   npx tsx scripts/scenarios/sw-update.ts --sw old-sw.js   (check another worker, e.g. `git show <rev>:public/sw.js`)
 *
 * Exits 1 on a failed check. Screenshots go to playtest-output/sw-update/.
 * No request leaves the machine: the browser resolves every host except
 * 127.0.0.1 to nothing (host-resolver-rules, not Playwright routes, because
 * routes disable the HTTP cache this check depends on).
 */
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type BrowserContext, type Page } from 'playwright';
import { build } from 'vite';
import { ensureDir } from '../playtest-lib';

const { values } = parseArgs({ options: { sw: { type: 'string' } } });

const SUB_PATH = '/cannstatt-cruiser/';
const MAX_AGE = 600;
const UPDATE_TIMEOUT_MS = 10_000;
const BUILD_MARK = 'sw-update-build';
const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

type BuildName = 'A' | 'B';
type SwWindow = Window & { __swMessages?: string[]; __droppedChecks?: number };

const work = mkdtempSync(join(tmpdir(), 'sw-update-'));
const shotDir = await ensureDir(resolve('playtest-output', 'sw-update'));
const failures: string[] = [];
let shot = 0;

function check(name: string, ok: boolean, detail?: unknown): void {
  console.log(`${ok ? '✔' : '✘'} ${name}${ok ? '' : ` ${JSON.stringify(detail)}`}`);
  if (!ok) failures.push(name);
}

/** Builds the game once and derives builds A and B that differ only in a marker in the page. */
async function prepareBuilds(): Promise<Record<BuildName, string>> {
  const base = join(work, 'dist');
  await build({ logLevel: 'warn', build: { outDir: base, emptyOutDir: true } });
  if (values.sw) cpSync(resolve(values.sw), join(base, 'sw.js'));
  const dirs = { A: join(work, 'A'), B: join(work, 'B') };
  for (const name of ['A', 'B'] as const) {
    cpSync(base, dirs[name], { recursive: true });
    const index = join(dirs[name], 'index.html');
    const html = readFileSync(index, 'utf8').replace('<head>', `<head><meta name="${BUILD_MARK}" content="${name}">`);
    writeFileSync(index, html);
  }
  return dirs;
}

/** A Pages-like static server: max-age=600, ETags and 304s, switchable between builds. */
function startServer(dirs: Record<BuildName, string>) {
  let current: BuildName = 'A';
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://local').pathname);
    if (!path.startsWith(SUB_PATH)) return res.writeHead(404).end();
    const file = join(dirs[current], path.slice(SUB_PATH.length) || 'index.html');
    if (!existsSync(file) || statSync(file).isDirectory()) return res.writeHead(404).end();
    const body = readFileSync(file);
    const etag = `"${createHash('sha1').update(body).digest('hex')}"`;
    const headers = { etag, 'cache-control': `max-age=${MAX_AGE}`, 'content-type': CONTENT_TYPES[extname(file)] ?? 'application/octet-stream' };
    if (req.headers['if-none-match'] === etag) return res.writeHead(304, headers).end();
    res.writeHead(200, headers).end(req.method === 'HEAD' ? undefined : body);
  });
  return new Promise<{ url: string; serve: (name: BuildName) => void; close: () => void }>((done) =>
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      done({
        url: `http://127.0.0.1:${port}${SUB_PATH}`,
        serve: (name) => (current = name),
        close: () => server.close(),
      });
    }),
  );
}

/** Opens the app like a tap on the home-screen icon: a fresh browser on the kept profile. */
async function coldStart(profile: string, url: string): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext(profile, {
    headless: true,
    viewport: { width: 1280, height: 720 },
    args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
  });
  await context.addInitScript(() => {
    const w = window as SwWindow;
    w.__swMessages = [];
    w.__droppedChecks = 0;
    navigator.serviceWorker?.addEventListener('message', (e: MessageEvent<{ type?: string }>) => w.__swMessages!.push(String(e.data?.type)));
    // Only the navigation refresh may find the deploy, not the app's own update check.
    const post = ServiceWorker.prototype.postMessage;
    ServiceWorker.prototype.postMessage = function (this: ServiceWorker, message: unknown, ...rest: never[]) {
      if ((message as { type?: string } | null)?.type === 'checkForUpdate') return void w.__droppedChecks!++;
      return post.call(this, message, ...rest);
    };
  });
  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(url);
  return { context, page };
}

const runningBuild = (page: Page) =>
  page.evaluate((mark) => document.querySelector(`meta[name="${mark}"]`)?.getAttribute('content') ?? null, BUILD_MARK);

async function screenshot(page: Page, label: string): Promise<void> {
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(shotDir, `${String(++shot).padStart(2, '0')}-${label}.png`) });
}

async function main(): Promise<void> {
  const server = await startServer(await prepareBuilds());
  const profile = join(work, 'profile');
  try {
    let { context, page } = await coldStart(profile, server.url);
    await page.waitForFunction(async () => {
      const keys = await caches.keys();
      return Boolean(navigator.serviceWorker.controller) && keys.length > 0 && Boolean(await caches.match(location.href));
    });
    check('first start runs build A', (await runningBuild(page)) === 'A');
    await screenshot(page, 'first-start-A');
    await context.close();

    server.serve('B');
    ({ context, page } = await coldStart(profile, server.url));
    check('cold start after the deploy still shows the cached build A', (await runningBuild(page)) === 'A');
    const signalled = await page
      .waitForFunction(() => (window as SwWindow).__swMessages!.includes('updateReady'), undefined, { timeout: UPDATE_TIMEOUT_MS })
      .then(() => true)
      .catch(() => false);
    const seen = await page.evaluate(() => ({ messages: (window as SwWindow).__swMessages, droppedChecks: (window as SwWindow).__droppedChecks }));
    check('cold start signals updateReady (max-age=600, no checkForUpdate)', signalled, seen);
    await screenshot(page, 'cold-start-update-ready');
    await context.close();

    ({ context, page } = await coldStart(profile, server.url));
    check('next start runs build B', (await runningBuild(page)) === 'B');
    await screenshot(page, 'next-start-B');
    await context.close();
  } finally {
    server.close();
    rmSync(work, { recursive: true, force: true });
  }
  if (failures.length) {
    console.log(`${failures.length} check(s) failed`);
    process.exit(1);
  }
  console.log('all checks passed');
}

await main();
