# Player contract (for the gameplay slice)

The player system (`createPlayerSystem()` in `index.ts`) owns `state.player`.
Gameplay talks to it only through `state.player` and the shared event bus
(`GameEvents` in `src/types.ts`). Everything below is covered by
`src/player/index.test.ts`; `src/player/testing.ts` has helpers to simulate it
in any slice's Vitest tests.

## Coordinates and hitbox

- `player.x/y` is the wheel contact point (`y === GROUND_Y` on the ground,
  `y === rail.y` on a rail). x stays at `PLAYER_X`; the world scrolls.
- `player.hitbox` is updated every playing tick, after the player's physics
  and before gameplay runs (update order: world, player, gameplay). It covers
  the body above the wheels, centred on `x`, `HITBOX_W` (10 px) wide, so the
  long deck does not count. Its bottom is `y`, its height depends on the pose
  (`HITBOX_H` in `tuning.ts`: 30 standing, 26 in the air tuck, 20 ducked,
  18 crashed). The cap peak is left out on purpose (slightly forgiving).
- `player.state` is the animation state: `push`, `ride`, `jump` (ollie
  pop), `air`, `land`, `grind`, `crash`, `duck`.

## (a) Grinding a rail

1. Gameplay detects that the player lands on a rail entity (for example
   `!grinding && vy >= 0` and the hitbox bottom crossing `rail.y` while
   `rail.x <= player.x <= rail.x + rail.w`) and emits
   `grindStart { entityId }`. The rail's **top edge is `entity.y`**.
2. The player snaps onto it in the same call: `grinding = true`,
   `grounded = false`, `y = rail.y`, `vy = 0`, state `grind`. While grinding
   there is no gravity; every tick `y` follows the rail entity's current `y`.
   A `grindStart` for an unknown entity id, or while the crash animation
   plays, is ignored (check `player.grinding` afterwards).
3. The player leaves the rail and **emits `grindEnd { entityId, ticks }`
   itself** (`ticks` = ticks ridden) when:
   - the action is pressed: the same variable jump as on the ground
     (tap = small ollie, hold = high jump), measured from the rail top;
   - the rail ends (`player.x > rail.x + rail.w`) or the entity is removed:
     the player falls; coyote time (80 ms) still allows a jump;
   - a crash arrives.
4. Gameplay should not emit `grindEnd` for normal exits; listen to it for
   grind scoring. If gameplay does emit `grindEnd` for the current rail
   (for example when it despawns it), the player drops off without emitting
   a second one.

## (b) Crashing

- Gameplay emits `crash { entityId, kind, health }` after it has applied the
  damage. The player then plays the crash (thrown off, board flies ahead,
  tumble, lying, kneel, back on the board) for `CRASH_TIME` (1.0 s), ignores
  the action meanwhile, leaves a rail (emitting `grindEnd`), and sets
  `player.invulnerableTimer = INVULNERABLE_TIME` (1.5 s).
- **Bin crash** (`kind === 'bin'`): instead of being thrown off, the skater
  dives head first into the bin and keeps rolling on the ground (no crash
  hop): the open bin sits on the deck with his legs kicking out of the top
  for `BIN_POP_AT` (0.76 s), then he pops out with a hop and lands back on
  the board within `CRASH_TIME`, while the bin tumbles away to the left and
  then moves with the street until it leaves the screen (`bin.ts`). The
  player draws this bin from the crash moment on, so **gameplay removes the
  hit bin entity** on that crash. The lid colour is read from the hit
  entity's `data.variant` (gameplay's lid order) if it is still in
  `state.entities` when `crash` is emitted, otherwise the first lid.
  `player.state` stays `crash`, so the rules above are unchanged.
- **The player owns `invulnerableTimer`**: it sets it on a crash and counts
  it down every playing tick. Gameplay only reads it: skip obstacle
  collisions (and do not emit `crash`) while `player.invulnerableTimer > 0`.
  A `crash` that arrives anyway while invulnerable is ignored, so there is
  no double crash.
- After the get-up animation the skater rides on and blinks until the timer
  reaches 0.

## Jump

- One action button: press jumps from the ground or a rail; holding lowers
  gravity during the rise for up to `MAX_JUMP_HOLD`. Tap apex ~15-17 px
  (clears 12-14 px obstacles), full hold ~52 px (clears 35 px and reaches
  rails). Jump buffer 120 ms, coyote time 80 ms. All numbers live in
  `tuning.ts`.
- Events: `jump { velocity }` on take-off, `land { impact }` (downward
  speed) on touching the ground.

## Chill (joint pickup)

- While `state.chillTimer > 0` the take-off velocity is
  `JUMP_VELOCITY * CHILL_JUMP_SCALE` (0.8, `tuning.ts`); gravity, hold
  gravity, `MAX_JUMP_HOLD`, coyote and buffer are unchanged, and `jump
  { velocity }` reports the scaled value. `gameplay/jumpsim.ts` mirrors this.
- **Tick ordering:** the player reads `chillTimer` at the start of its update,
  before gameplay runs. So the take-off uses the value left by the previous
  tick: on the pickup tick the jump is still normal, and on the tick where
  gameplay counts the timer down to 0 it is still scaled (covered in
  `chill.test.ts`).
- Look only: ride/push animation plus push rhythm at `CHILL_ANIM_RATE` (0.7),
  and a face overlay chosen by `chillStyle(state)` (`chill.ts`): adult mode
  (`state.kidMode` false) shows red eyes and a joint at the mouth (just under
  the nose, `HEAD_MOUTH` in `art.ts`), with smoke (dropped on a crash); kid mode shows normal eyes and bubble gum instead, a pink bubble
  that grows and pops on a `BUBBLE_PERIOD` loop that starts at the pickup
  (`bubbleTime(chillTimer)`, so it opens with a readable bubble) and pops at
  once on a crash (`bubble.ts`). No physics change.

## Stomp bounce (landing on a person)

- Gameplay emits `stomp { entityId, kind, item }` when the **falling** board
  lands on a person's head. Gameplay runs after the player, so the player
  applies the bounce at the start of its **next** update, before the jump
  check and the physics: `grounded = false`, `vy = -STOMP_BOUNCE_VELOCITY`
  (150, `tuning.ts`), hold boost off, coyote time cleared. That tick then
  integrates normal `GRAVITY` (no `HOLD_GRAVITY`, even with the action held),
  exactly like a jump take-off whose action was already released:
  `vy = -150 + GRAVITY * dt`, `y += vy * dt`. `gameplay/jumpsim.ts` must mirror
  this. `y` is not snapped; afterwards the normal air and landing rules apply.
- No `jump` event is emitted (audio plays its own `boing`). A stomp is
  ignored while the crash animation plays (or on a rail), a crash drops a
  pending one, and a run start clears it. One stomp, one bounce.
- Covered in `stomp.test.ts`.

## Kicker launch (stunt lines)

- Gameplay emits `launch { entityId, velocity }` when the skater rides onto
  a kicker. Like the stomp bounce, the player applies it at the start of its
  **next** update, before the jump check and the physics: `grounded = false`,
  `vy = -velocity`, hold boost off, coyote time and jump buffer cleared. That
  tick integrates normal `GRAVITY`: `vy = -velocity + GRAVITY * dt`,
  `y += vy * dt`, and every later tick too, **even with the action held**: the
  variable-jump hold never adds height to a launch (it only boosts a jump
  the player started himself). `gameplay/jumpsim.ts` must mirror this. The
  apex is about `velocity² / (2 * GRAVITY)` above the take-off (360 px/s ->
  ~49 px; the discrete ticks land up to ~2 px lower).
- A press in the take-off tick does not jump on top of the launch; a launch
  mid-jump replaces that jump (and ends its hold boost). The chill jump scale
  does not apply (no stunt lines while chilled anyway).
- No `jump` event (audio can listen to `launch`); afterwards the normal air,
  rail and landing rules apply: gameplay can `grindStart` a ledge from the
  air as usual. Ignored on a rail and while the crash animation plays; a
  crash drops a pending one, a run start clears it. If a stomp and a launch
  arrive in the same tick the faster take-off wins.
- Look: while the wheel contact point is over a `kicker` entity
  (`e.x <= player.x <= e.x + e.w`) on the ground, the skater crouches and the
  board tilts nose up (timeline `kicker`); y stays `GROUND_Y`, so keep
  the kicker art low or emit `launch` early on the ramp.
- Covered in `launch.test.ts`.

## Big air, upper level and hard landings (looks only)

- **Grab pose** (`AnimView.grab`, timeline `grab`): after a launch, or once
  a jump rises `GRAB_HEIGHT` (40 px) above its take-off (a full-hold jump),
  the skater pulls his knees up, grabs the board by the toes and throws the
  back arm up. He lets go when falling below `GRAB_RELEASE_HEIGHT` (12 px)
  above the street, on a rail and on a crash. Hitbox: the normal air tuck.
  A carried item is held up in the back hand; the item use, joint, bubble
  gum and drunk look work as in every pose.
- **Ledges** (`kind 'ledge'`) are grinded exactly like rails: `grindStart`
  snaps to the entity's `y` however high it is; at its end the skater falls
  to the street and lands normally (`land { impact }`, impact = downward
  speed, ~360 px/s from 50 px), never a crash.
- **Hard landing** (`AnimView.hardLanding`, timeline `hardLand`): a landing
  with impact >= `HARD_LANDING_IMPACT` (300, a drop from ~35 px) squashes
  deeper and kicks up dust at the wheels. `LAND_TIME`, hitbox and events are
  unchanged.

## Carried item (state.carriedItem)

- Gameplay sets `state.carriedItem` on `itemCaught` and clears it on a crash;
  the player only draws it (`carry.ts`, `render.ts`): football, pretzel, beer
  mug, gingerbread heart, in the front hand in every pose (`HOLD_AT` per body
  frame): tucked under the arm on the ground and while ducking, hanging from
  the outstretched hand in the air tuck / grind / landing, held up with the
  raised arm while falling. Nothing is drawn during the crash.
- `itemCaught` starts the catch reach for `CATCH_TIME` (0.2 s): the front arm
  goes up past the face and holds the item above the cap. Looks only, no
  physics change; a crash cuts it short.

## Item use (itemUsed)

- On `itemUsed {item, action}` the player plays an upper-body overlay
  (`use.ts` timelines, `use-art.ts` geometry): **drink** lifts the Maßkrug to
  the mouth, `DRINK_GULPS` (3) gulps in ~1 s, then tosses the empty mug
  (`MugToss`: arc behind, lies on the street and scrolls away); **eat** two
  bites with crumbs, then the food is gone; **throw** a quick overarm throw
  (no ball drawn: gameplay owns the `ball` entity). Works in every pose but
  the crash (ride, push, air, grind, grind trick, duck); a crash cuts it
  short, a run start clears it. Looks only: hitbox, jump and duck unchanged.

## Drunk look (state.drunkTimer > 0)

- `drunkLook(drunkTimer, state.time)` (`wobble.ts`): the body sways 1 px
  over the board, an arm flails now and then and a hiccup bubble rises from
  the mouth. Pure function of the run time; hitbox unchanged.

## Grind trick (player.grindTrick)

- `input.duck.held` while grinding (and not crashing) sets
  `player.grindTrick = true` every tick; otherwise it is false (released,
  off the rail, jump, rail end, crash, run start). Down on a rail never
  ducks and never leaves the rail; `player.state` stays `grind` and the hitbox
  is the standing one. Gameplay scores it and emits `grindTrick`.
- Look: one in-between frame (`TRICK_TURN_TIME`, timeline `grindTurn`) turning
  to the camera, then the front view (`grindTrick`, the only frame with the
  moustache), and the in-between frame again when the trick ends on the rail.

## Duck

- `input.duck.held` while the player is **on the ground** (not on a rail,
  not in the air, not crashing) puts it in state `duck`: crouched on the
  board, cap low, hitbox `HITBOX_H.ducking` = 20 px (cap top at `y - 20`),
  from the same tick on. Overhead obstacles end at least 22 px above the
  ground, so a ducked rider passes under them and a standing (30) or tucked
  (26) one does not.
- On a rail and in the air ducking does nothing (no fast fall). Holding duck
  while landing ducks on the landing tick.
- Pressing jump while ducked stands up and jumps in the same tick, exactly
  like a jump from riding. Releasing duck stands up at once (hitbox back to
  standing); a short crouch frame (`DUCK_TRANSITION`) smooths the pose in and
  out but does not change the hitbox.

## Testing helpers

```ts
import { addRail, crash, createPlayerTestGame, jumpApex, startGrind, tick } from '../player/testing';

const game = createPlayerTestGame([createGameplaySystem()]); // run started, seed 1
const rail = addRail(game, { x: 60, y: GROUND_Y - 30, w: 120, h: 4 });
startGrind(game, rail);   // emits grindStart like gameplay
tick(game, 10);
game.buttons.duck.press('test'); // duck (release with .release('test'))
crash(game);              // health - 1, emits crash (kind 'barrier'; crash(game, 'bin') = bin dive)
jumpApex(game, 2);        // tap from the current support, returns apex height
```

In the browser (dev, or `?test=1`) `window.__player` offers `grind(height,
length, kind)` (`kind` `'ledge'` for a high ledge), `kicker(length)` (a static
kicker under the player), `launch(velocity)` (emits `launch`), `removeRail(id)`, `crash(kind)` (default `'barrier'`, `'bin'` for the bin dive), `chill(seconds)` (sets
`state.chillTimer`), `kidMode(on)` (sets `state.kidMode`), `carry(item)` (sets
`state.carriedItem`, `null` drops it), `stomp(item)` (emits `stomp`),
`catchItem(item)` (sets the item and emits `itemCaught`) and
`useItem(item, action)` (emits `itemUsed`), `drunk(seconds)` (sets
`state.drunkTimer`), `useLineup(scale)` (item use in ride/air/grind/trick
poses plus drunk rows) and `lineup(scale, look, item)` (`look`: `'normal'`, `'chill'` or `'kid'`; `item`
adds it in every pose plus a row of catch reaches) for playtest scenarios (see `scripts/scenarios/skater.ts`). Rails it adds carry
`data.debugRail` and are drawn by the player slice; gameplay may ignore them.
