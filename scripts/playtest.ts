/**
 * Playtest harness: builds and serves the game (or uses --url), drives it in
 * Chromium at named viewports with a scenario, and writes screenshots plus a
 * JSON state log to playtest-output/<run-name>/.
 *
 *   npm run playtest
 *   npm run playtest -- --name jumps --viewports desktop,phone-landscape
 *   npm run playtest -- --scenario scripts/scenarios/zones.ts
 *   npm run playtest -- --url http://localhost:5173/   (use a running dev server)
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { build, preview, type PreviewServer } from 'vite';
import {
  captureCanvas,
  type Check,
  createGameDriver,
  ensureDir,
  join,
  type LogEntry,
  type PlaytestContext,
  type Scenario,
  slug,
  touchHold,
  viewToClient,
  VIEWPORTS,
} from './playtest-lib';

const { values } = parseArgs({
  options: {
    name: { type: 'string', default: new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) },
    scenario: { type: 'string', default: 'scripts/scenarios/default.ts' },
    viewports: { type: 'string', default: Object.keys(VIEWPORTS).join(',') },
    url: { type: 'string' },
    headed: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`Usage: npm run playtest -- [--name run] [--scenario file.ts] [--viewports a,b] [--url http://...] [--headed]
Viewports: ${Object.keys(VIEWPORTS).join(', ')}`);
  process.exit(0);
}

async function startServer(): Promise<{ url: string; server?: PreviewServer }> {
  if (values.url) return { url: values.url };
  await build({ logLevel: 'warn' });
  const server = await preview({ preview: { port: 4317, strictPort: false, host: '127.0.0.1' }, logLevel: 'warn' });
  const url = server.resolvedUrls?.local[0];
  if (!url) throw new Error('vite preview did not report a URL');
  return { url, server };
}

async function main(): Promise<void> {
  const scenarioPath = resolve(values.scenario);
  const scenario = ((await import(pathToFileURL(scenarioPath).href)) as { default: Scenario }).default;
  if (typeof scenario !== 'function') throw new Error(`${values.scenario} must default-export an async function`);

  const viewportNames = values.viewports.split(',').map((v) => v.trim());
  for (const v of viewportNames) if (!VIEWPORTS[v]) throw new Error(`Unknown viewport "${v}"`);

  const runDir = await ensureDir(resolve('playtest-output', values.name));
  const { url, server } = await startServer();
  const target = new URL(url);
  target.searchParams.set('test', '1');

  const browser = await chromium.launch({ headless: !values.headed });
  const stateLog: LogEntry[] = [];
  const checks: (Check & { viewport: string })[] = [];
  const started = Date.now();

  try {
    for (const name of viewportNames) {
      const viewport = VIEWPORTS[name]!;
      const outDir = await ensureDir(join(runDir, name));
      const context = await browser.newContext(viewport.options);
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      const consoleErrors: string[] = [];
      const pageErrors: string[] = [];
      page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
      page.on('pageerror', (e) => pageErrors.push(String(e)));

      await page.goto(target.href);
      await page.waitForFunction(() => Boolean(window.__game));

      let shot = 0;
      const next = (label: string) => join(outDir, `${String(++shot).padStart(2, '0')}-${slug(label)}.png`);
      const game = createGameDriver(page);
      const ctx: PlaytestContext = {
        page,
        viewport,
        outDir,
        game,
        screenshot: async (label) => {
          const file = next(label);
          await page.screenshot({ path: file });
          return file;
        },
        canvasShot: (label, scale = 4) => captureCanvas(page, next(`${label}-canvas`), scale),
        log: async (label, extra) => {
          stateLog.push({ viewport: name, label, wallTimeMs: Date.now() - started, state: await game.state(), extra });
        },
        check: (checkName, ok, detail) => checks.push({ viewport: name, name: checkName, ok, detail }),
        realPress: async (holdMs = 60) => {
          const size = page.viewportSize()!;
          if (viewport.touch) await touchHold(cdp, size.width / 2, size.height / 2, holdMs);
          else {
            await page.keyboard.down('Space');
            await page.waitForTimeout(holdMs);
            await page.keyboard.up('Space');
          }
        },
        realTapView: async (x, y, holdMs = 60) => {
          const p = await viewToClient(page, x, y);
          if (viewport.touch) await touchHold(cdp, p.x, p.y, holdMs);
          else {
            await page.mouse.move(p.x, p.y);
            await page.mouse.down();
            await page.waitForTimeout(holdMs);
            await page.mouse.up();
          }
        },
        wait: (ms) => page.waitForTimeout(ms),
      };

      console.log(`▶ ${name}`);
      await scenario(ctx);

      const page404 = consoleErrors.filter((e) => /Failed to load resource/.test(e));
      ctx.check('no uncaught page errors', pageErrors.length === 0, pageErrors);
      ctx.check('no console errors (except missing resources)', consoleErrors.length === page404.length, consoleErrors);
      if (page404.length) console.log(`  note: ${page404.length} missing resource(s) (PWA files not yet provided?)`);
      await context.close();
    }
  } finally {
    await browser.close();
    await server?.close();
  }

  await writeFile(join(runDir, 'state-log.json'), JSON.stringify({ url: target.href, checks, log: stateLog }, null, 2));
  for (const c of checks) console.log(`${c.ok ? '✔' : '✘'} [${c.viewport}] ${c.name}${c.ok ? '' : ` ${JSON.stringify(c.detail)}`}`);
  console.log(`Output: ${runDir}`);
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
