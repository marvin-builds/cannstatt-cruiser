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
- Draw and update code runs every frame / tick: use index loops
  (`for (let i = 0; i < a.length; i++)`), not `for-of` (it allocates an
  iterator per loop), and no closures, spreads or object literals in hot
  paths. Check allocation with `npm run frametimes` (heap rise per frame).
- The spawner plans on a work budget only when built with
  `new Spawner(zoneAt, { workPerTick: PLAN_WORK_PER_TICK })` (as the game
  does); without it every pattern is planned when due, which keeps unit tests
  simple. See ARCHITECTURE, Planning budget.
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

Such a `Game` uses a fresh memory store (nothing persists between games) and
a plain browser (`state.install` is `standalone: false, platform: 'other'`).
To test the "what's new" or install-hint screens, pass both in:

```ts
import { createMemoryStore } from '../core/storage';
const store = createMemoryStore();
store.set('lastSeenVersion', '2026-10-08.1');           // older than BUILD_VERSION
const game = new Game({
  systems: [createUiSystem()],
  store,
  platform: { installEnvironment: () => ({ standalone: false, platform: 'ios' }) },
});
game.state.whatsNew;                                    // entries since 2026-10-08.1
game.install.capturePrompt({ preventDefault() {}, prompt() {} });  // canPrompt = true
```

Real input without a DOM: `keyDown(game, 'ArrowDown')` / `keyUp` and
`new PointerControls(game)` with `down(id, x, y, touch)`, `move`, `up` from
`src/core/input.ts` take the same path as the browser events
(`src/core/input.test.ts` checks tap vs swipe down this way, incl. the
1.2 s swipe duck and diagonal swipes). Hotspots: `game.hitHotspot(x, y)`
presses the topmost hotspot at a view pixel; `keyDown(game, 'KeyK')` offers
the key to active `InputHotspot`s first. `src/ui/index.test.ts` opens the
hidden settings menu this way (3 s long press on the logo, or K held) and
toggles kid mode on and off.

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
| `setDrunk(seconds)` | sets `state.drunkTimer`; while > 0 in a run, action / duck reach the systems 8-20 ticks late and every press's hold is wobbled by up to ±10 ticks (see ARCHITECTURE, Drunk input) |
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
| `simulateUpdateReady()` | handles the service worker's `{type: 'updateReady'}` message as after a real deploy: sets `state.updateReady` (for the ui's reload hint; the real path is checked by `scripts/scenarios/update-hint.ts`) |
| `simulateInstall(fields)` | overrides `state.install` fields for install-hint playtests (not persisted), e.g. `{platform: 'ios', visits: 3}`. `canPrompt: true` captures a fake `beforeinstallprompt` that `commands.promptInstall()` consumes; `canPrompt: false` withdraws it |
| `promptsShown()` | how many fake install prompts were shown (after `simulateInstall({canPrompt: true})` and the ui's "Installieren") |

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
g.setSpeed(190);                                // top difficulty speed (gameplay TOP_SPEED)
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
  them in parallel; together ~40 s). `human-bot-3.test.ts` rides past both
  difficulty ramps (top speed, every tier: at most one crash per 45 s over
  3 seeds x 1 min). `rideDrunk(seed, from)` lets the bot carry a Maßkrug,
  drink it and ride the drunk phase (it presses about the mean drunk delay
  early and holds on for the full jump, `drunkFairness`);
  `human-bot-drunk.test.ts` requires no crash in >= 18 of 20 seeds, early in
  the run and at full difficulty.
- `src/gameplay/effect-street.ts` (Vitest only): `rideEffect(seed, from,
  'drunk' | 'chill')` rides a seeded run (gameplay only, never crashing) into
  a drunk or chill phase and reports the longest stretch of empty street
  under the skater and the kinds that came; `effect-street.test.ts` keeps
  the street busy during effects (see ARCHITECTURE, Effect street).
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
| `window.__gameplay.place('kicker' \| 'ledge', x, variant?)` | stunt pieces with their left edge at screen x, forming one line: a kicker starts a new line (launching for a `DEFAULT_LEDGE_HEIGHT` ledge), a ledge (`DEFAULT_LEDGE_HEIGHT` up, 100 px long, the zone's look, `variant` 1 = its second look) joins the line placed last. A ledge's entity `y` is its grind surface. Place a line's pieces together: a line whose next piece is missing ends at once. Used by `scripts/scenarios/stunts.ts` |
| `window.__gameplay.stuntLine(x, seed?)` | places a whole designed stunt line (`stunt-line.ts`) for the current speed and zone with its first kicker at screen x; returns the entity ids (stars included) |
| `window.__gameplay.stunts()` | the running stunt line `{line, steps, made, multiplier, points}` (points so far, without the line bonus) or null (read-only) |
| `window.__gameplay.park(offset?, seed?)` / `parkPlan()` | plans the NorDIY park for the current speed with its start `offset` run distance ahead of the skater (default: just beyond the widest view's right edge; `seed` default 1), puts it into `state.park` and lays its kickers, ledges and the `highFiver`, removing what stood there; returns the plan. The speed ramp does not pause for it (pin the speed with `setSpeed`). `parkPlan()` reads `state.park`. Used by `scripts/scenarios/nordiy.ts`, which falls back to riding Bad Cannstatt until the spawner plans a park if the hook is missing |
| `window.__gameplay.clear()` | removes every entity (spawning goes on) |
| `window.__gameplay.drops()` | snapshot of the [dropped items](ARCHITECTURE.md#dropped-items) (no entities, so `state()` misses them): `[{item, x, y, w, h, lying}]`, the pickup box in screen space and whether it already lies on the street |
| `window.__world.trafficDensity()` | traffic density as drawn: `LIGHT_TRAFFIC` 0.05 outside Mitte (light traffic, one vehicle at a time), ramping to 1 in Mitte; also on the title and game over (where `state.trafficDensity` is 0) |
| `window.__world.traffic()` | `{vehicles: [{kind, x, y, w, h, front}], puffs: [{x, y}], shake}` (Mitte and light traffic): view rects of the vehicles (`kind` hatch / sedan / van / bus / truck; `front` = front lane, drawn over gameplay) and the tops of the exhaust puffs on screen, plus the street rumble offset `shake` (0 or 1 px while a bus or truck is on screen). Limits from `world/traffic.ts`: back lane `y >= TRAFFIC_TOP`, front lane `y >= FRONT_TOP`, puffs `y >= EXHAUST_TOP` |
| `window.__world.planPark(x?)` / `cheer(level)` | world-only NorDIY scenery: `planPark` sets `state.park` to a hand-made plan (bank, two containers, crane) starting at screen x `x` (default `PLAYER_X + 40`) and clears the traffic, returning the plan; gameplay lays no ledges for it, so it shows the scenery only. `cheer` lets the park crowd cheer at `level` 0..1 like a `sessionCheer`. For a ridable park use `__gameplay.park()` |
| `window.__player.crash(kind = 'barrier')` | emits a crash into `kind` like gameplay would; `'bin'` plays the bin crash (head first into the bin) |
| `window.__player.grind(height?, length?)` / `removeRail(id)` | a static rail under the player with a grind on it / removes it (the player falls off) |
| `window.__player.chill(s)`, `kidMode(on)`, `carry(item)`, `stomp(item?)`, `catchItem(item)`, `lineup(scale?, look?, item?)` | player-side effects and the pose lineup PNG, see `src/player/debug.ts` |
| `window.__player.useItem(item, action)` / `drunk(s)` | emits `itemUsed` (the use animation plays, `state.carriedItem` cleared) / sets `state.drunkTimer` (drunk wobble) |
| `window.__player.useLineup(scale = 4)` | PNG data URL: item use (drink, eat, throw) in the ride, air, grind and grind-trick poses, then rows of the drunk wobble |
| `window.__ui.hud({combo, multiplier, stars})` | overwrites HUD values like gameplay would |
| `window.__ui.samplePopups()` | spawns "+50", "Grind!", "Stern!" above the skater |
| `window.__ui.itemPopups(...kinds)` | feeds sample item events to the popup feed (shown on the next tick): `'drink'`, `'eat'` (+1 health), `'throw'`, `'hit'` (ball hit with points), `'back'` (ricochet), `'stomp'` (with points), `'trick'` |
| `window.__ui.carry(item \| null)` | puts an item in the hands (`state.carriedItem`) like a catch, incl. the first-time touch hint (storage key `itemHintSeen`), without toss or popup |
| `window.__ui.setRecords(highscore, starsTotal)` | replaces the loaded records in memory |
| `window.__ui.stuntStep(multiplier)` / `stuntEnd(completed, points)` | emits stunt line events like gameplay ("Combo xN!", "Stunt-Linie! +…") |
| `window.__ui.airTrick(points)` / `airHintVisible()` | emits `airTrick` ("Air-Trick! +…" popup; the first-time air trick hint is never shown again) / whether the air trick hint wants to show now |
| `window.__ui.previewKickerHint()` | feeds the kicker hint one kicker just ahead of the skater; returns whether "Ab über die Rampe!" shows |
| `window.__ui.trickHintVisible()` | whether the grind trick hint ("↓ = Trick!") shows now |
| `window.__ui.settings()` | hidden settings menu: `{screen: 'closed' \| 'menu', holdProgress}` (the logo hold progress 0..1) |
| `window.__ui.layout()` | tap areas in view px for the current display: `{metrics, hud: {pause, mute, fullscreen}, menu: {toggle, back}, logo, screen}`; `logo` is the title's logo, or the pause screen's while paused; `screen` holds the current menu screen's buttons `{reload, install, dismiss, toTitle, next, logo}` (each a rect or null; `screen` is null off the menu screens). The touch item button's rect is `itemButtonRect(viewWidth, display)` from `src/ui/item-button.ts` |
| `window.__audio.log` / `status()` | sounds in trigger order `{at, sound, muted}`: cue names (`glug`, `honk`, ...) plus `grind:start` / `grind:stop` and `traffic:start` / `traffic:stop` (the backend starts / stops hearing any traffic: in light traffic once per passing vehicle, as its swell rises and fades; in Mitte when the steady hum starts and stops; also stops on game over, pause or mute), and the pass-by cues `passCar` / `passVan` / `passBus` / `passTruck` (from `vehiclePassed`, which the world emits only while playing); `src/audio/debug.ts` |

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
  progress bar (no run start), turning kid mode on and off at once (no
  parent check since Wave 9), reopening with K (desktop) or
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
  the Neckar, the Mitte traffic (dense; check "vehicles below the riding
  line, exhaust behind gameplay": every back-lane vehicle at or below
  `TRAFFIC_TOP`, front-lane vehicle at or below `FRONT_TOP` and puff at or
  below `EXHAUST_TOP`, sampled over 5 s; obstacles in front; wider views on
  desktop), `setZone` snaps, the Neckar bridge and the Grabkapelle, then
  light traffic in Bad Cannstatt (25 s at 90 px/s: density `LIGHT_TRAFFIC`
  drawn and in `state.trafficDensity`, never more than one vehicle, no truck,
  the same height limits) and `state.trafficDensity` 0 after game over. Run
  it on `desktop,phone-landscape,phone-portrait`.
- `scripts/scenarios/skater.ts` has the bin crash (`__player.crash('bin')`):
  canvas shots and skater crops of the dive, kicking legs, pop out and the
  tumbling bin, then a normal crash that still throws the skater off. It
  ends with the item use lineup (`00-use-lineup*.png`), the grind trick
  (turn, front view, drinking in it, turn back while still grinding), the
  empty mug toss, eating, throwing in the air and the drunk wobble (crops).
  Its pose shots pin the speed to 0 on an empty street (the solver's old
  stack overflow at speed 0 with a Maßkrug in hand is fixed since Wave 5d).
- `scripts/scenarios/items.ts` (gameplay item use, all three viewports):
  throw at a Wasen visitor (hit, tumble), a miss that ricochets back (first
  seed whose rng says so) and knocks the skater off, eating a Brezel
  (+1 health), and drinking while the `SolverBot` rides at a pinned 150 px/s:
  drunk for ~`DRUNK_DURATION`, and every entity that comes onto the street
  from the catch on is from an easy pattern (no people, overhead obstacles
  or rails).
- `scripts/scenarios/drop.ts` (gameplay dropped items, run it on
  `desktop,phone-landscape,phone-portrait`): the football hits a Wasen
  visitor and the Brezel falls (shots while falling and lying on the street,
  not caught at once), riding on picks it up without a jump (`itemCaught`,
  `carriedItem`), kid mode drops a Lebkuchenherz instead of the Maßkrug, a
  picked-up Maßkrug is drunk by itself `BEER_AUTO_DRINK` after the pickup
  (the street is cleared meanwhile so no crash costs it), a pickup replaces
  the carried item, and one-tick taps started a little later each time until
  one collects the item mid-air (`player.grounded` false at the catch).
  `window.__gameplay.drops()` checks the item while it falls, that it lies
  on the street ahead of the skater, and that it is gone after the pickup.
- `scripts/scenarios/items-ui.ts` (ui, all three viewports): title and
  pause key hints, the item control while carrying each item (desktop "E"
  chip; touch: the first-catch hint once the zone banner is gone, and a real
  tap on the item button uses the item and does not jump), the merged item popups via `__ui.itemPopups`, the drunk look from
  easing in to easing out (`setDrunk`), and kid mode with a drunk timer
  (no drunk look).
- `scripts/scenarios/gameplay.ts`: a solver bot (real jump arcs, ducking)
  rides 60 s on seed 1 through all zones, nothing spawns inside the view, a
  rail grind, a run without input ends in game over; again at 427 px.
- `scripts/scenarios/zones.ts`: example scenario, a canvas shot per zone.
- `scripts/scenarios/audio-pwa.ts` (production build): manifest, icons and
  service worker, audio unlock on the first real input, a sound for every
  gameplay event (`window.__audio.log`), mute across reloads, offline reload
  after a simulated deploy.
- Final personas: `final-keyboard.ts` (real key events, `desktop,laptop`;
  its top-speed run pins gameplay's `TOP_SPEED`),
  `final-phone-touch.ts`, `final-phone-rotate.ts` (portrait, then rotating:
  rotate hint, pause on rotation, nothing cut off) and `final-casual.ts`
  (a first-timer).
- `scripts/scenarios/final-phone-touch.ts`: a held touch only jumps after the
  swipe window, so its bench-grind bot plans `SWIPE_WINDOW` ticks ahead
  (`ahead(state)`), like a player who learnt the lag.
- `default.ts`, `gameplay.ts`, `world.ts`, `ducking.ts`, `chill.ts`,
  `items.ts`, `items-ui.ts`, `drop.ts` and `final-phone-touch.ts` call `dismissRotateHint(t)`
  (`playtest-lib.ts`) first (and after a reload), so they also run on
  phone-portrait, where the rotate hint takes the first tap and would
  otherwise keep the run paused.
  Loops that wait for game progress use `stepWhile(t, more, {max})` or check
  the mode, so a stopped run fails with a message instead of hanging.

- `scripts/scenarios/stunts.ts` (stunt lines; run it on
  `desktop,phone-landscape,phone-portrait`): first a kicker without a ledge
  (`launch`, the skater lands on the street, the line ends incomplete, no
  crash and no health lost); that ride also measures where the skater comes
  down to ledge height. An air trick (Stunt Wave B): a kicker alone, down
  held for 2 ticks (`input.duck`) 4 ticks after `launch`, sets
  `player.airTrick`, and the street landing scores one `airTrick` (ticks and
  points > 0, "Air-Trick! +…" popup), no crash. Then in each zone a kicker and a ledge there are
  placed together as one line: `launch` from the kicker, `grindStart` on the
  ledge, one `stuntStep` (step 2 of 2 at x2: the first piece made starts the
  line quietly, there is no "Combo x1!") and a completed
  `stuntEnd` (made 2, line bonus > 0), with no crash and no health lost. On
  desktop a 100 s ride without input checks that the spawner brings >= 2
  lines and that no `kicker` / `ledge` crash happens.
- `scripts/scenarios/nordiy.ts` (NorDIY skatepark, ROADMAP 36; run it on
  `desktop,phone-landscape,phone-portrait`, `--name nordiy`): a frozen run
  in Bad Cannstatt at a pinned 120 px/s, the street cleared, a park planned
  with `window.__gameplay.park()` (without the hook it logs that and rides
  until the spawner plans one, else fails "a NorDIY park is planned").
  Shots: the approach (park start just inside the right edge), the "NorDIY"
  sign container at the view centre, the first bank launch with an air
  trick, a grind on each container and the crane, the crowd by the crane
  in kid mode (`__player.kidMode`, lemonade instead of beer), the high five and
  the "Session!" callout. The high five is a use press when the
  `highFiver`'s centre reaches the skater: real key E on desktop,
  `input.use()` on touch. On a container before a gap the skater jumps at
  the middle of the take-off window onto the next container or the crane
  (`jumpWindow` from `src/gameplay/stunt-sim.ts`, like the StuntBot);
  otherwise he rolls off onto the next bank. Checks: the plan has banks,
  containers and the crane; every container and the crane is grinded;
  one `highFive` for that entity with points and no `itemUsed`;
  `sessionCheer` levels in 0..1; one `sessionEnd` with points; no crash and
  no health lost from the park's start on; no vehicle over the park's
  screen span while in it (`__world.traffic()`; a vehicle leaving the
  screen elsewhere is fine). The log `park ride` lists the events and the
  audio cues heard (for the boombox and cheers).
- `scripts/scenarios/update-hint.ts` (production build, run it with
  `--viewports desktop`; any viewport works): the service worker controls the
  page, a reload of an unchanged deploy leaves `state.updateReady` off, then a
  simulated deploy (routes serve a page that references a copy of the bundle
  under a new name) makes the page receive `updateReady` after one online
  start, and the next reload runs the new build from the cache. The worker
  logic itself has unit tests in `src/core/sw.test.ts` (sw.js in a vm with
  fake caches, network and clients).

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
`endRun`, `eventsSince`, `display`, `simulateInstall` and `promptsShown`.

Changelog and install state: `scripts/scenarios/version-install.ts` checks
that a first visit stores the running build silently, that an older stored
`lastSeenVersion` (localStorage `cannstatt-cruiser:lastSeenVersion`, JSON)
fills `state.whatsNew` after a reload, the visit count, the fake prompt and
the platform detection for iPhone and Android user agents. To show the
"what's new" screen by hand, set that key to an older version and reload.

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

### Wave 5c measurements (2026-10-08, seed 1, 20 s, `PLAN_WORK_PER_TICK` 400)

Measured on the Wave 5b commit plus the Wave 5c work in the working tree
(planning budget 400, `PLAN_AHEAD` 3, auto-drink, ui / audio polish),
headless, against a preview build (`--url`):

| Run | 0 / 1 / 2+ updates per frame | Long frames > 20 ms | Frame work mean / p99 / max | Scroll steps (px per frame) | Heap rise per frame | GC count / longest |
|---|---|---|---|---|---|---|
| desktop | 0 / **100 %** / 0 | 0 | 0.63 / 1.4 / 3.9 ms | 1: 528, 2: 678 | 18.2 KB (20.4 KB on a second run) | 27 / 2.2 ms |
| phone-landscape, CPU x4 | 0 / **100 %** / 0 | 0 | 2.5 / 6.6 / 17.3 ms | 1: 531, 2: 681 | 19.2 KB | 30 / 12.8 ms |

- The planning budget removed the 10-86 ms spawner spikes of Wave 5a: the
  longest gameplay update is now 2.3 ms (desktop) / 6.5 ms (phone, CPU x4),
  gameplay update mean 0.08 / 0.31 ms. With the budget at 400 no frame
  missed a vsync in either run (an earlier run with 1000 units per tick had
  a few single missed frames, longest gameplay update 7.7 ms).
- Heap rise per frame is back at the Wave 5a level (18.5-20.4 KB); a run
  during the 5b / 5c work in progress had shown 10.6 KB. GC pauses stay
  short (longest 2.2 ms desktop, 12.8 ms phone x4).
- Per-system render means (desktop / phone x4): world 0.18 / 0.83 ms, ui
  0.18 / 0.67 ms, gameplay 0.09 / 0.37 ms, player 0.03 / 0.11 ms. The
  longest phone frame work (17.3 ms) is a single render spike, mostly
  gameplay render (max 9.3 ms), the next place to look.
