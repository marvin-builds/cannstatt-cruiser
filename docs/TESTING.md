# Testing

## Unit tests (Vitest)

```
npm test                 # all tests once
npm run test:watch
npx vitest run src/core/rng.test.ts
```

- Tests live next to the code as `*.test.ts` and run in Node, without a DOM.
- Write the failing test first for logic: physics, rules, state, parsing.
- Keep logic in DOM-free modules so it can be tested. Canvas drawing needs no
  unit tests; check it with the playtest harness instead.
- To test a system end to end without a browser, build a `Game` from it and tick:

```ts
import { Game } from '../core/game';
const game = new Game({ systems: [createPlayerSystem()] });
game.seed(1);
game.commands.startRun();
game.buttons.action.press('test');   // or .release('test')
game.tick();                          // one 1/60 s step
expect(game.state.player.grounded).toBe(false);
```

`src/player/index.test.ts` uses this pattern to check that a tap jumps lower
than a hold. Duck works the same with `game.buttons.duck`
(`src/player/duck.test.ts`).

Real input without a DOM: `keyDown(game, 'ArrowDown')` / `keyUp` and
`new PointerControls(game)` with `down(id, x, y, touch)`, `move`, `up` from
`src/core/input.ts` take the same path as the browser events
(`src/core/input.test.ts` checks tap vs swipe down this way, incl. the
1.2 s swipe duck and diagonal swipes). Hotspots: `game.hitHotspot(x, y)`
presses the topmost hotspot at a view pixel; `keyDown(game, 'KeyK')` offers
the key to active `InputHotspot`s first. `src/ui/index.test.ts` opens the
hidden settings menu this way (3 s long press on the logo, or K held) and
answers the parent check.

## Test hook: `window.__game`

The hook is always available under `npm run dev`. In a production build it is
only available with `?test=1` in the URL.

| Call | Effect |
|---|---|
| `seed(n)` | fixes the seed for the following runs (and re-seeds the rng now) |
| `startRun()` | starts a run (title/gameover -> playing) |
| `pause()` / `resume()` | **freeze / unfreeze the real-time clock**. The game mode does not change. |
| `frozen` | whether the clock is frozen |
| `step(frames = 1)` | runs exactly `frames` fixed ticks, redraws, returns the state snapshot |
| `state()` | JSON deep copy of `GameState` |
| `input.press()` / `input.release()` | holds / releases the action (source `test`) |
| `input.tap(frames = 2)` / `input.hold(frames = 30)` | press, keep down for `frames` ticks, release. When frozen this steps synchronously; when running the release is scheduled. |
| `input.duck.press()` / `input.duck.release()` | holds / releases duck (source `test`), like ArrowDown |
| `input.use()` | uses the carried item: the use button pressed for one tick (`commands.useItem()`, like the ui item button); key E does the same in the browser |
| `setDrunk(seconds)` | sets `state.drunkTimer`; while > 0 in a run, action / duck reach the systems 3-8 ticks late (see ARCHITECTURE, Drunk input) |
| `perf.start(frames = 3600)` / `perf.stop()` | frame-time probe: records every real rAF frame (elapsed, updates, update/render ms per system, scroll, JS heap) until stopped; used by `scripts/frametimes.ts` |
| `input.duck.hold(frames = 72)` | duck for `frames` ticks (default = one swipe down, `SWIPE_DUCK_TICKS`, 1.2 s), then release; steps synchronously when frozen like `hold` |
| `pauseGame()` / `resumeGame()` | in-game pause screen (`mode` paused / playing) |
| `setZone(i)` | sets `state.zoneIndex` and emits `zoneChanged` |
| `setTimeScale(x)` | real-time speed multiplier (e.g. 4 = fast forward) |
| `setHealth(n)` | sets `state.health`; at `<= 0` core ends a running run on the next tick |
| `setScore(n)` | sets `state.score` (gameplay keeps adding to it) |
| `setSpeed(x)` / `setSpeed(null)` | difficulty override: pins `state.speed` to `x` (also across new runs) until cleared; gameplay sees it as `ctx.speedOverride` |
| `endRun()` | forces game over now, emits `gameOver`; throws unless the mode is `playing` (call `resumeGame()` first when paused) |
| `events(name?)` | `[{frame, name, payload}]` since load / `clearEvents()` |
| `eventsSince(frame, name?)` | logged events with `frame >= frame`, oldest first |
| `clearEvents()` | empties the event log |
| `display()` | copy of `DisplayInfo`: `portrait`, `touch`, `fullscreen`, `viewWidth`, `viewHeight` |
| `capture(scale = 4)` | PNG data URL of the view buffer (current view width x 180), upscaled nearest-neighbour |

Reading events since a point in time: note the frame first, then act. Events
emitted by hook calls between ticks (e.g. `startRun`) carry the current frame,
so they are included.

```js
const g = window.__game;
const since = g.state().frame;
g.startRun(); g.step(120);
g.eventsSince(since);           // runStarted, jump, ...
g.eventsSince(since, 'crash');  // only crashes
```

Testing game over and the HUD without waiting for gameplay:

```js
g.setScore(4200); g.setHealth(1); g.step(1);   // HUD with one heart
g.setSpeed(165);                                // max difficulty speed (MAX_SPEED)
g.endRun();                                     // game-over screen now
```

### Gameplay testing helpers

- `src/gameplay/testing.ts` (DOM-free, also used by playtests):
  - `SolverBot`: plays like a careful human with the solver's plan. Call
    `next(state)` before every tick and apply `'press'` / `'release'`, and hold
    duck while `duck(state)` is true. It plans with the chill slowdown and the
    chill jump; pass `new SolverBot(true)` when `setSpeed` pins the speed.
  - `planJump(state)`, `courseAhead(state)` / `courseFrom(entities, originX)`
    (live entities as a solver `Course`, incl. ledges = benches and movers =
    people) and `paceOf(state)` (the scroll and jump scale ahead while chilled).
  - `HumanBot(rng, speedPinned?, style?)`: plays like a real, sloppy human
    (`HUMAN_STYLE`: take-off +-4 ticks, only the hold lengths `HUMAN_HOLDS`
    3/10/20, ducking +-4 ticks), same protocol as `SolverBot`; the jitter comes
    from its own `rng`, so runs replay.
  - `planStomp(state)`: a jump `{tick, hold}` from the current support that
    lands on a person's head (passes with stomps, crashes without), or null.
- `src/gameplay/human-run.ts` (DOM-free): `rideHuman(seed, seconds)` lets the
  `HumanBot` ride a real run (player + gameplay, spawner on, health never runs
  out) and returns `{crashes, stomps, score}`; every crash has `personRelated`
  (a person was hit, or one was within `PERSON_NEAR_SECONDS` = 1 s of street)
  and the entities near it. `src/gameplay/human-bot-1/2.test.ts` require no
  person-related crash over 20 seeds x 3 min (split in two files so Vitest runs
  them in parallel; together ~40 s).
- `src/gameplay/test-kit.ts` (Vitest only): `quietGame(speed)` (player +
  gameplay, spawner off, speed pinned), `obstacle(game, kind, x, motion?)`,
  `place(game, kind, rect)`, `record(game, event)` and `playBot(game, ticks)`.
- `Solver` (`solver.ts`) takes a speed or a `Pace`: `constantPace(speed,
  CHILL_JUMP_SCALE)` checks a course with the chill jump. `{stomps: true}`
  allows landing on heads (with the bounce); `takeoffWindow(holds)` is the
  widest run of working take-off ticks for one hold (the human margin,
  `fairness.ts`). `fairness.test.ts` holds the spawner to the human margins
  (every pattern's take-off window >= `takeoffWindowAt(street)`: 14 ticks in
  the first ~90 s, then 12, at min, max and chill speeds; people alone in
  their pattern with >= 1 s of free street; the check across pattern
  boundaries).

### Debug hooks for playtests (same condition as `__game`)

| Hook | Effect |
|---|---|
| `window.__gameplay.place(kind, x, variant?, prop?)` | puts `kind` with its left edge at screen x and returns its id: any obstacle (`'banner'`, `'bench'`, ...), people (`'vfbFan'`, `'wasenGuest'`, moving with their middle motion; `variant` 1 = Dirndl; `prop` 0 = Maßkrug, in kid mode Lebkuchenherz, 1 = Brezel) or `'joint'` (drawn as the bubble gum when `state.kidMode`) |
| `window.__gameplay.clear()` | removes every entity (spawning goes on) |
| `window.__world.trafficDensity()` | current Stuttgart-Mitte traffic density 0..1 (1 = full traffic; 0 outside Mitte) |
| `window.__world.traffic()` | `{vehicles: [{kind, x, y, w, h}], puffs: [{x, y}]}`: view rects of the vehicles and exhaust puffs on screen (check `y >= TRAFFIC_TOP`, `world/traffic.ts`) |
| `window.__player.crash(kind = 'barrier')` | emits a crash into `kind` like gameplay would; `'bin'` plays the bin crash (head first into the bin) |
| `window.__player.grind(height?, length?)` / `removeRail(id)` | a static rail under the player with a grind on it / removes it (the player falls off) |
| `window.__player.chill(s)`, `kidMode(on)`, `carry(item)`, `stomp(item?)`, `catchItem(item)`, `lineup(scale?, look?, item?)` | player-side effects and the pose lineup PNG, see `src/player/debug.ts` |
| `window.__ui.hud({combo, multiplier, stars})` | overwrites HUD values like gameplay would |
| `window.__ui.samplePopups()` | spawns "+50", "Grind!", "Stern!" above the skater |
| `window.__ui.setRecords(highscore, starsTotal)` | replaces the loaded records in memory |
| `window.__ui.settings()` | hidden settings menu: `{screen: 'closed' \| 'menu' \| 'check', question, holdProgress}` (`question.answers[question.correct]` is the right answer) |
| `window.__ui.layout()` | tap areas in view px for the current display: `{metrics, hud: {pause, mute, fullscreen}, menu: {toggle, back, answers}, logo}` |

Types: `import type {} from '../../src/gameplay/debug'` (declares
`window.__gameplay`; likewise `src/world/debug` for `window.__world` and
`src/player/debug` for `window.__player`) and `UiDebugHook` from
`src/ui/debug.ts`.

**Zones in playtests:** runs and the title start in Bad Cannstatt
(`START_ZONE` = 2) and the route goes back and forth (`ROUTE_CYCLE` 2, 1, 0,
1). Read the order from `new ZoneRoute().zoneOf(k)` (zone after gateway k,
which reaches the player at `k * ZONE_LENGTH`) instead of assuming a zone-0
start; `setZone(i)` snaps for zone-specific shots.

**Auto-pause:** losing window focus (`blur`) or hiding the tab
(`visibilitychange`) releases the action and switches a running game to
`paused`. Playwright focus changes, opening DevTools or switching tabs can
therefore pause a run; call `resumeGame()` (or check `state().mode`) before
asserting on gameplay.

Example in the DevTools console, checking that a tap jumps lower than a hold:

```js
const g = window.__game;
g.pause(); g.seed(1); g.startRun(); g.step(10);
g.input.tap(2);  let s = g.state();   // step(2) happened inside tap
for (let i = 0; i < 20; i++) s = g.step(1);   // watch s.player.y
```

## Playtest harness (Playwright + Chromium)

```
npm run playtest                                   # build, preview, all viewports, default scenario
npm run playtest -- --name my-run                  # output folder name (default: timestamp)
npm run playtest -- --viewports desktop,phone-landscape
npm run playtest -- --scenario scripts/scenarios/zones.ts
npm run playtest -- --url http://localhost:5173/   # reuse a running `npm run dev` (skips build)
npm run playtest -- --headed
```

- Viewports: `desktop` 1280x720 @1x; `laptop` 1440x900 @1x (16:10, width-limited
  scale, view 360 wide); `phone-landscape` 844x390 @3x with touch
  and mobile emulation; `phone-portrait` 390x844 @3x with touch and mobile.
- Output goes to `playtest-output/<name>/<viewport>/NN-label.png` (full page)
  and `NN-label-canvas.png` (the view buffer, current width x 180, at 4x), plus
  `playtest-output/<name>/state-log.json` with `checks` and the state `log`.
- The default scenario (`scripts/scenarios/default.ts`) covers:
  - the title screen;
  - a seeded run;
  - tap vs hold apex heights, with a check that hold > tap;
  - real Space / touch input, checking that it jumps and does not scroll or zoom;
  - no scrollbars, an integer device-pixel scale and a view width that fills
    landscape screens (phone-landscape: scale 6, width 422);
  - running screenshots;
  - a real tap on the right-anchored pause button (screen -> view mapping);
  - the pause screen and a switch to zone 0 (runs start in zone 2);
  - a live rotation (viewport width and height swapped) and back, re-checking
    the scale and view width without a reload.
- Uncaught page errors and console errors fail the run (exit code 1). Missing
  resources (404) are only noted.
- Playwright is pinned to 1.63.0 so that it matches the cached
  `~/.cache/ms-playwright/chromium-1243`. When upgrading, run
  `npx playwright install chromium`.
- Open the PNGs with an image viewer, or have agents use the Read tool.
- `scripts/scenarios/ducking.ts`: duck pose, ducking under both overhead
  obstacles in all three zones, crashing into them standing / jumping, real
  ArrowDown (desktop) and a CDP touch swipe down that must duck without
  jumping, still duck after 0.55 s and end by itself (touch viewports), and a
  60 s ducking bot ride on seed 1.
- `scripts/scenarios/settings.ts`: the hidden settings menu on desktop and
  both phone viewports: title without a settings button, a short logo hold
  (no progress, starts the run like a tap), the 3 s long press with its
  progress bar (no run start), turning kid mode on, the parent check (wrong
  answer keeps it, right answer turns it off), reopening with K (desktop) or
  the long press (touch), persistence across a reload, and a kid-mode run
  with the bubble gum, pink tint and gum HUD icon. On touch viewports it
  checks every menu and HUD tap area is >= 44 CSS px (rect x
  `cssPerViewPixel`).
- `scripts/scenarios/people.ts`: human-bot stats (20 seeds x 3 min computed in
  Node, logged as `human bot stats`, no person-related crash allowed), what
  people carry (fan with football, visitors with Maßkrug and Brezel, kid-mode
  visitors with Lebkuchenherz), three real stomps planned with `planStomp`
  (fan, visitor, kid-mode visitor: tumble, item mid-air, item caught with
  popup, dazed, laughing; kid mode never carries beer) and a 60 s human-bot
  ride in the browser. Kid mode is switched with `window.__player.kidMode(on)`.
- `scripts/scenarios/ui.ts` taps the HUD buttons at the centres
  `__ui.layout()` reports, so it follows the touch / desktop sizes.
- `scripts/scenarios/chill.ts`: bench grind, VfB fans (zone 1) and Wasen
  visitors (zone 2) incl. their crash reactions, the bot jumping people, the
  joint pickup with the chill effect (speed, lower jump, tint, HUD timer) and
  the game over with German numbers.
- `scripts/scenarios/world.ts`: title and run start in Bad Cannstatt, four
  gateways (one full back-and-forth route, both directions of each crossing)
  as frame sequences with exactly one `zoneChanged` each, the Mombachquelle at
  the Neckar, the Mitte traffic (dense, never above `TRAFFIC_TOP`, with
  obstacles in front; wider views on desktop), `setZone` snaps, the Neckar
  bridge and the Grabkapelle.
- `scripts/scenarios/skater.ts` ends with the bin crash (`__player.crash('bin')`):
  canvas shots and skater crops of the dive, kicking legs, pop out and the
  tumbling bin, then a normal crash that still throws the skater off.
- `scripts/scenarios/final-phone-touch.ts`: a held touch only jumps after the
  swipe window, so its bench-grind bot plans `SWIPE_WINDOW` ticks ahead
  (`ahead(state)`), like a player who learnt the lag.
- `default.ts`, `gameplay.ts`, `world.ts`, `ducking.ts`, `chill.ts` and
  `final-phone-touch.ts` call `dismissRotateHint(t)`
  (`playtest-lib.ts`) first (and after a reload), so they also run on
  phone-portrait, where the rotate hint takes the first tap and would
  otherwise keep the run paused.
  Loops that wait for game progress use `stepWhile(t, more, {max})` or check
  the mode, so a stopped run fails with a message instead of hanging.

### Custom scenarios

A scenario module default-exports an async function that receives a
`PlaytestContext` (types in `scripts/playtest-lib.ts`):

```ts
import type { PlaytestContext } from '../playtest-lib';

export default async function (t: PlaytestContext) {
  await t.game.pause();            // freeze the clock for determinism
  await t.game.seed(3);
  await t.game.startRun();
  await t.game.step(120);
  await t.log('after 2s', { note: 'anything JSON' });
  await t.canvasShot('two seconds');            // view buffer x4
  const apex = await t.game.jumpApex(40);       // hold 40 ticks, returns height in px
  t.check('high jump', apex > 40, { apex });
  await t.game.resume();
  await t.realPress(200);                       // real Space key / CDP touch hold
  const { viewWidth } = await t.game.display();
  await t.realTapView(viewWidth - 11, 11);      // real tap/click at view pixel (hotspots)
  await t.screenshot('after real input');       // full page
}
```

The context provides:
- `page` (the Playwright Page) and `viewport`;
- `game`, a driver for the test hook;
- (as functions from `playtest-lib.ts`) `dismissRotateHint(t)`, `stepWhile(t, more, {max, frames})`,
  `holdViewWhile(t, x, y, during)` (a real touch / mouse press held while `during` steps the frozen
  clock, e.g. a long press) and `cssPerViewPixel(page)` (tap sizes in CSS px);
- `screenshot`, `canvasShot`, `log`, `check`, `realPress`, `realTapView` and `wait`.

The driver mirrors the hook, including `setHealth`, `setScore`, `setSpeed`,
`endRun`, `eventsSince` and `display`.

`captureCanvas(page, file, scale)` from `playtest-lib.ts` saves the upscaled
buffer from any Playwright script.

## Frame times (`scripts/frametimes.ts`)

```
npm run frametimes                                    # build, preview, desktop, 20 s, headless
npm run frametimes -- --headed --seconds 30 --name before
npm run frametimes -- --viewport phone-landscape --cpu 4   # phone size, 4x CPU throttling
npm run frametimes -- --url http://localhost:5173/        # running dev server
```

It rides a seeded run (health refilled, auto-pause undone every 0.5 s),
records every rAF frame through `window.__game.perf` and a CDP trace (GC
pauses), prints a summary and writes `playtest-output/frametimes/<name>.json`
(summary + raw frames). The summary has: the elapsed-time histogram, the share
of frames with 0 / 1 / 2+ fixed updates, long frames (> 20 ms) with their top
system costs and GCs, frame work (update + render) percentiles, per-system
update / render ms, the per-frame scroll step in view px, the JS heap rise per
frame (allocation rate, exact thanks to `--enable-precise-memory-info`) and
the GC count / total / longest pause. `performance.now()` is coarsened to
0.1 ms in the page. Headless Chromium renders in software, so compositor
costs are exaggerated there. Headed runs miss vsyncs when the machine is busy
(e.g. other test runs): compare runs made under the same load.

### Wave 5a measurements (2026-10-08, seed 1, HEAD + core changes only)

| Run | 0 / 1 / 2+ updates per frame | Long frames > 20 ms | Frame work mean / p99 | Scroll steps (px per frame) | Heap rise per frame |
|---|---|---|---|---|---|
| before, desktop headless | 4.2 % / 91.7 % / 4.1 % | 0 | 1.6 / 4.4 ms | 1: 38, 2: 376, 3: 455, 4: 33, 5: 4 (incl. 0 and 3-5 px jumps) | 22.5 KB |
| before, desktop headed (60 Hz) | 0.1 % / 97.4 % / 2.5 % | 2.6 % (missed vsyncs) | 1.9 / 5.2 ms | 1-2 mostly, 16 x 3, 6 x >= 4 | 24.6 KB |
| before (full-res canvas), phone-landscape, CPU x4 | 0-0.4 % / 21 % / 79 % | 78 % | 6.3 ms | many 3-5 px | 15.9 KB |
| after, desktop headless | 0 / **100 %** / 0 | 0 | 0.8 / 2.2 ms | only 1 and 2 (1.5 px per tick at 90 px/s) | 18.5 KB |
| after, phone-landscape, CPU x4 | 0 / **99.5 %** / 0.5 % | **0.5 %** | 3.3 / 7.0 ms | 1 and 2, 3 jumps | 20.4 KB |

Causes found and fixed in core:
- 0/2-update frames came from rAF jitter of only +-0.1 ms with the
  accumulator sitting on a step boundary: fixed with vsync snapping
  (`loop.ts`, unit tests for 60 / 59.94 / 120 / 144 Hz with jitter).
- The visible canvas had the full device resolution (2532x1170 on the phone
  profile), redrawn by a scaled `drawImage` every frame; the compositor missed
  most frames. It now has the view size and CSS scales it (`renderer.ts`).
- Allocation: font rendering split strings and drew one `fillRect` per font
  pixel (ui render 8.4 KB per frame before, 1.8 KB after); `Sprite.draw` built a
  key string per draw (world render 11.4 KB before, 6.0 KB after); `Game.render`
  allocated a context per frame. Core itself now allocates ~0.5 KB per frame
  (InputFrame snapshots per tick).

Remaining hot spots are in other slices (heap rise is total, measured per system
by heap deltas): gameplay update ~7 KB per frame plus spikes of 10-86 ms when
the spawner plans a pattern (a missed frame each time), world render ~6 KB per
frame, gameplay render ~1.8 KB, ui render ~1.8 KB. See the Wave 5b backlog.
