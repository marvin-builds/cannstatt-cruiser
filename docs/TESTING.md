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
than a hold.

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
| `pauseGame()` / `resumeGame()` | in-game pause screen (`mode` paused / playing) |
| `setZone(i)` | sets `state.zoneIndex` and emits `zoneChanged` |
| `setTimeScale(x)` | real-time speed multiplier (e.g. 4 = fast forward) |
| `events(name?)` | `[{frame, name, payload}]` since load / `clearEvents()` |
| `clearEvents()` | empties the event log |
| `capture(scale = 4)` | PNG data URL of the 320x180 buffer, upscaled nearest-neighbour |

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

- Viewports: `desktop` 1280x720 @1x; `phone-landscape` 844x390 @3x with touch
  and mobile emulation; `phone-portrait` 390x844 @3x with touch and mobile.
- Output goes to `playtest-output/<name>/<viewport>/NN-label.png` (full page)
  and `NN-label-canvas.png` (the 320x180 buffer at 4x), plus
  `playtest-output/<name>/state-log.json` with `checks` and the state `log`.
- The default scenario (`scripts/scenarios/default.ts`) covers:
  - the title screen;
  - a seeded run;
  - tap vs hold apex heights, with a check that hold > tap;
  - real Space / touch input, checking that it jumps and does not scroll or zoom;
  - no scrollbars and an integer device-pixel scale;
  - running screenshots;
  - the pause screen and zone 2.
- Uncaught page errors and console errors fail the run (exit code 1). Missing
  resources (404) are only noted.
- Playwright is pinned to 1.63.0 so that it matches the cached
  `~/.cache/ms-playwright/chromium-1243`. When upgrading, run
  `npx playwright install chromium`.
- Open the PNGs with an image viewer, or have agents use the Read tool.

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
  await t.canvasShot('two seconds');            // 320x180 x4
  const apex = await t.game.jumpApex(40);       // hold 40 ticks, returns height in px
  t.check('high jump', apex > 40, { apex });
  await t.game.resume();
  await t.realPress(200);                       // real Space key / CDP touch hold
  await t.screenshot('after real input');       // full page
}
```

The context provides:
- `page` (the Playwright Page) and `viewport`;
- `game`, a driver for the test hook;
- `screenshot`, `canvasShot`, `log`, `check`, `realPress` and `wait`.

`captureCanvas(page, file, scale)` from `playtest-lib.ts` saves the upscaled
buffer from any Playwright script.
