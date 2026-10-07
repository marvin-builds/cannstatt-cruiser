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
- `src/gameplay/test-kit.ts` (Vitest only): `quietGame(speed)` (player +
  gameplay, spawner off, speed pinned), `obstacle(game, kind, x, motion?)`,
  `place(game, kind, rect)`, `record(game, event)` and `playBot(game, ticks)`.
- `Solver` (`solver.ts`) takes a speed or a `Pace`: `constantPace(speed,
  CHILL_JUMP_SCALE)` checks a course with the chill jump.

### Debug hooks for playtests (same condition as `__game`)

| Hook | Effect |
|---|---|
| `window.__gameplay.place(kind, x, variant?)` | puts `kind` with its left edge at screen x and returns its id: any obstacle (`'banner'`, `'bench'`, ...), people (`'vfbFan'`, `'wasenGuest'`, moving with their middle motion; `variant` 1 = Dirndl) or `'joint'` (drawn as the bubble gum when `state.kidMode`) |
| `window.__gameplay.clear()` | removes every entity (spawning goes on) |
| `window.__ui.hud({combo, multiplier, stars})` | overwrites HUD values like gameplay would |
| `window.__ui.samplePopups()` | spawns "+50", "Grind!", "Stern!" above the skater |
| `window.__ui.setRecords(highscore, starsTotal)` | replaces the loaded records in memory |
| `window.__ui.settings()` | hidden settings menu: `{screen: 'closed' \| 'menu' \| 'check', question, holdProgress}` (`question.answers[question.correct]` is the right answer) |
| `window.__ui.layout()` | tap areas in view px for the current display: `{metrics, hud: {pause, mute, fullscreen}, menu: {toggle, back, answers}, logo}` |

Types: `import type {} from '../../src/gameplay/debug'` (declares
`window.__gameplay`) and `UiDebugHook` from `src/ui/debug.ts`.

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
  - the pause screen and zone 2;
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
- `scripts/scenarios/ui.ts` taps the HUD buttons at the centres
  `__ui.layout()` reports, so it follows the touch / desktop sizes.
- `scripts/scenarios/chill.ts`: bench grind, VfB fans (zone 1) and Wasen
  visitors (zone 2) incl. their crash reactions, the bot jumping people, the
  joint pickup with the chill effect (speed, lower jump, tint, HUD timer) and
  the game over with German numbers.
- `gameplay.ts`, `world.ts`, `ducking.ts` and `chill.ts` call
  `dismissRotateHint(t)` (`playtest-lib.ts`) first, so they also run on
  phone-portrait, where the rotate hint would otherwise keep the run paused.
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
