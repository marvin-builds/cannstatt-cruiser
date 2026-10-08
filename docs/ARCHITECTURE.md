# Architecture

Vite + TypeScript (strict) + Canvas 2D, with no game engine. Everything is drawn
into an offscreen buffer that is 180 view pixels high and 320-427 wide
(adaptive, see [View size](#view-size-adaptive-width)), and then presented with
integer nearest-neighbour scaling.

## Module map

```
index.html              canvas#game, viewport/touch CSS, PWA <link>s
src/main.ts             composition root: lists the systems in update order (do not edit from slices)
src/types.ts            shared contracts: GameState, System, events, context (foundation-owned)
src/changelog.ts        CHANGELOG (newest first), BUILD_VERSION, changesSince(), compareVersions() (see Changelog)
src/core/               engine pieces (foundation-owned, slices only import from here)
  config.ts             VIEW_W (min width)/VIEW_MAX_W/VIEW_H, GROUND_Y, TICK_DT, PLAYER_X, speeds (BASE_SPEED 90, MAX_SPEED 165), health, DRUNK_DELAY_MIN/MAX, DRUNK_HOLD_WOBBLE, START_ZONE
  chill.ts              chill effect timing shared by gameplay and ui: CHILL_DURATION, ease in/out, chillStrength(timer)
  game.ts               Game: state, bus, rng, buttons, mode machine, tick(), render(), hotspots (InputHotspot: hold + keys)
  state.ts              createInitialState(), createPlayer(), resetRun()
  modes.ts              nextMode(mode, command): title -> playing <-> paused -> gameover -> playing/title
  loop.ts               FixedTimestep accumulator (60 Hz, clamp, timeScale, vsync snapping, see Frame loop)
  drunk.ts              drunk input: DelayedButton (action/duck edges held back, holds wobbled while drunk), drunkDelay(), drunkHoldWobble(), drunkWindow() for the solver
  perf.ts               FrameProbe: allocation-free per-frame timing for scripts/frametimes.ts (window.__game.perf)
  action.ts             ActionButton: multi-source button with pressed/held/released/holdTime
  input.ts              DOM binding: keys (hotspots first, then action, duck), pointer (mouse+touch, tap vs swipe down), blocks scroll/zoom/menus
  renderer.ts           offscreen buffer (resized to the view width), integer scaling, letterbox colour, capture()
  scaling.ts            computeLayout() (scale + adaptive view width), screenToView() (pure math)
  sprite-data.ts        parseSprite(), rowsFromString() (pure)
  sprite.ts             Sprite / sprite(): palette + string art -> cached canvases, frames, flip
  font-data.ts          bitmap font glyphs (A-Z a-z ÄÖÜäöüß 0-9 punctuation, ×), measureText()
  font.ts               drawText(g, text, x, y, {color, scale, align, shadow}); glyphs cached per colour
  rng.ts                Rng (mulberry32): next/range/int/pick/chance
  events.ts             EventBus<E>: on/onAny/emit
  storage.ts            store.get(key, fallback) / store.set(key, value): safe namespaced localStorage; createMemoryStore() for tests
  fullscreen.ts         toggleFullscreen() with webkit + iOS fallback, landscape lock
  testhook.ts           window.__game (see docs/TESTING.md)
  update.ts             handleServiceWorkerMessage(): sw.js `updateReady` -> state.updateReady (see Update signal)
  version.ts            loadWhatsNew() / markVersionSeen(): store key lastSeenVersion -> state.whatsNew (see Changelog)
  install.ts            InstallController, detectInstallEnvironment(): state.install, beforeinstallprompt (see Install hint)
  app.ts                startApp(systems): wires everything in the browser, registers ./sw.js and its message listener
src/player/ world/ gameplay/ audio/ ui/   feature slices (one factory each in index.ts); notable shared-contract modules:
  world/zones.ts        ZoneRoute: START_ZONE, ROUTE_CYCLE, gateway distances (see Zones)
  world/art/gateways.ts gateway landmarks per crossing, looked up by from / to zone
  world/traffic.ts      Stuttgart-Mitte foreground traffic: LANES, VEHICLES, TRAFFIC_TOP / FRONT_TOP / EXHAUST_TOP, trafficDensity() (see Mitte traffic)
  world/art/traffic.ts  vehicle and exhaust art: drawBackTraffic (world layer), drawFrontTraffic (fx layer), smog haze
  world/art/mombach.ts  the Mombachquelle scene on the far Neckar bank (mid layer, see Zones)
  world/debug.ts        window.__world (test only): trafficDensity(), traffic() {vehicles, puffs, shake}
  gameplay/fairness.ts  human take-off windows (takeoffWindowAt), people margins
  gameplay/rules.ts     contact rules shared with the solver (landsOnRail/Ledge, pastLedge, landsOnHead, STOMP_DEPTH, stompReach)
  gameplay/stomp.ts     stompPeople(): stomp detection and knockOver (see Stomp and carried items)
  gameplay/testing.ts   test / playtest tooling: HumanBot, planJump, planStomp (DOM-free, not used by the game)
  gameplay/stomp-bot.ts test tooling: stomp window per scene (stompWindow, humanStomp) and rideStomping runs
  gameplay/use.ts       the use button: drink / eat / throw the carried item (DRUNK_DURATION, EAT_BONUS_POINTS)
  gameplay/auto-drink.ts  a carried Maßkrug is drunk by itself after BEER_AUTO_DRINK (6 s)
  gameplay/ball.ts      the thrown football entity: hits, ricochet (ricochetRoom), BALL_HIT_POINTS
  gameplay/grind-trick.ts  grind trick scoring (GRIND_TRICK_POINTS per tick), emits grindTrick
  gameplay/spawner.ts   pattern planning ahead on a per-tick work budget (see Planning budget), drunk planning
  ui/popup-feed.ts      one tick's events -> merged popups ("Stomp! +150"); ui/popups.ts draws them (PopupPool)
  ui/hud-model.ts       HUD plate texts and layout, rebuilt only on change (allocation-free per tick)
  ui/item-button.ts     touch item button / desktop "E" chip, first-catch hint (storage key itemHintSeen)
  ui/drunk-look.ts      drunk HUD row and woozy screen (sway, vignette); ui/item-look.ts catch popups
  ui/trick-hint.ts      grind trick hint under the skater while grinding (storage key grindTrickSeen, see Grind trick)
  audio/traffic.ts      TrafficNoise: Mitte rumble level (ducked under gameplay sounds), rng-free horns and truck passes from state.trafficDensity
  player/bin.ts         bin crash: the bin the player draws around the skater
scripts/playtest.ts     Playwright playtest CLI; scripts/playtest-lib.ts; scripts/scenarios/*.ts
scripts/frametimes.ts   frame-time measurement in Chromium (see docs/TESTING.md, Frame times)
```

## Ownership

Every slice owns exactly one directory. Inside it the slice may create any files
(sprites, sub-modules, tests). It must keep `index.ts` exporting the factory
listed below. Slices **never** edit `src/main.ts`, `src/core/`, `src/types.ts`
or another slice's directory. If a contract change is needed, report it so the
foundation owner can extend it.

| Path | Owner | Factory / content | Responsibilities |
|---|---|---|---|
| `src/core/`, `src/types.ts`, `src/changelog.ts`, `src/main.ts`, `index.html`, configs, `scripts/`, `docs/`, `CLAUDE.md` | foundation | `startApp`, `Game` | loop, renderer, input, modes, RNG, bus, sprites, font, storage, test hook, playtest harness |
| `src/player/` | player | `createPlayerSystem()` | skater + longboard sprites and animations, jump physics (variable height, coyote, buffer), ducking, grind riding, crash/stumble anim, `state.player` incl. `hitbox` and `invulnerableTimer` |
| `src/world/` | world | `createWorldSystem()` | parallax zones (3-4 layers), the distance-driven zone route (see [Zones](#zones-the-distance-driven-route)), ground, `state.zoneIndex`, letterbox colour |
| `src/gameplay/` | gameplay | `createGameplaySystem()` | obstacles, people (with their items), rails, grindable bench, stars, joint (`state.entities`), spawner + clearability (jumps, ducks, grinds, moving people, chill jump, stomp bounce) and human margins around people, difficulty (`state.speed`), the chill effect (`state.chillTimer`), collisions, stomps and the tossed item (`state.carriedItem`), score/combo/multiplier, health, gameplay events |
| `src/ui/` | ui | `createUiSystem()` | title, HUD (incl. chill and drunk timers), chill tint, drunk look, item button / chip, item and trick popups, pause, game over, highscore + star total persistence, mute + fullscreen buttons (hotspots, touch-sized on phones), portrait hint, the hidden settings menu and `state.kidMode` (load at startup, persistence, parent check) |
| `src/audio/`, `public/`, `.github/` | audio/pwa | `createAudioSystem()` | WebAudio SFX from events, unlock via `onUserGesture`, mute persistence; manifest, pixel-art icons, service worker, GitHub Pages workflow |

PWA files that `index.html` and `app.ts` already reference (the PWA slice
creates them in `public/`):
- `manifest.webmanifest`
- `icons/icon-192.png`, `icons/icon-512.png`, `icons/apple-touch-icon.png`
- `sw.js` (registered only in production builds, and only once it is served as
  JavaScript)

### Update signal (ROADMAP item 15)

- `public/sw.js` posts `{type: 'updateReady'}` to every window
  (`clients.matchAll({type: 'window', includeUncontrolled: true})`) when a
  reload would start a newer, fully cached build:
  - the background page refresh stored a **changed** page (a new deploy)
    after all its assets were cached (`storePage`, never on the first install
    and never when an asset download fails, so the old build stays complete);
  - a new worker version activates and an older version's cache held a
    different page than the one it just cached (`dropOldCaches`).
- Core (`app.ts`, production only, same guard as the registration) listens on
  `navigator.serviceWorker` and passes `MessageEvent.data` to
  `handleServiceWorkerMessage` (`core/update.ts`), which sets
  `state.updateReady = true` for that message and ignores everything else.
- `state.updateReady` is never cleared (only a reload resets the page) and
  `resetRun` keeps it. The ui reads it to show the reload hint (title and
  pause screens only) and calls `ctx.commands.reloadForUpdate()` from the
  hint's hotspot; core reloads the page (`location.reload()` through the
  `Platform`, a no-op in tests).
- A message can be lost if the worker finishes before the loading page exists
  as a client; the next start then already runs the new build, so nothing is
  missed for long.
- Tests: `src/core/sw.test.ts` runs `public/sw.js` against in-memory caches,
  network and clients; `scripts/scenarios/update-hint.ts` checks it end to
  end on the preview build; `window.__game.simulateUpdateReady()` sets the
  flag without a deploy (docs/TESTING.md).

### Changelog ("Neu in dieser Version", ROADMAP item 16)

- `src/changelog.ts` holds `CHANGELOG: ChangelogEntry[]`, newest first, with
  `{version, date, items}`. `version` is `YYYY-MM-DD.n` (the deploy date and
  that day's build number, compared numerically by `compareVersions`), `date`
  its date part. `BUILD_VERSION` is the newest entry's version: the running build.
- **The orchestrator adds an entry for every deploy** (a new `.n` on the same
  day), before the deploy commit. Items are short German bullet points: at
  most `CHANGELOG_ITEM_MAX_CHARS` = 40 characters in game-font glyphs and
  `CHANGELOG_MAX_ITEMS_PER_ENTRY` = 6 per entry. Kid mode shows them too, so
  they never mention drugs or alcohol (`src/changelog.test.ts` checks all of this).
- At startup (Game constructor, before the systems' `init`) core reads the
  store key `lastSeenVersion` (`core/version.ts`):
  - nothing or junk stored (first visit): it stores `BUILD_VERSION` at once
    and `state.whatsNew` stays empty, so first-timers never see the screen;
  - otherwise `state.whatsNew = changesSince(lastSeen, CHANGELOG)`: the
    entries newer than the stored version, newest first, capped to
    `WHATS_NEW_MAX_ITEMS` = 6 items in total (entries left empty are dropped).
    Empty when the running build was already seen.
- The ui shows the screen while `state.whatsNew` is non-empty (before the
  normal title) and calls `ctx.commands.markVersionSeen()` when the player
  closes it: core stores `BUILD_VERSION` and empties `state.whatsNew`.
  `resetRun` keeps `whatsNew`.

### Install hint (ROADMAP item 18)

`state.install` (`InstallState`, `core/install.ts`), written by core only and
kept across runs:

| Field | Meaning |
|---|---|
| `standalone` | already running installed: `matchMedia('(display-mode: standalone)')` or `navigator.standalone` (iOS) |
| `platform` | `'ios'` (iPhone / iPad, also iPadOS with the Mac desktop user agent plus touch points), `'android'`, or `'other'` |
| `canPrompt` | a `beforeinstallprompt` was captured (Chromium) and not used yet: show the "Installieren" button |
| `installed` | the browser reported `appinstalled` during this visit |
| `visits` | page loads so far including this one (store key `visits`, +1 per load) |
| `dismissed` | the player closed the hint with "×" (store key `installHintDismissed`) |

- `app.ts` reads the environment through `Platform.installEnvironment()`
  (`detectInstallEnvironment` over user agent, touch points, display mode)
  and forwards the window events to `game.install` (`InstallController`):
  `beforeinstallprompt` -> `capturePrompt` (calls `preventDefault()`, keeps the
  event, `canPrompt = true`); `appinstalled` -> `appInstalled` (`installed = true`,
  `canPrompt = false`). Tests and headless games get `{standalone: false,
  platform: 'other'}` and a memory store.
- `ctx.commands.promptInstall()` shows the kept prompt (call it from a
  hotspot's `onPress`, it needs the user gesture) and clears `canPrompt`; a
  prompt can be shown only once, a refused one is swallowed.
  `ctx.commands.dismissInstallHint()` sets and persists `dismissed`.
- The ui decides when to show the hint: touch device, not `standalone`, not
  `installed`, not `dismissed`, `visits >= 2`, on title or game over only; a
  button when `canPrompt`, otherwise "Teilen -> Zum Home-Bildschirm" on `ios`.
- Tests: `src/core/install.test.ts`; `window.__game.simulateInstall({...})`
  and `promptsShown()` for playtests; `scripts/scenarios/version-install.ts`
  checks both contracts end to end (docs/TESTING.md).

## Contracts (src/types.ts)

### System

```ts
interface System {
  name: string;
  init?(ctx: GameContext): void;                       // once, at startup
  update?(ctx: GameContext, dt: number): void;         // every fixed tick (dt = 1/60), in EVERY mode
  render?: Partial<Record<RenderLayer, RenderFn>>;     // per frame, per layer
}
```

- **Update order** is the array order in `main.ts`: world, player, gameplay,
  audio, ui. Each tick runs as follows:
  1. Input snapshot. The pause key toggles pause and the mute key toggles mute.
  2. All `update`s run.
  3. Core integrates `time` and `distance += speed*dt` while playing, and ends
     the run when `health <= 0`.
  4. In title/gameover an action press starts a run. Core does this after the
     systems ran, so that press is not also a jump.
- `update` runs in every mode, so check `ctx.state.mode`. Gameplay physics
  should only advance while `mode === 'playing'`.
- **Render layers**, back to front: `background`, `world`, `entities`, `player`,
  `fx`, `ui`. Core clears the buffer to the letterbox colour before drawing.
  Always draw at integer coordinates. `RenderContext` is `{g, state, alpha,
  display, scroll, scrollLead}`; draw scrolling things from `r.scroll` /
  `r.scrollLead` (see [Frame loop](#frame-loop-and-smooth-scrolling)). Core
  reuses the same context object every frame: read it, never keep it.
- Always reach state through `ctx.state` / `r.state` and don't cache sub-objects,
  because `resetRun` replaces `state.player` and `state.entities` at every run start.

### GameContext

| Member | Use |
|---|---|
| `state` | the single mutable `GameState` |
| `bus` | typed event bus (`GameEvents`) |
| `rng` | seeded `Rng`, re-seeded with `state.seed` at every run start. Use it for all gameplay randomness (never `Math.random`), so test runs replay deterministically. |
| `input` | this tick's `InputFrame`: `action`, `duck` and `use` (each `{pressed, held, released, holdTime}`), `pausePressed`, `mutePressed`. See [Input](#input-action-duck-and-use). |
| `display` | `{portrait, touch, fullscreen, viewWidth, viewHeight}`. `viewWidth` is the current view width (320-427) and changes live; also on `RenderContext.display`. |
| `speedOverride` | speed forced by the test hook (`setSpeed`), or `null`. While set, core pins `state.speed`; difficulty code must not write it. |
| `commands` | `startRun, pause, resume, gameOver, toTitle, setMuted, setZone, toggleFullscreen, setLetterboxColor, useItem` (presses `use` for one tick), `reloadForUpdate` (reloads the page; see [Update signal](#update-signal-roadmap-item-15)), `markVersionSeen` (see [Changelog](#changelog-neu-in-dieser-version-roadmap-item-16)), `promptInstall`, `dismissInstallHint` (see [Install hint](#install-hint-roadmap-item-18)) |
| `addHotspot({rect, onPress})` | screen region (view px) that swallows pointer presses instead of jumping. `onPress` runs inside the DOM event, so fullscreen/audio APIs work there. Later hotspots win. Pass an `InputHotspot` (see below) for holds and keys. |
| `onUserGesture(fn)` | runs `fn` inside every key/pointer DOM event (WebAudio unlock) |

### GameState field owners

| Field | Written by |
|---|---|
| `mode`, `modeTime`, `frame`, `time`, `distance`, `seed`, `muted` | core (via commands) |
| `updateReady` | core, from the service worker's `updateReady` message ([Update signal](#update-signal-roadmap-item-15)); kept across runs, the ui only reads it |
| `whatsNew` | core: at startup and on `commands.markVersionSeen()` ([Changelog](#changelog-neu-in-dieser-version-roadmap-item-16)); kept across runs |
| `install` | core: at startup, from the browser's install events and `commands.promptInstall` / `dismissInstallHint` ([Install hint](#install-hint-roadmap-item-18)); kept across runs |
| `speed`, `score`, `combo`, `multiplier`, `stars`, `health`, `entities`, `chillTimer`, `carriedItem`, `drunkTimer` | gameplay (`speed` is pinned by core while `ctx.speedOverride` is set; core zeroes `chillTimer` and `drunkTimer` at every run start; core reads `drunkTimer` for [drunk input](#drunk-input)) |
| `player.*` (position, velocity, grounded, grinding, grindTrick, state, hitbox, invulnerableTimer) | player (gameplay changes grinding / crash only through the events it emits, and only reads `invulnerableTimer` and `grindTrick`; see below and `src/player/CONTRACT.md`) |
| `zoneIndex` | world (and `commands.setZone`); `resetRun` sets `START_ZONE` |
| `trafficDensity` | world, every tick (0..1, see [Mitte traffic](#mitte-traffic)); audio reads it for the traffic noise |

Coordinates are screen space in view pixels, with y pointing down. The world
scrolls, while the player stays near `PLAYER_X`. `player.x/y` is the board's
contact point (y = `GROUND_Y` on the ground). Entities move left by
`speed * dt` per tick.

Collision handoff between player and gameplay: gameplay detects collisions
using `player.hitbox` and emits `crash` / `grindStart` / `grindEnd`. The player
system listens to these events to play the crash animation, or to snap onto
and ride the rail (gameplay passes the rail's entity id; the player reads its
rect from `state.entities`). The bench is grindable the same way: its entity
`y` (the backrest's top edge) is the rail top, see [Bench](#bench-ledge-contract).
A crash into a bin swallows the skater, see [Bin crash](#bin-crash). People (`vfbFan`,
`wasenGuest`) walk or sway: their entity `x` follows `data.ax` (the street
anchor) plus a motion that depends only on the distance to the player
(`gameplay/motion.ts`), and the collision box moves with them. Landing on a
person's head while falling is a stomp, not a crash (see
[Stomp and carried items](#stomp-and-carried-items)).

### InputHotspot (core/game.ts)

A core extension of the shared `Hotspot` for hold gestures and modal
screens. Every hook is optional; build it as a typed `const` and pass it to
`ctx.addHotspot`:

| Hook | Called |
|---|---|
| `onRelease()` | the pointer press this hotspot took ended (up, cancel, focus lost) |
| `onKeyDown(code)` | while `rect()` is non-null, every key press (`KeyboardEvent.code`) is offered to the hotspots, topmost first, before it reaches a button. Return true to take it: its button is not pressed, auto-repeats are ignored and the release goes to `onKeyUp`. |
| `onKeyUp(code)` | a key this hotspot took went up (or focus was lost) |

The ui slice uses it for the title logo (long press by pointer or K) and for
the open settings menu, which takes every key but M so nothing starts a run
behind it. (Suggested later: move these hooks into `Hotspot` in `src/types.ts`.)

### Events (`GameEvents`)

| Event | Payload | Emitted by |
|---|---|---|
| `runStarted` | `{seed}` | core |
| `gameOver` | `{score, stars, distance}` | core |
| `pause` / `resume` | `{}` | core |
| `mute` | `{muted}` | core (`commands.setMuted`, M key) |
| `zoneChanged` | `{index, previous}` | core (`commands.setZone`); world calls `setZone` when it advances |
| `jump` | `{velocity}` | player |
| `land` | `{impact}` | player |
| `grindStart` | `{entityId}` | gameplay |
| `grindEnd` | `{entityId, ticks}` | gameplay |
| `grindTrick` | `{entityId, ticks, points}` | gameplay (a [grind trick](#grind-trick) ended while still on the rail or bench) |
| `obstacleCleared` | `{entityId, kind, points}` | gameplay |
| `crash` | `{entityId, kind, health}` | gameplay (kind `'bin'`: the skater is stuck in the bin, see [Bin crash](#bin-crash)) |
| `starCollected` | `{entityId, stars}` | gameplay |
| `chillStart` | `{entityId, duration}` | gameplay (joint, or bubble gum in kid mode, picked up; `state.chillTimer = duration`) |
| `stomp` | `{entityId, kind, item}` | gameplay (the falling skater landed on a person's head; the player bounces on the next tick) |
| `itemCaught` | `{item}` | gameplay (the tossed item reached the hands; `state.carriedItem = item`) |
| `itemUsed` | `{item, action}` | gameplay (use button with an item in hand; `action` is `'drink' \| 'eat' \| 'throw'`; clears `state.carriedItem`) |
| `drunkStart` | `{duration}` | gameplay (Maßkrug drunk; `state.drunkTimer = duration`) |
| `healthGained` | `{health}` | gameplay (Brezel / Lebkuchenherz eaten; the new health) |
| `ballThrown` | `{entityId}` | gameplay (the football left the hands as a `ball` entity) |
| `ballHit` | `{entityId, kind}` | gameplay (the thrown ball hit a person: the person's id and kind) |
| `ballBack` | `{entityId}` | gameplay (a missed ball ricochets back towards the skater; the ball's id) |
| `scoreChanged` | `{score, delta, combo, multiplier}` | gameplay |

Usage: `const off = ctx.bus.on('crash', (e) => ...)`. Subscribe in `init`.
Emitting is synchronous.

## Input: action, duck and use

`InputFrame` has three logical buttons with the same `ActionSnapshot` shape:

| Button | Sources |
|---|---|
| `action` | Space, ArrowUp, W, mouse button, touch tap / hold anywhere |
| `duck` | ArrowDown, S (held while the key is down); a swipe down on touch (held for `SWIPE_DUCK_TICKS` = 72 ticks, 1.2 s, or until the next tap turns into a jump; another swipe restarts it); test hook `input.duck`. Held while grinding it is the [grind trick](#grind-trick) |
| `use` | E (held while the key is down); `commands.useItem()`; test hook `input.use()` |

Key hints for players: Space / ↑ / W jump, ↓ / S duck, **E use item**, P / Esc
pause, M mute.

**Use on touch and mouse:** pointers have no default for `use` (a tap
anywhere jumps). The ui shows an item button while `state.carriedItem` is set
and registers it as a hotspot whose `onPress` calls `ctx.commands.useItem()`.
That presses and releases `use` in one go, so the next tick sees
`use = {pressed: true, released: true, held: false}`, exactly like a tapped
key, and the pointer press never reaches the action. Systems react to
`input.use.pressed` only (no holds), so key and button behave the same:

```ts
const itemButton: Hotspot = {
  rect: () => (ctx.state.carriedItem && ctx.state.mode === 'playing' ? itemRect(ctx.display) : null),
  onPress: () => ctx.commands.useItem(),
};
ctx.addHotspot(itemButton);
```

### Drunk input

While `state.drunkTimer > 0` **and** the mode is `playing`, `core/drunk.ts`
holds back every press and release of `action` and `duck` by a random
`DRUNK_DELAY_MIN`..`DRUNK_DELAY_MAX` (8..20, ~130-330 ms) extra ticks and
wobbles every delayed press's hold (`core/config.ts`, tuning pinned by
`core/drunk-tuning.test.ts`):

- each edge draws its own delay, so the release delay alone stretches or
  shortens a hold by up to `MAX - MIN` ticks;
- **hold wobble** (ROADMAP 21): each delayed press also draws
  `-DRUNK_HOLD_WOBBLE..+DRUNK_HOLD_WOBBLE` (10) ticks; its release is
  delivered that much later / earlier, so a tap can become a high jump and a
  long hold a small one. The release never arrives before the press and a
  delayed press is always held at least 1 tick (no same-tick tap while
  drunk). A press that passes through sober (no delay) is never wobbled; a
  sober release of a press queued while drunk still gets that press's
  wobble;
- order per source is kept and no press is ever dropped;
- delays and wobbles come from a separate rng seeded from the run seed at
  every run start (per press: delay, then wobble; per release: delay), so
  runs replay deterministically and the gameplay rng (`ctx.rng`) is
  untouched;
- `use`, pause and mute are never delayed; focus loss and game over release
  everything at once and drop queued edges.

Gameplay's solver validates drunk patterns with
`drunkWindow(holdTicks)` → `{pressMin, pressMax, holdMin, holdMax}`: every
take-off from `pressMin` to `pressMax` ticks late with any hold in
`[holdMin, holdMax]` must clear the pattern, where the hold may change by
`DRUNK_DELAY_MAX - DRUNK_DELAY_MIN + DRUNK_HOLD_WOBBLE` (22) ticks either way
and `holdMin >= 1`. `drunkDelay(rng)` / `drunkHoldWobble(rng)` draw single
values for simulations. Under the hood `Game.buttons.action` / `.duck` are
`DelayedButton`s (same `press/release/releaseAll/tick` interface as
`ActionButton`; their `DelayClock` gives `frame()`, `delay()` and
`holdWobble()`, both 0 while sober), so tests and the test hook press them
as before.

`core/input.ts` maps DOM events through two DOM-free pieces that unit tests
drive directly: `keyDown/keyUp(game, code)` and `PointerControls`
(`down/move/up/cancel(id, viewX, viewY)`). The player decides what duck does
(on the ground only; jump wins over duck), see `src/player/CONTRACT.md`.

### Touch: tap vs swipe down

A touch cannot be told apart from the start of a swipe when the finger lands,
yet a swipe down must never also jump. So a touch **during a run** stays
undecided for at most `SWIPE_WINDOW` = 5 ticks (~83 ms):

- the finger travels `SWIPE_DISTANCE` = 4 view px (straight-line distance,
  ~8 CSS px on a phone in landscape) roughly down, i.e. `|dx| <= dy *
  SWIPE_SLOPE` (1.2, up to ~50 degrees from vertical, so sloppy ~45 degree
  swipes count): duck, and this touch never presses the action;
- the finger lifts (a tap), or travels `SWIPE_DISTANCE` any other way
  (sideways / up): the action is pressed right then (a lifted tap arrives as
  press + release in the same tick = small ollie);
- the window runs out with the finger still down: the action is pressed and
  held from then on (hold = high jump).

Tradeoff: a touch jump during a run starts up to ~83 ms later than the finger
lands (a quick tap: when the finger lifts, which is usually sooner), and a
held touch counts its hold time from the decision. Keyboard and mouse presses,
and touches on the title, pause and game-over screens, are not delayed at all.
Hotspots still take presses first.

## Frame loop and smooth scrolling

`app.ts` runs `FixedTimestep` (`loop.ts`) once per `requestAnimationFrame`:
0..n fixed 1/60 s ticks, then one render.

- **Vsync snapping:** rAF timestamps jitter around the display interval. Fed
  raw, an accumulator near a step boundary ran 0 updates in one frame and 2 in
  the next (measured: 8 % of frames at 60 Hz, a visible hitch). The loop
  estimates the display cadence (median of the last 15 frames, snapped to
  60 / 120 / 30 Hz within 4 %) and snaps each frame's elapsed time to a whole
  number of display frames when within 25 %. Result: exactly one tick per
  frame at 60 Hz, clean alternation at 120 Hz, even spreading at 144 Hz, and a
  missed vsync still catches up. Game time follows the display (a 59.94 Hz
  screen runs the game 0.1 % fast instead of hitching every 16 s).
- **Interpolated scroll:** `RenderContext.scroll` is `state.distance` plus
  `scrollLead = alpha * speed * TICK_DT` while playing (else 0), i.e. where
  the street is at the moment of the frame. Systems use `r.scroll` instead of
  `state.distance` for parallax / ground offsets and draw street-bound
  entities at `Math.round(e.x - r.scrollLead)`. At 60 Hz `alpha` is ~0 (no
  visible change); at 120/144 Hz and after a missed frame the street then moves
  in even steps instead of 0 / 3 px jumps. The player stays at its tick
  position (it does not scroll).
- **No per-frame allocation in core:** `Game.render` reuses one render
  context, `Sprite.draw` looks frames up by index (no key strings),
  `drawText` draws cached glyph canvases (one `drawImage` per character
  instead of one `fillRect` per font pixel). Keep slices allocation-free in
  render and update too: no template strings, spreads, `map`/`filter`,
  closures or object literals per frame in hot paths, and index loops
  (`for (let i = 0; ...)`) instead of `for-of`, which allocates an iterator.

## View size (adaptive width)

The view is always `VIEW_H` = 180 view pixels high. Its width adapts to the
screen so wide phones are filled instead of letterboxed:

- The scale is the largest integer device-pixel factor at which the minimum
  320x180 view fits. The width then becomes `floor(screenWidthDevicePx / scale)`,
  clamped to `VIEW_W` = 320 .. `VIEW_MAX_W` = 427 (about 21:9), so spare width
  is used whether the height or the width limits the scale. Leftover margins
  (under one view pixel, or beyond 21:9) stay letterboxed; the spare height of
  screens narrower than 16:9 stays letterboxed too. Examples: 1280x720 @1 ->
  scale 4, width 320; 1440x900 @1 -> scale 4, width 360; 1512x982 @2 -> scale
  9, width 336; 844x390 @3 (2532x1170 device px) -> scale 6, width 422;
  3440x1440 -> scale 8, width 427; portrait 390x844 @3 -> scale 3, width 390.
  Only a window smaller than 320x180 device px gets a fractional scale at 320.
- Core recomputes it on `resize`, `visualViewport` resize, `orientationchange`
  and `fullscreenchange`, resizes the buffer and updates `display.viewWidth`.
  There is no event: read `ctx.display.viewWidth` / `r.display.viewWidth`
  every tick or frame and never cache it.

Rules for every slice:

- **Never assume 320 wide.** Fill backgrounds, ground and overlays across
  `display.viewWidth`; tile parallax layers until `x >= viewWidth`.
- **Right-anchored UI** (pause/mute/fullscreen buttons, right-aligned HUD) is
  placed at `display.viewWidth - margin - w`, for both drawing and the hotspot
  rect (compute the rect inside `rect()`, not once at init). Centred text uses
  `Math.floor(viewWidth / 2)`. Content that must always be visible fits in the
  320 px minimum.
- **Spawn entities off the right edge** at `x >= display.viewWidth` (plus the
  entity width as margin), and despawn once `x + w < 0`. Because the visible
  width differs per device, spawning depends on it; keep spawn *timing* based on
  distance so difficulty is the same on every screen.
- Hotspots and pointer input use view pixels; core maps client coordinates
  with `screenToView` for any width.

## Modes

```
title --start--> playing --pause--> paused --resume--> playing
                 playing --die--> gameover --start--> playing
                 paused/gameover --toTitle--> title
```

Invalid commands are ignored. Restart taps on the game-over screen are ignored
for `GAMEOVER_INPUT_DELAY` (0.75 s). P/Escape pauses and resumes, and on the
game-over screen it goes back to the title. An action press (Space, ArrowUp,
W) also resumes from pause; core does it after the systems ran, so that press
is not also a jump (a tap on the pause screen resumes through a ui hotspot). Losing window focus (`blur`) or
hiding the page (`visibilitychange`) releases every button (action, duck, undecided touches) and pauses a running game.

## Drawing sprites

```ts
import { sprite } from '../core/sprite';

const BIN = sprite({ g: '#3d7a46', d: '#24502c', k: '#111' }, [`
  .gggg.
  gddddg
  gggggg
  gddddg
  .k..k.
`]);
BIN.draw(r.g, frameIndex, x, y, { flip: false }); // top-left at rounded (x, y)
```

- `.` and space are transparent. Every other character must be in the palette,
  otherwise parsing throws.
- Frames must all be the same size. A frame is a template literal or a
  `string[]`. Frames are rasterised once and cached, including flipped copies.
- Define sprites at module level, never per frame.

Text: `drawText(g, 'Grüße', x, y, { color, scale: 2, align: 'center', shadow: '#000' })`.
`y` is the top of the line, which is 8 font pixels tall: umlaut row,
capitals 1-5, descenders 6-7. Measure with `measureText`.

## Zones: the distance-driven route

Zone indices: 0 Stuttgart-Mitte, 1 Neckar, 2 Bad Cannstatt. The zones follow
each other along the street; there is no time-based cycle.
`src/world/zones.ts` holds the schedule (`ZoneRoute`):

- **Start:** every run (and the title screen) starts in `START_ZONE` = 2, Bad
  Cannstatt (`core/config.ts`; `resetRun` sets `state.zoneIndex` to it, the
  world snaps its route to it on `runStarted` and when returning to the title).
- **Route:** the route rides back and forth along the river, always to a
  neighbouring zone: `ROUTE_CYCLE` = `[2, 1, 0, 1]`, i.e. Cannstatt -> Neckar
  -> Mitte -> Neckar -> Cannstatt -> ... `ZoneRoute.zoneOf(k)` is the zone of
  leg k (leg 0 = the start zone, leg k begins at gateway k). A snap to the
  Neckar continues towards Mitte. Playtests use `new ZoneRoute().zoneOf(k)`
  instead of hard-coding the order.
- Every zone lasts `ZONE_LENGTH` (3584 px) of ground distance. The point where
  one zone hands over to the next is a **gateway** (a landmark), aligned to
  the paving grid (`SEAM_GRID`).
- **Gateways** are looked up by the zones they connect:
  `world/art/gateways.ts` `gatewayTable(depth)[from][to]` (depth 0 far, 1
  mid, 2 near). The reverse direction of a crossing uses the same art
  mirrored (`reversed()`), so the zone left behind stays on the left. Neckar
  -> Mitte has its own near gateway: the tunnel portal into the city.
- The next zone streams in through the gateway: near layers first, far
  layers last, each parallax layer at its own scroll factor, and the sky
  palette blends over `PALETTE_BLEND` px around the gateway.
- When the gateway reaches the player (`distance` passes the boundary), the
  world calls `commands.setZone(next)`, which sets `state.zoneIndex` and emits
  `zoneChanged`. So `zoneIndex` changes exactly at the gateway; a run start
  emits no `zoneChanged`.
- The first gateway is `ZONE_LENGTH` away from the start. Any other `setZone`
  (test hook, playtests) **snaps**: the world shows that zone at once and the
  next gateway is a full zone length further.
- Gameplay mirrors the route (a `ZoneRoute` it snaps on the same events) so it
  knows the zone at any street distance: people are themed by the zone their
  pattern lies in (VfB fans at the Neckar, zone 1; Wasen visitors in Bad
  Cannstatt, zone 2). Playtests import `ZONE_LENGTH` instead of hard-coding it.
- **Mombachquelle** (`world/art/mombach.ts`): background scenery on the far
  Neckar bank (mid layer), after the real place and without any sign or name:
  at the foot of a green embankment a basin of light grey boulders juts into
  the river; left of it a stair climbs the embankment and a bench stands on a
  flat area by the water; a second bench on a terrace above the basin, the
  spring water leaving a culvert below it in a jet that splashes into the
  basin; a bin hanging on a tree upper right. Soft mid-palette people chill
  on both benches and one has the feet in the basin (six frames: splash,
  kicking foot, wave). Never an obstacle.

### Mitte traffic

In Stuttgart-Mitte big, dense traffic drives on the foreground street, close
to the camera (`world/traffic.ts`, art in `world/art/traffic.ts`). Two lanes
(`LANES`), each a fixed pool, never allocating while driving:

- **Back lane** (`front: false`): hatchbacks, sedans and vans driving with the
  skater (they always overtake him). Drawn in the **world** layer
  (`drawBackTraffic`, after the street), so under every entity. No body ever
  reaches above `TRAFFIC_TOP` = `GROUND_Y + 2` (the riding line stays free).
- **Front lane** (`front: true`): oncoming traffic that adds city buses and
  trucks (`VEHICLES`: `heavy`), wheels below the view edge. Drawn in the
  **fx** layer (`drawFrontTraffic`), over gameplay, so it starts at
  `FRONT_TOP` = `GROUND_Y + 7`: below the deepest thing gameplay draws under
  the riding line (the curb gap, 6 px).
- **Exhaust clouds**: every vehicle puffs see-through clouds that rise and
  drift (`PUFF_LIFE` 3.2 s; buses and trucks puff big diesel clouds more
  often). They are drawn with the back lane (under gameplay) and may rise
  above the riding line, but never above `EXHAUST_TOP` = `GROUND_Y - 44`.
- **Rumble**: while a bus or truck is on screen the traffic lanes shake by
  1 px (`Traffic.shake`, 0 or 1, toggling every 4 ticks).
- **Headlight flashes**: each vehicle flashes its headlights (a honk, two
  short blinks) every 2.5-7 s.
- A smoggy haze goes over the far layers while there is traffic.
- `traffic.test.ts` holds the limits; the playtest
  `scripts/scenarios/world.ts` checks them per vehicle / puff in a real run.

Traffic ramps in shortly before the Mitte gateway and out after it
(`trafficDensity(route, distance)`, 0..1). The world writes it to
`state.trafficDensity` every tick (0 outside a run); no other slice writes
it. Test hook: `window.__world` (`world/debug.ts`, see docs/TESTING.md).

**Traffic audio** (`audio/traffic.ts` `TrafficNoise`, `audio/sounds.ts`
`TRAFFIC_RUMBLE`): a layered rumble on one gain bus that follows a smoothed
`state.trafficDensity` (lowpassed road noise whose cutoff opens with the
level, tyre hiss and a throbbing engine drone of two detuned low saws). It is
silent unless playing and unmuted, and dips to `duckTo` (0.45) for ~8 ticks
whenever a gameplay sound plays, then glides back (traffic sounds never duck
it). One-shot cues are rng-free (a hash of the run-time slot): horns from
density 0.5 (`honk` car, `honkShort` small-car double beep, `hornDeep`
bus / truck; at most one per 1.5 s slot) and a passing truck (`truckPass`,
from density 0.6, at most one per 6 s slot). `window.__audio.log` records
`traffic:start` / `traffic:stop` and the cues.

## Settings menu and kid mode

- `state.kidMode` (default false = adult mode) is kept across runs by
  `resetRun`. The ui loads it in `init` (`store` key `kidMode`, junk or
  missing storage = false) and saves it on every change. Other slices only
  read it.
- The menu "Einstellungen" has no visible button. It opens on the title
  after holding the logo (`logoRect`, touch or mouse) or K for
  `LONG_PRESS_TIME` = 3 s; a thin progress bar under the logo shows only
  after `LONG_PRESS_HINT_DELAY` = 1 s. Letting go of the logo earlier is a
  normal tap and starts the run; K alone never does. The menu is drawn in
  mode `title` (core modes are unchanged) and swallows all taps and keys but M.
- Kindermodus turns on at once. Turning it off asks a parent check
  ("Wie viel ist a × b?", factors 6-9, `parentQuestion(state.frame)`, no
  gameplay rng) with three answers: right turns it off and returns to the
  menu, wrong closes the menu without change. Zurück and Escape close
  (Zurück on the check goes back to the menu). Keys: Enter / Space toggles,
  1-3 answer.
- Logic in `ui/settings.ts` (DOM-free: `LongPress`, `SettingsMenu`,
  `parentQuestion`, `loadKidMode` / `saveKidMode`), layout in
  `ui/layout.ts` (`settingsLayout`), drawing in `ui/screens.ts`.
- What kid mode changes: gameplay draws the joint entity as a pink bubble
  gum (`chillPickupArt`), the ui shows the gum HUD icon, a sweet pink tint and
  the popup "Kaugummi!" (`ui/chill-look.ts`); player and audio pick their own
  kid-mode look and sounds. No text, popup or art in kid mode refers to drugs.
  The effect's mechanics (timer, slowdown, lower jump) are identical.

### Tap sizes (ui/layout.ts `uiMetrics`)

| Display | HUD tap area / plate | Menu button height | ~CSS px per view px |
|---|---|---|---|
| desktop (no touch) | 14 / 14 | 18 | 4 |
| touch, landscape | 24 / 22, icons 2x | 24 | 2 |
| touch, portrait | 44 / 22, icons 2x | 44 | 1 |

So every tap area on a phone is >= ~44 CSS px; the HUD tap areas stay right
of x = 120 (clear of the stats plate) at every width from 320 to 427.
The pause button exists only during a run (`layout.ts` `riding`); on the
title and game-over screens mute and fullscreen move flush right into its slot.
All UI plates (HUD, buttons, zone banner, pause prompt, panels) are opaque.

### Popups (ui/popups.ts)

At most 3 popups show at once. A repeat of a live popup merges into it
("Stern! x3"). Events of one tick are collected by `ui/popup-feed.ts` and
flushed once per tick, so events that belong together become one popup:
a stomp with the points of its `obstacleCleared` "Stomp! +150" (a ball hit
"Treffer!", merged the same way with an `obstacleCleared` of the same person;
`ball.ts` scores through `addPoints` only, so it shows without points),
eating "Lecker! +1" with a heart (or "Lecker! +…" with the bonus at full
health), "Prost! Gluck gluck gluck" (never in kid mode), "Wurf!",
"Achtung, der Ball!" on a ricochet, "Autsch!" on a crash and
"Grind-Trick! +…". No popup rises above the HUD stats plate (`PopupPool.ceiling`;
stacks then grow downwards). Every popup has a 1 px ink outline; catch popups
and all popups in portrait are drawn at scale 2 (`popupScale`). The ui slice
shows "Stomp!" on `stomp`; gameplay adds the points.

## Stomp and carried items

Contract between gameplay, player, ui and audio (types in `src/types.ts`,
`STOMP_BOUNCE_VELOCITY` in `player/tuning.ts`):

- **Detection** (gameplay, `stomp.ts` `stompPeople`, rule `landsOnHead` in
  `rules.ts` shared with the solver): the player is not supported, falls
  (`vy > 0`), its feet (`player.y`) are within `STOMP_DEPTH` (8 px) below the
  top of the person's collision box (head and shoulders) and its hitbox
  overlaps that box widened on both sides by `stompReach(step)` =
  `max(4, (16 * step - HITBOX_W - head w) / 2)` (`step` = scroll px per tick,
  `STOMP_SPAN_TICKS` 16). The reach grows with the speed, so the stomp window
  stays ~15 take-off ticks (full hold) at every speed (`stomp-ease.test.ts`).
  A person counts as passed (`obstacleCleared`, `contacts.ts`) only once it
  is beyond that reach behind the skater, so it can be stomped until then.
  Checked after rail landings and before the crash check, never while the
  player is in the crash animation. Touching a person from the side lower
  down, or rising into one, is still a crash.
- **Stomp** (gameplay): the person becomes `done` (harmless), stops moving
  (`data.walk`/`sway` 0, anchored where it is) and gets `data.stompedAt =
  state.time`; people-art draws it tumbling onto its back (0.35 s), sitting
  up dazed with circling stars, then laughing. The stomp counts as a trick
  (`addTrick` with the person's points) and gameplay emits `stomp {entityId,
  kind, item}`. The item comes from `items.ts`: fans a football; Wasen
  visitors by `data.prop` a Maßkrug (`beer`; in kid mode `gingerbread`) or a
  Brezel (`pretzel`), so kid mode never yields beer. People carry their item
  visibly before the stomp.
- **Bounce** (player): on the next tick `vy = -STOMP_BOUNCE_VELOCITY`, like a
  take-off with the action already released (no hold gravity); jumpsim
  mirrors it (`stompBody`, checked against the real player in
  `jumpsim.test.ts`).
- **Toss** (gameplay, `toss.ts`): the item flies from the head in a ballistic
  arc aimed at the hands' position at launch (`x + 3`, half the hitbox
  height up) and, after 55 % of `TOSS_TIME` (0.45 s), eases onto the hands'
  current position, so it is always caught, also when the skater jumps or
  ducks. A Maßkrug spills foam drops. On arrival gameplay sets
  `state.carriedItem`, adds `ITEM_POINTS` and emits `itemCaught {item}`.
- **Losing it**: a crash clears `state.carriedItem` (`health.ts`) and cancels
  an item in flight; `resetRun` clears it at every run start.
- **Using it** (gameplay, `use.ts`, on `input.use.pressed` with an item in
  hand, see [Input](#input-action-duck-and-use)): gameplay clears
  `state.carriedItem` and emits `itemUsed {item, action}`, then by item
  (`actionOf(item, kidMode)`):
  - `beer` (Maßkrug, `drink`, never in kid mode; a beer carried in kid mode
    is eaten): `state.drunkTimer = DRUNK_DURATION` (6 s) and `drunkStart
    {duration}`; core delays the input ([Drunk input](#drunk-input)), the
    player and ui sway, and the spawner plans only easy patterns
    ([Drunk planning](#drunk-planning)). Gameplay counts the timer down every
    playing tick (`countDownDrunk`).
  - **Auto-drink** (`auto-drink.ts`, Wave 5c): a Maßkrug still in hand after
    `BEER_AUTO_DRINK` (6 s of playing time) is drunk by itself, exactly like a
    use press (same `itemUsed` / `drunkStart`), so carrying beer never stays a
    free pass for easy streets. Only a Maßkrug that would be drunk counts
    (never in kid mode); catching or using an item restarts the clock, a crash
    or a new run resets it.
  - `pretzel` / `gingerbread` (`eat`): +1 health and `healthGained {health}`;
    at full health `EAT_BONUS_POINTS` (150, times the multiplier) instead.
  - `football` (`throw`, `ball.ts`): a `ball` entity leaves the hands
    forward in a flat arc (`ballThrown`). Reaching a person knocks them over
    like a stomp (`knockOver`), scores `BALL_HIT_POINTS` (150, times the
    multiplier) and emits `ballHit`. A miss that lands draws
    `RICOCHET_CHANCE` (0.5) from `ctx.rng` (always drawn, so the rng sequence
    does not depend on the street) and ricochets back (`ballBack`) only when
    the street is free: no obstacle or rail within `RICOCHET_ROOM_SECONDS`
    (1 s of riding) on both sides of where it meets the skater
    (`ricochetRoom(ballX, speed)`), and **never while drunk**
    (`drunkTimer > 0`). Otherwise it rolls away harmlessly. The ricochet hops
    low (one jump clears it) and crashes the skater (kind `'ball'`, -1
    health) unless he jumps over it or is invulnerable.
- **UI**: "Stomp!" on the stomp, then a big popup per item above the raised
  item (`ui/item-look.ts`): "Ball geschnappt!", "Brezel!",
  "Prost!", "Lebkuchenherz!"; kid mode never shows "Prost!". The player
  draws the carried item and the catch pose; audio plays its own sounds.
- **Solver**: `new Solver(course, pace, {stomps: true})` treats a head
  landing as a valid path with the bounce (bit mask of stomped movers per
  node); the spawner verifies patterns without stomps, so no pattern ever
  requires one. `planStomp(state)` (`testing.ts`) finds a real stomp jump for
  tests and playtests: the middle of the widest run of take-off ticks (one
  hold) that stomp, so a take-off a few ticks off still stomps.
- **Stomp tooling** (`gameplay/stomp-bot.ts`, Vitest only): `stompWindow` /
  `tryStomp` measure the window for a scene (one walking or swaying person at
  a pinned speed, played by the real player + gameplay), `humanStomp` aims at
  the head with up to `jitter` ticks of error, and `rideStomping(seed,
  seconds, from)` lets a HumanBot that goes for every person ride a real run
  and reports stomps and crashes on the bounce.

## Human margins (fairness.ts)

The solver proves a pattern clearable with frame-perfect input. The spawner
also guarantees what a human can hit (`gameplay/fairness.ts`), for **every**
pattern:

- **Take-off window**: every take-off on the way (the first one and each one
  after a landing, also across the boundary to the previous pattern) has a
  window of at least `takeoffWindowAt(street)` consecutive working ticks with
  one of `HUMAN_HOLDS` (3/10/20), at every pace checked, including the chill
  jump at chill speeds (`Solver.takeoffWindow`, `humanFair`). The window is
  `EARLY_TAKEOFF_WINDOW` = 14 ticks (+-6 ticks of human timing) while the
  street distance is below `EARLY_WINDOW_DISTANCE` = 9500 (~90 s, while the
  player is still learning), then `LATE_TAKEOFF_WINDOW` = 12 (+-5 ticks). The
  window only counts jumps that land on free street (or a rail), so it also
  keeps landing room. Where that is impossible (chilled at the slowest
  speeds) the planner rerolls.
- **Across pattern boundaries**: the spawner passes the previous pattern's
  pieces (`PlanOptions.before`, shifted by its length plus the gap) and the
  combined course must be clearable at every pace, with real people motion.
- **Drunk**: see [Drunk planning](#drunk-planning).

### Drunk planning

The spawner treats a pattern as possibly ridden drunk (`SpawnSituation.drunk`)
while `state.drunkTimer > 0`, a Maßkrug is in hand or flying there, or the
pattern starts within `BEER_REACH` (`VIEW_MAX_W + SPAWN_MARGIN + 100` px of
street) after a Wasen visitor holding a Maßkrug (a quick drinker could catch
and drink it). Such patterns:

- come only from `DRUNK_TEMPLATES` (`single`, `stars`, `pair`: no people,
  nothing overhead, no rails; `fairness.ts`), with `DRUNK_GAP_SECONDS` (0.8 s)
  of extra gap;
- must stay human-fair for the worst-case drunk input: `drunkFairness(window)`
  widens the take-off window by `drunkWindow`'s `pressMax - pressMin` and lets
  every hold come out `holdMax - hold` ticks shorter or longer (`spread`);
- replace sober plans: when the situation turns drunk, patterns planned ahead
  but not yet on the street are thrown away and planned again (the rng stays
  where it is, so runs still replay).

## Planning budget

Planning a pattern (solver + human-fairness checks) can cost tens of
milliseconds, so the live game never plans a whole pattern in one tick:

- `PLAN_WORK_PER_TICK` = 400 solver units per tick (one unit = one simulated
  tick; ~0.4 ms on a desktop, ~1 ms on a phone at 4x CPU throttling). A
  pattern takes about 10 000 units (a drunk one about 25 000), the street
  needs about 100 per tick on average. The solver is resumable: when the shared
  `WorkBudget` runs out it throws `OUT_OF_WORK` and the next tick continues
  where it stopped (`patterns.ts` `planSteps` is a generator).
- **Plan ahead:** up to `PLAN_AHEAD` = 3 patterns are planned ahead of the
  one due next, so plans are usually ready long before they reach the edge,
  and the small budget catches up after drunk replans.
- **Late plan = empty street:** if a pattern is due while its plan is still
  running, empty street comes first (up to `PLAN_DELAY_MAX` = 160 px), and
  only after that the plan is finished at once. The speed range a pattern is
  checked for includes that delay.
- Units are deterministic, so runs replay exactly. Without `workPerTick`
  (unit tests, `new Spawner(zoneAt)`) every pattern is planned when due.

### Fair people

- **People come alone**: the `person` template (zones 1 and 2 only) holds one
  person and nothing else; no other template picks people. With the pattern
  lead, runout and the gap between patterns there are >= `PERSON_ROOM_SECONDS`
  (1 s) of free street before and after every person, and a person never
  walks into another obstacle while visible (walking only carries them
  towards their anchor, from further right).
- Their take-off window is the same `takeoffWindowAt(street)` as above.
- **Acceptance**: `HumanBot` (`testing.ts`: take-off +-4 ticks, holds 3/10/20,
  ducking +-4 ticks) rides 20 seeds x 3 min (`human-bot-*.test.ts`,
  `human-run.ts`) without a crash into or within 1 s of a person.

## Bench (ledge contract)

The bench is a ledge: its entity `y` (the backrest's top edge) is the grind
top. Rules in `gameplay/rules.ts`, shared by contacts and the solver:

- `landsOnLedge(feet, top)`: the feet come down onto the top edge anywhere
  from half a hitbox before its front corner (`LEDGE_FRONT_REACH` =
  `HITBOX_W / 2`, the body already reaches over it) to its **rear end**: that
  grinds (`grindStart`), the rear end included.
- `pastLedge(feetX, top)`: once the board (wheel contact x) is past the rear
  end, the skater got there over the top, so a remaining overlap of the body's
  rear with the bench box is never a crash (landing behind it, or rolling off
  its end).
- Only riding into its front or side while low crashes.

## Bin crash

- The bin's catalogue entry has `swallows: true` (`gameplay/catalogue.ts`).
  On a crash into it gameplay emits `crash {kind: 'bin'}` and then **removes
  the bin entity** at once (`contacts.ts`).
- The player (`player/bin.ts`, `bin-art.ts`, the `binCrash` timeline in
  `poses.ts`) dives head first into the bin and draws it around the skater
  from the crash on: legs and board sticking out, legs kicking, still rolling
  on the ground; after `BIN_POP_AT` (0.76 s) he pops out and lands back on the
  board within `CRASH_TIME`, while the bin tumbles away to the left and leaves
  with the street. The lid colour comes from the hit entity's `data.variant`
  if it is still in `state.entities` when `crash` is emitted.
- `player.state` stays `crash` and invulnerability is the same as for every
  crash. Details in `src/player/CONTRACT.md`.

## Grind trick

- While grinding a rail or the bench, holding down (duck: ↓ / S, a swipe down
  on touch) performs a trick: the **player** sets `player.grindTrick = true`
  for as long as down is held and the grind lasts, and draws the skater facing
  the player (front view, the only view with the moustache).
- The trick ends when down is released or the grind ends (jump off, rail end,
  crash). **Gameplay** reads `player.grindTrick`, scores the trick and emits
  `grindTrick {entityId, ticks, points}` when it ends while the skater is
  still on the rail or bench (`grind-trick.ts`: `GRIND_TRICK_POINTS` = 3 per
  tick, times the multiplier, on top of the grind points); the ui shows
  "Grind-Trick! +…" and audio plays a sound.
- Ducking on the ground is unchanged; a grind trick never ducks.
- **Hint** (ui, `ui/trick-hint.ts` `TrickHint`): while grinding, on the first
  `TRICK_HINT_GRINDS` (3) grinds of a run and until the player has scored a
  grind trick once ever (storage key `grindTrickSeen`, set on the first
  `grindTrick`), a small plate centred under the skater just below the riding
  line says "↓ = Trick!" (desktop, with a key cap) or "Wisch runter = Trick!"
  (touch). It hides while the trick is held and when the grind ends.

## Chill effect (joint pickup)

Contract between gameplay, player and ui:

- **Gameplay** spawns the rare `joint` entity (never in the first 30 s, then at
  most one per ~45-60 s). Touching it sets `state.chillTimer = CHILL_DURATION`
  (6 s, `core/chill.ts`) and emits `chillStart {entityId, duration}`. Gameplay
  counts the timer down every playing tick (before it sets the speed) and the
  speed becomes `speedAt(distance) * chillSpeedFactor(chillTimer)`: it eases to
  60 % over `CHILL_EASE_IN` (0.5 s) and back to normal over the last
  `CHILL_EASE_OUT` (1 s) of the timer. While `ctx.speedOverride` is set the
  speed stays pinned (only the timer runs).
- **Player** (`src/player`): while `state.chillTimer > 0` at the start of a
  tick, take-off velocity is `JUMP_VELOCITY * CHILL_JUMP_SCALE` (0.8,
  `player/tuning.ts`); gravity, hold gravity, max hold, coyote and buffer are
  unchanged. Look: red eyes and a smoking joint in the mouth.
- **Gameplay's jumpsim** applies the same scale (`stepBody(..., jumpScale)`),
  checked tick by tick against the real player. The spawner verifies every
  pattern the effect can reach (street up to `CHILL_REACH` after the joint)
  with the chill jump at chill speed, mid-ramp and full speed, besides the
  normal check.
- **UI** shows a warm, steady screen tint scaled by `chillStrength(timer)`
  and a draining timer bar with a joint icon in the HUD plate (kid mode: the
  bubble-gum look, see [Settings menu and kid mode](#settings-menu-and-kid-mode)).

## How state flows

```
DOM events -> core/input -> ActionButton latches (action/duck via DelayedButton while drunk) -> Game.tick():
   InputFrame -> systems.update (world, player, gameplay, audio, ui) -> core integrate / mode
   events emitted along the way are delivered synchronously to subscribers
requestAnimationFrame -> FixedTimestep (0..n ticks) -> Game.render(layers) -> Renderer.present
```

Persistence: `import { store } from '../core/storage'`. Keys are namespaced
`cannstatt-cruiser:*`. Use `highscore`, `starsTotal`, `kidMode` and
`itemHintSeen` (ui; the first-catch touch hint was shown), `muted`
(audio), and `lastSeenVersion`, `visits`, `installHintDismissed` (core; the
ui changes them only through `commands`). Calls never throw.
