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
  (`state.kidMode` false) shows red eyes and a joint with smoke (dropped on a
  crash); kid mode shows normal eyes and bubble gum instead, a pink bubble
  that grows and pops on a `BUBBLE_PERIOD` loop of `state.time` and pops at
  once on a crash (`bubble.ts`). No physics change.

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
crash(game);              // health - 1, emits crash
jumpApex(game, 2);        // tap from the current support, returns apex height
```

In the browser (dev, or `?test=1`) `window.__player` offers `grind(height,
length)`, `removeRail(id)`, `crash()`, `chill(seconds)` (sets
`state.chillTimer`), `kidMode(on)` (sets `state.kidMode`) and
`lineup(scale, look)` (`look`: `'normal'`, `'chill'` or `'kid'`) for playtest
scenarios (see `scripts/scenarios/skater.ts`). Rails it adds carry
`data.debugRail` and are drawn by the player slice; gameplay may ignore them.
