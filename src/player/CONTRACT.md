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
  (`HITBOX_H` in `tuning.ts`: 30 standing, 26 in the air tuck, 18 crashed).
  The cap peak is left out on purpose (slightly forgiving).
- `player.state` is the animation state: `push`, `ride`, `jump` (ollie
  pop), `air`, `land`, `grind`, `crash`.

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

## Testing helpers

```ts
import { addRail, crash, createPlayerTestGame, jumpApex, startGrind, tick } from '../player/testing';

const game = createPlayerTestGame([createGameplaySystem()]); // run started, seed 1
const rail = addRail(game, { x: 60, y: GROUND_Y - 30, w: 120, h: 4 });
startGrind(game, rail);   // emits grindStart like gameplay
tick(game, 10);
crash(game);              // health - 1, emits crash
jumpApex(game, 2);        // tap from the current support, returns apex height
```

In the browser (dev, or `?test=1`) `window.__player` offers `grind(height,
length)`, `removeRail(id)`, `crash()` and `lineup(scale)` for playtest
scenarios (see `scripts/scenarios/skater.ts`). Rails it adds carry
`data.debugRail` and are drawn by the player slice; gameplay may ignore them.
