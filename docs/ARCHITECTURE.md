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
src/core/               engine pieces (foundation-owned, slices only import from here)
  config.ts             VIEW_W (min width)/VIEW_MAX_W/VIEW_H, GROUND_Y, TICK_DT, PLAYER_X, speeds, jump physics defaults, health
  game.ts               Game: state, bus, rng, buttons, mode machine, tick(), render(), hotspots
  state.ts              createInitialState(), createPlayer(), resetRun()
  modes.ts              nextMode(mode, command): title -> playing <-> paused -> gameover -> playing/title
  loop.ts               FixedTimestep accumulator (60 Hz, clamp, timeScale)
  action.ts             ActionButton: multi-source button with pressed/held/released/holdTime
  input.ts              DOM binding: keys (action, duck), pointer (mouse+touch, tap vs swipe down), blocks scroll/zoom/menus
  renderer.ts           offscreen buffer (resized to the view width), integer scaling, letterbox colour, capture()
  scaling.ts            computeLayout() (scale + adaptive view width), screenToView() (pure math)
  sprite-data.ts        parseSprite(), rowsFromString() (pure)
  sprite.ts             Sprite / sprite(): palette + string art -> cached canvases, frames, flip
  font-data.ts          bitmap font glyphs (A-Z a-z ÄÖÜäöüß 0-9 punctuation), measureText()
  font.ts               drawText(g, text, x, y, {color, scale, align, shadow})
  rng.ts                Rng (mulberry32): next/range/int/pick/chance
  events.ts             EventBus<E>: on/onAny/emit
  storage.ts            store.get(key, fallback) / store.set(key, value): safe namespaced localStorage
  fullscreen.ts         toggleFullscreen() with webkit + iOS fallback, landscape lock
  testhook.ts           window.__game (see docs/TESTING.md)
  app.ts                startApp(systems): wires everything in the browser, registers ./sw.js
src/player/ world/ gameplay/ audio/ ui/   feature slices (one factory each in index.ts)
scripts/playtest.ts     Playwright playtest CLI; scripts/playtest-lib.ts; scripts/scenarios/*.ts
```

## Ownership

Every slice owns exactly one directory. Inside it the slice may create any files
(sprites, sub-modules, tests). It must keep `index.ts` exporting the factory
listed below. Slices **never** edit `src/main.ts`, `src/core/`, `src/types.ts`
or another slice's directory. If a contract change is needed, report it so the
foundation owner can extend it.

| Path | Owner | Factory / content | Responsibilities |
|---|---|---|---|
| `src/core/`, `src/types.ts`, `src/main.ts`, `index.html`, configs, `scripts/`, `docs/`, `CLAUDE.md` | foundation | `startApp`, `Game` | loop, renderer, input, modes, RNG, bus, sprites, font, storage, test hook, playtest harness |
| `src/player/` | player | `createPlayerSystem()` | skater + longboard sprites and animations, jump physics (variable height, coyote, buffer), ducking, grind riding, crash/stumble anim, `state.player` incl. `hitbox` and `invulnerableTimer` |
| `src/world/` | world | `createWorldSystem()` | parallax zones (3-4 layers), zone cycling/transitions, ground, `state.zoneIndex`, letterbox colour |
| `src/gameplay/` | gameplay | `createGameplaySystem()` | obstacles, rails, stars (`state.entities`), spawner + clearability (jumps and ducks), difficulty (`state.speed`), collisions, score/combo/multiplier, health, gameplay events |
| `src/ui/` | ui | `createUiSystem()` | title, HUD, pause, game over, highscore + star total persistence, mute + fullscreen buttons (hotspots), portrait hint |
| `src/audio/`, `public/`, `.github/` | audio/pwa | `createAudioSystem()` | WebAudio SFX from events, unlock via `onUserGesture`, mute persistence; manifest, pixel-art icons, service worker, GitHub Pages workflow |

PWA files that `index.html` and `app.ts` already reference (the PWA slice
creates them in `public/`):
- `manifest.webmanifest`
- `icons/icon-192.png`, `icons/icon-512.png`, `icons/apple-touch-icon.png`
- `sw.js` (registered only in production builds, and only once it is served as
  JavaScript)

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
  Always draw at integer coordinates.
- Always reach state through `ctx.state` / `r.state` and don't cache sub-objects,
  because `resetRun` replaces `state.player` and `state.entities` at every run start.

### GameContext

| Member | Use |
|---|---|
| `state` | the single mutable `GameState` |
| `bus` | typed event bus (`GameEvents`) |
| `rng` | seeded `Rng`, re-seeded with `state.seed` at every run start. Use it for all gameplay randomness (never `Math.random`), so test runs replay deterministically. |
| `input` | this tick's `InputFrame`: `action` and `duck` (each `{pressed, held, released, holdTime}`), `pausePressed`, `mutePressed`. See [Input](#input-action-and-duck). |
| `display` | `{portrait, touch, fullscreen, viewWidth, viewHeight}`. `viewWidth` is the current view width (320-427) and changes live; also on `RenderContext.display`. |
| `speedOverride` | speed forced by the test hook (`setSpeed`), or `null`. While set, core pins `state.speed`; difficulty code must not write it. |
| `commands` | `startRun, pause, resume, gameOver, toTitle, setMuted, setZone, toggleFullscreen, setLetterboxColor` |
| `addHotspot({rect, onPress})` | screen region (view px) that swallows pointer presses instead of jumping. `onPress` runs inside the DOM event, so fullscreen/audio APIs work there. |
| `onUserGesture(fn)` | runs `fn` inside every key/pointer DOM event (WebAudio unlock) |

### GameState field owners

| Field | Written by |
|---|---|
| `mode`, `modeTime`, `frame`, `time`, `distance`, `seed`, `muted` | core (via commands) |
| `speed`, `score`, `combo`, `multiplier`, `stars`, `health`, `entities` | gameplay (`speed` is pinned by core while `ctx.speedOverride` is set) |
| `player.*` (position, velocity, grounded, grinding, state, hitbox, invulnerableTimer) | player (gameplay changes grinding / crash only through the events it emits, and only reads `invulnerableTimer`; see below and `src/player/CONTRACT.md`) |
| `zoneIndex` | world (and `commands.setZone`) |

Coordinates are screen space in view pixels, with y pointing down. The world
scrolls, while the player stays near `PLAYER_X`. `player.x/y` is the board's
contact point (y = `GROUND_Y` on the ground). Entities move left by
`speed * dt` per tick.

Collision handoff between player and gameplay: gameplay detects collisions
using `player.hitbox` and emits `crash` / `grindStart` / `grindEnd`. The player
system listens to these events to play the crash animation, or to snap onto
and ride the rail (gameplay passes the rail's entity id; the player reads its
rect from `state.entities`).

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
| `obstacleCleared` | `{entityId, kind, points}` | gameplay |
| `crash` | `{entityId, kind, health}` | gameplay |
| `starCollected` | `{entityId, stars}` | gameplay |
| `scoreChanged` | `{score, delta, combo, multiplier}` | gameplay |

Usage: `const off = ctx.bus.on('crash', (e) => ...)`. Subscribe in `init`.
Emitting is synchronous.

## Input: action and duck

`InputFrame` has two logical buttons with the same `ActionSnapshot` shape:

| Button | Sources |
|---|---|
| `action` | Space, ArrowUp, W, mouse button, touch tap / hold anywhere |
| `duck` | ArrowDown, S (held while the key is down); a swipe down on touch (held for `SWIPE_DUCK_TICKS` = 36 ticks, 0.6 s, or until the next tap turns into a jump; another swipe restarts it); test hook `input.duck` |

`core/input.ts` maps DOM events through two DOM-free pieces that unit tests
drive directly: `keyDown/keyUp(game, code)` and `PointerControls`
(`down/move/up/cancel(id, viewX, viewY)`). The player decides what duck does
(on the ground only; jump wins over duck), see `src/player/CONTRACT.md`.

### Touch: tap vs swipe down

A touch cannot be told apart from the start of a swipe when the finger lands,
yet a swipe down must never also jump. So a touch **during a run** stays
undecided for at most `SWIPE_WINDOW` = 5 ticks (~83 ms):

- the finger moves down `SWIPE_DISTANCE` = 5 view px (more down than
  sideways): duck, and this touch never presses the action;
- the finger lifts (a tap), or moves `SWIPE_DISTANCE` sideways / up: the
  action is pressed right then (a lifted tap arrives as press + release in the
  same tick = small ollie);
- the window runs out with the finger still down: the action is pressed and
  held from then on (hold = high jump).

Tradeoff: a touch jump during a run starts up to ~83 ms later than the finger
lands (a quick tap: when the finger lifts, which is usually sooner), and a
held touch counts its hold time from the decision. Keyboard and mouse presses,
and touches on the title, pause and game-over screens, are not delayed at all.
Hotspots still take presses first.

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
game-over screen it goes back to the title. Losing window focus (`blur`) or
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

## How state flows

```
DOM events -> core/input -> ActionButton latches -> Game.tick():
   InputFrame -> systems.update (world, player, gameplay, audio, ui) -> core integrate / mode
   events emitted along the way are delivered synchronously to subscribers
requestAnimationFrame -> FixedTimestep (0..n ticks) -> Game.render(layers) -> Renderer.present
```

Persistence: `import { store } from '../core/storage'`. Keys are namespaced
`cannstatt-cruiser:*`. Use `highscore` and `starsTotal` (ui) and `muted`
(audio). Calls never throw.
