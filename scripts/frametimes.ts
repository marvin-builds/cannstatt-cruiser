/**
 * Frame-time measurement in a real Chromium: rides a seeded run for a few
 * seconds and records every rAF frame through window.__game.perf (elapsed
 * time, fixed updates per frame, update / render cost per system,
 * scroll position, JS heap) plus a CDP trace for garbage collections.
 * Prints a summary and writes the raw data to
 * playtest-output/frametimes/<name>.json.
 *
 *   npx tsx scripts/frametimes.ts
 *   npx tsx scripts/frametimes.ts --headed --seconds 30 --name before
 *   npx tsx scripts/frametimes.ts --viewport phone-landscape --cpu 4   (4x CPU throttling)
 *   npx tsx scripts/frametimes.ts --url http://localhost:5173/        (running dev server)
 *
 * See "Frame times" in docs/TESTING.md.
 */
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type CDPSession, type Page } from 'playwright';
import type { FrameRecord, ProbeDump } from '../src/core/perf';
import { ensureDir, join, serveGame, VIEWPORTS } from './playtest-lib';

const { values } = parseArgs({
  options: {
    name: { type: 'string', default: new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) },
    viewport: { type: 'string', default: 'desktop' },
    seconds: { type: 'string', default: '20' },
    cpu: { type: 'string', default: '1' },
    seed: { type: 'string', default: '1' },
    url: { type: 'string' },
    headed: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (values.help) {
  console.log(`Usage: npx tsx scripts/frametimes.ts [--name run] [--viewport ${Object.keys(VIEWPORTS).join('|')}]
  [--seconds 20] [--cpu 1 (CPU throttling factor)] [--seed 1] [--url http://...] [--headed]`);
  process.exit(0);
}

/** A slow frame: more than this many ms since the previous one. */
const LONG_FRAME_MS = 20;
const ELAPSED_BUCKETS = [8, 12, 15.5, 18, 20, 25, 34, 50, Infinity];

interface TraceEvent {
  name: string;
  ts: number;
  dur?: number;
  ph: string;
  args?: { data?: { message?: string } };
}

interface Gc {
  name: string;
  /** Start in performance.now() ms of the page. */
  start: number;
  ms: number;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))]!;
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const r = (v: number) => Math.round(v * 100) / 100;
  return { mean: r(mean), p50: r(percentile(sorted, 0.5)), p95: r(percentile(sorted, 0.95)), p99: r(percentile(sorted, 0.99)), max: r(sorted.at(-1) ?? 0) };
}

function share(n: number, total: number): string {
  return `${((100 * n) / Math.max(1, total)).toFixed(1)}%`;
}

function histogram(values: number[], bounds: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  let lower = 0;
  for (const upper of bounds) {
    out[upper === Infinity ? `>=${lower}` : `${lower}-${upper}`] = values.filter((v) => v >= lower && v < upper).length;
    lower = upper;
  }
  return out;
}

/** How often each (integer) value occurs, keyed by value. */
function countBy(values: number[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of [...values].sort((a, b) => a - b)) out[v] = (out[v] ?? 0) + 1;
  return out;
}

/** What the run's numbers say: the summary printed and stored. */
function summarize(dump: ProbeDump, gcs: Gc[]) {
  const frames = dump.frames.slice(1); // the first frame's elapsed spans the start call
  const elapsed = frames.map((f) => f.elapsed);
  const updates = frames.map((f) => f.updates);
  const work = frames.map((f) => f.updateMs + f.renderMs);
  const steps = frames.map((f, i) => Math.round(f.scroll) - Math.round(i === 0 ? dump.frames[0]!.scroll : frames[i - 1]!.scroll));
  const heapRises = frames.map((f, i) => f.heap - (i === 0 ? dump.frames[0]! : frames[i - 1]!).heap).filter((d) => d > 0);
  const perSystem = (phase: 'update' | 'render') =>
    Object.fromEntries(dump.systems.map((s) => [s, stats(frames.map((f) => f[phase][s]!))]));
  const gcIn = (f: FrameRecord) => gcs.filter((g) => g.start < f.t && g.start + g.ms > f.t - f.elapsed);
  const long = frames
    .filter((f) => f.elapsed > LONG_FRAME_MS)
    .sort((a, b) => b.elapsed - a.elapsed)
    .slice(0, 12)
    .map((f) => ({
      t: Math.round(f.t),
      elapsed: +f.elapsed.toFixed(1),
      updates: f.updates,
      updateMs: +f.updateMs.toFixed(2),
      renderMs: +f.renderMs.toFixed(2),
      topSystems: dump.systems
        .flatMap((s) => [
          [`${s}.update`, f.update[s]!],
          [`${s}.render`, f.render[s]!],
        ] as [string, number][])
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([n, ms]) => `${n} ${ms.toFixed(2)}ms`),
      gc: gcIn(f).map((g) => `${g.name} ${g.ms.toFixed(1)}ms`),
    }));
  return {
    frames: frames.length,
    elapsedMs: stats(elapsed),
    elapsedHistogram: histogram(elapsed, ELAPSED_BUCKETS),
    updatesPerFrame: {
      '0': share(updates.filter((u) => u === 0).length, frames.length),
      '1': share(updates.filter((u) => u === 1).length, frames.length),
      '2+': share(updates.filter((u) => u >= 2).length, frames.length),
    },
    longFrames: `${frames.filter((f) => f.elapsed > LONG_FRAME_MS).length} (${share(frames.filter((f) => f.elapsed > LONG_FRAME_MS).length, frames.length)})`,
    frameWorkMs: stats(work),
    updateMs: stats(frames.map((f) => f.updateMs)),
    renderMs: stats(frames.map((f) => f.renderMs)),
    perSystemUpdateMs: perSystem('update'),
    perSystemRenderMs: perSystem('render'),
    scrollStepPx: countBy(steps),
    heapRisePerFrameKb: +(heapRises.reduce((a, b) => a + b, 0) / Math.max(1, frames.length) / 1024).toFixed(2),
    gc: { count: gcs.length, totalMs: +gcs.reduce((a, g) => a + g.ms, 0).toFixed(1), maxMs: +Math.max(0, ...gcs.map((g) => g.ms)).toFixed(2) },
    longestFrames: long,
  };
}

/** Keeps the run going (no game over, no auto-pause) while frames are recorded. */
async function keepRiding(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = window.__game!;
    const s = g.state();
    if (s.mode === 'paused') g.resumeGame();
    if (s.mode === 'gameover' || s.mode === 'title') g.startRun();
    g.setHealth(5);
  });
}

async function startTrace(cdp: CDPSession, sink: TraceEvent[]): Promise<void> {
  cdp.on('Tracing.dataCollected', (e) => void sink.push(...(e.value as unknown as TraceEvent[])));
  await cdp.send('Tracing.start', {
    traceConfig: { includedCategories: ['devtools.timeline', 'v8', 'disabled-by-default-devtools.timeline'] },
    transferMode: 'ReportEvents',
  });
}

async function stopTrace(cdp: CDPSession): Promise<void> {
  const done = new Promise<void>((r) => cdp.once('Tracing.tracingComplete', () => r()));
  await cdp.send('Tracing.end');
  await done;
}

/** GC pauses from the trace, in page performance.now() time (aligned on a console.timeStamp marker). */
function gcPauses(events: TraceEvent[], marker: string, markerPageTime: number): Gc[] {
  const sync = events.find((e) => e.name === 'TimeStamp' && e.args?.data?.message === marker);
  if (!sync) return [];
  const offset = sync.ts / 1000 - markerPageTime;
  return events
    .filter((e) => (e.name === 'MinorGC' || e.name === 'MajorGC') && e.ph === 'X' && e.dur !== undefined)
    .map((e) => ({ name: e.name, start: e.ts / 1000 - offset, ms: e.dur! / 1000 }));
}

async function main(): Promise<void> {
  const viewport = VIEWPORTS[values.viewport];
  if (!viewport) throw new Error(`Unknown viewport "${values.viewport}"`);
  const seconds = Number(values.seconds);
  const { url, server } = await serveGame(values.url);
  const target = new URL(url);
  target.searchParams.set('test', '1');
  const browser = await chromium.launch({ headless: !values.headed, args: ['--enable-precise-memory-info'] });
  try {
    const context = await browser.newContext(viewport.options);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    if (Number(values.cpu) > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(values.cpu) });
    await page.goto(target.href);
    await page.waitForFunction(() => Boolean(window.__game));
    await page.evaluate((seed) => {
      const g = window.__game!;
      g.seed(seed);
      g.startRun();
    }, Number(values.seed));
    await page.waitForTimeout(1500); // warm-up: JIT, sprite caches

    const trace: TraceEvent[] = [];
    await startTrace(cdp, trace);
    const marker = 'frametimes-start';
    const markerTime = await page.evaluate(
      ([m, frames]) => {
        const t = performance.now();
        console.timeStamp(m as string);
        window.__game!.perf.start(frames as number);
        return t;
      },
      [marker, Math.ceil(seconds * 250)] as const,
    );
    for (let elapsed = 0; elapsed < seconds * 1000; elapsed += 500) {
      await page.waitForTimeout(500);
      await keepRiding(page);
    }
    const dump = await page.evaluate(() => window.__game!.perf.stop());
    await stopTrace(cdp);

    const summary = summarize(dump, gcPauses(trace, marker, markerTime));
    const meta = { viewport: viewport.name, headed: values.headed, cpuThrottling: Number(values.cpu), seconds, seed: Number(values.seed) };
    const dir = await ensureDir(resolve('playtest-output', 'frametimes'));
    const file = join(dir, `${values.name}.json`);
    await writeFile(file, JSON.stringify({ meta, summary, frames: dump.frames }, null, 1));
    console.log(JSON.stringify({ meta, ...summary }, null, 2));
    console.log(`Raw frames: ${file}`);
    await context.close();
  } finally {
    await browser.close();
    await server?.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
