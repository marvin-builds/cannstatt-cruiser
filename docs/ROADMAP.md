# Plan: "Cannstatt Cruiser" — pixel-art skate runner, built by orchestrated agent slices

## Context
Greenfield (empty `/home/marvin/dev/skating-game`, no git). Goal: a fullscreen, phone-playable 2D pixel-art
endless skate runner set in Stuttgart / Bad Cannstatt, built by subagents in feature slices with review and
play-test feedback loops. I only orchestrate; agents implement, review and play.

Decisions taken: endless run with zone cycling + local high score · Vite + TypeScript + Canvas (no engine) ·
chiptune SFX · German UI · GitHub Pages deploy setup · installable PWA · "balanced" agent budget.

## Product spec (shared with every agent as `docs/SPEC.md`)
- **Rendering**: internal resolution 320×180, nearest-neighbour integer scaling, letterbox, fullscreen API +
  fallback; landscape on phones with a "bitte drehen" hint in portrait. 60 fps fixed-timestep loop.
- **Controls**: one action. Space / ↑ / mouse / touch anywhere. Tap = small ollie, hold = higher (variable jump
  with max hold time), plus coyote time and jump buffering for fairness on touch.
- **Skater**: middle-aged, normal height, mixed dark-grey hair under a cap, casual clothes; short longboard
  (longer deck, kicktail, visible bigger wheels). Animations: push, ride, ollie, air, land, grind, crash.
- **Obstacles & rails**: Mülltonne, Absperrbake, Bank, Pflanzkübel, Bordstein-Gaps; grindable handrails/pipes.
  Clean jump over obstacle = points; landing on rail = grind with points per tick; combo multiplier.
- **Health**: 3–5 hearts/bar; crash = lose health + brief invulnerability; empty = Game Over.
- **Stars**: collectible, counter in HUD, "just for fun" (no gameplay effect), persisted lifetime total.
- **Difficulty**: speed and obstacle density ramp; spawner guarantees every pattern is clearable.
- **Zones (parallax, cycling)**: 1) Stuttgart-Mitte – Fernsehturm, Hbf tower with star, Stäffele, vineyards on
  hills, yellow Stadtbahn. 2) Neckar – river, bridge, Stadtbahn, Mercedes-Benz Arena silhouette.
  3) Bad Cannstatt – Altstadt half-timbered houses, Kursaal, Mineralbad/Sprudler, Wasen with Fruchtsäule,
  Riesenrad and Festzelte, Wilhelma hint.
- **Screens (German)**: Titel, HUD (Punkte, Sterne, Gesundheit), Pause, Game Over with Highscore, mute button.
- All pixel art drawn in code from palette-based sprite strings (no external assets, no licensing issues).

## Orchestration workflow (my improvements over the base request)
1. **Contract-first foundation slice** runs alone first: it fixes module boundaries, shared types, game state
   shape and an event bus, so later slices run in parallel without stepping on each other.
2. **Deterministic test hook** `window.__game` (seeded RNG, pause/step N frames, read state, press/hold/release
   input) + a Playwright harness `scripts/playtest.ts` (desktop 1280×720, phone 844×390 landscape and
   390×844 portrait, touch emulation, screenshots). Play-tester agents then check objective facts
   (hold jump > tap jump, crash costs health, grind scores) *and* judge screenshots visually — not flaky.
3. **Acceptance criteria written per slice before implementation**; reviewers judge only against them plus
   bugs, which keeps feedback bounded and actionable.
4. **Per-slice loop (balanced)**: implementer (TDD for logic via Vitest, per your rule) → one combined
   reviewer/play-tester (code review + Playwright play session + screenshots) → findings ranked
   blocker/major/minor → implementer fixes blockers+majors → re-check. Max 2 fix rounds; leftover minors go to
   a backlog file.
5. **Linear on `main`, no branches/worktrees**: parallel slices share the working tree but each owns a disjoint
   directory (enforced in its prompt); agents never commit. After a slice passes review I run `npm test` +
   `npm run build` and commit that slice's files only, one commit per slice → linear history.
6. **Wave-sized workflows** (each under ~10 agents) with a **human checkpoint after Wave 1**: you see
   screenshots of skater + backgrounds and approve the look before gameplay is built on it.
7. **Model use**: implementers and the final play-test on the default (strongest) model for code and visual
   judgment; per-slice reviewers on Sonnet to save budget.

## Slices & waves
| Wave | Slice | Owns | Key acceptance |
|---|---|---|---|
| 0 | **Foundation** | `src/core/`, `src/types.ts`, `scripts/`, `docs/`, `CLAUDE.md`, configs | loop, scaling, input (tap/hold), test hook, Playwright harness, CI-ready `npm test`/`build` |
| 1 ∥ | **Skater & physics** | `src/player/`, `src/sprites/skater.ts` | variable jump, coyote/buffer, all animations, look matches spec |
| 1 ∥ | **World & zones** | `src/world/`, `src/sprites/scenery/` | 3 recognisable zones, 3–4 parallax layers, smooth zone transitions |
| 1 ∥ | **Audio, PWA, deploy** | `src/audio/`, `public/`, `.github/workflows/` | SFX via WebAudio, mute persisted, manifest + SW offline, Pages workflow with base path |
| — | **Checkpoint**: you review screenshots | | |
| 2 ∥ | **Gameplay** | `src/gameplay/` (obstacles, rails, collision, score, combo, stars, health, spawner) | fair spawns, grind works, crash → health, stars counted |
| 2 ∥ | **UI & screens** | `src/ui/` | German title/HUD/pause/game-over, highscore + star total in localStorage, fullscreen button, portrait hint |
| — | **Look fixes** (after checkpoint, ∥ Wave 2) | `src/world/` | Neckar bridge continues off-screen / lands on a bank (no tram vanishing mid-air); Cannstatt far layer: replace castle-like Wilhelma silhouette with the Grabkapelle auf dem Württemberg (round domed chapel on a vineyard hill) |
| 2b | **Ducking** (user request at checkpoint) | `src/player/` (duck pose + low hitbox), `src/gameplay/` (overhead obstacles: Schilder, Äste, Absperrbanner), core input (second action) | duck passes under overhead obstacles, jump still clears ground ones, fair mixed patterns; controls: ↓/S on keyboard, swipe down on touch (user-confirmed) |
| 2c | **Seamless zone travel** (user request) | `src/world/` | no full-screen dither/crossfade switch: each parallax layer streams the next zone's props in from the right at its own speed (far layers change later, near earlier), sky/ground colours blend gradually over the ride, a natural gateway between zones (e.g. riverbank/bridge ramp between Mitte → Neckar → Cannstatt), zone change driven by distance and announced by the UI banner only once the new zone is actually on screen |
| 3 | **Integration & polish** | cross-cutting fixes | final multi-persona play-test (desktop keyboard, phone touch landscape/portrait, "casual first-timer") → one fix round |

## Git
First step: `git init -b main` with `.gitignore`. All work happens directly on `main`, linear history (no
branches, merges or worktrees); one commit per finished slice, plus fix commits for review rounds
(sentence-case messages, Claude co-author line). No push and no GitHub repo creation without your go-ahead —
Pages deploy only goes live when you say so.

## Verification
- `npm test` (Vitest: physics, collision, scoring, spawner fairness, health) and `npm run build` green before
  every commit.
- `npm run playtest` produces screenshots for desktop + phone viewports; final report shares them with you.
- Manual: `npm run dev -- --host` to play on your phone over LAN; `npm run preview` to check the PWA build.

## Polish backlog for Wave 3 (collected from reviews)
- German number format in UI (61.234, not 61,234); trim game-over plate and HUD plate; larger portrait hint icon.
- Keyboard resume from pause also on Space (core) so the hint can match.
- gameplay scenario aborts in phone-portrait (endRun while paused by portrait hint).
- Decide: rails never cost health (posts are pass-through) — currently forgiving.
- docs/TESTING.md: list window.__ui and gameplay testing helpers; move PX_PER_METRE to core/config if shared.
- USER: skater hair clearly grey in patches (salt-and-pepper: distinct grey patches at temples, sides and back under the cap, visible at 1x game scale, also in every pose incl. duck);
- tone down busy near layer; title background not scrolling; dead jump constants in core/config.ts; SW precache of hashed assets.
- USER: benches must be grindable (land on the seat/backrest edge = grind, like rails); only hitting the bench front/side while low crashes. Solver/patterns must treat bench as rail-capable obstacle.
- USER: too fast at the end. Lower top speed (currently 90 -> 220 px/s over ~2:45) to ~160-170 px/s and ramp more gently; keep difficulty growth via density/pattern mix instead. Re-verify solver fairness and bot run.
- USER: people as obstacles, zone-themed: VfB fans (red-white scarf/jersey, no club crest/logo) mainly near the Neckar/Arena zone; tipsy Wasen visitors (Dirndl/Lederhosen, Maßkrug, swaying) in Bad Cannstatt. Short enough to jump over; may sway/walk slowly with deterministic motion the solver models; crash plays a friendly reaction, not violence.
- USER: rare joint pickup ("Joint"): collecting it triggers a short chill effect (~5-6 s): scroll speed drops strongly (e.g. to ~60%), jump height is reduced but still clears every obstacle that can spawn during the effect (solver must verify with the reduced jump params; overhead obstacles still duckable). Visual: slight hazy/warm tint and slower skater animation; mellow SFX; HUD shows remaining effect time. Never spawn it where the transition back to normal speed would make the following pattern unfair. While active the skater has red eyes and a smoking joint in the mouth (small glowing tip + rising pixel smoke puffs), in every pose including duck and grind.
- USER (after 3a): swipe-duck lasts longer (~1.2 s instead of ~0.6 s) and swipe detection more forgiving (shorter/slanted swipes count); keyboard duck unchanged. Touch decision delay (83 ms) is fine. Far-layer trailing is fine.
- USER: kid-friendly option: setting "Kindermodus" (persisted, default OFF = adult/joint mode; NOT on the title screen: hidden "Einstellungen" menu opened by a 3 s long-press on the title logo (keyboard: hidden key combo, e.g. hold K for 3 s); turning kid mode OFF again asks a simple parent check like "Wie viel ist 7 × 8?") turns the joint into a bubble gum (Kaugummi) pickup: same slow-motion/low-jump effect, but the skater blows a pink bubble instead of joint + red eyes, pink/sweet tint instead of hazy, bubbly SFX, no drug references anywhere in kid mode (texts, art, sounds).
- USER: UI buttons (pause, mute, fullscreen, settings menu controls) too small on phone: larger touch targets on touch devices (aim >= ~44 CSS px tap area), still crisp pixel art and no overlap at 320-427 width.
- USER: the skater has a "Schnauzer" — interpreted as a moustache (Schnauzbart): dark grey with a few grey pixels, visible at 1x in every pose; check that bubble gum / joint overlays still read. (User confirmed: moustache, not the dog.)
- USER: landing on top of a VfB fan or Wasen visitor (falling onto their head/top) is NOT a crash: the person tumbles over comically (no violence, sits up dazed/laughing), the skater bounces/rides on and gets an item under his arm: football from a fan; pretzel (Brezel) or Maßkrug from a Wasen visitor (kid mode: Brezel or Lebkuchenherz, never beer). Item stays visible in every pose until the next crash or run end; bonus points + popup ("Ball geschnappt!", "Brezel!", "Prost!"). Solver treats landing on people as a valid path. Do together with the people fairness fix. Item is visible in the person's hand BEFORE (fan carries the ball, visitor holds Maßkrug/Brezel/Lebkuchenherz around the neck). On landing the item pops up in a short arc and the skater catches it automatically (arc computed to meet his hands after ~0.4-0.5 s; skater x is fixed so the catch is guaranteed, even if he jumps meanwhile — item homes in at the end). Maßkrug spills a little foam on the way.

## Status checkpoint 2026-10-07 ~21:35
- Pushed up to 601f8db (kid-mode flag contract). Wave 3b running (workflow wf_be896fcd-a96): settings-kidmode (hidden Einstellungen via 3 s logo long-press / hold K, parent check, gum pickup, longer swipe duck, bigger phone buttons, TESTING.md fence fix) + skater-kidmode (bubble gum look, bubbly SFX, bold grey hair patches, clearer red eyes).
- DONE: Wave 3b committed+pushed (4021735, 621fdd2).
- Next: people fairness fix (HIGH), moustache (skater), then final multi-persona playtest (Wave 3) + one fix round; final report.
- USER (HIGH PRIORITY, bug): walking/swaying people combined with obstacles create impossible or frustrating situations. Fix in next gameplay round:
  1. Reproduce first: run long SolverBot + "human" bot (reaction jitter ±4 ticks, hold quantised) over many seeds, log every crash involving a person; add failing tests from them.
  2. Check across pattern boundaries (people from one pattern walking into the next pattern's obstacles/landing zone) — solver must validate the whole upcoming course window, not each pattern alone.
  3. Require human-sized margins: minimum take-off window (e.g. >= 6 ticks) and landing room for every person+obstacle combo; no person within X px before/after another obstacle unless the combo is explicitly designed.
  4. People never walk toward the player into an obstacle cluster; keep motion amplitude small; consider spawning people only as standalone patterns.
- DONE: Wave 4 committed (614f33a skater moustache/carry/stomp bounce, 07835d8 people fairness + stomp items). Leftover minors: football sprite differs fan vs. hand; catch popups small / Lebkuchenherz low contrast; no stomp points popup or sound; human bot still crashes on some non-person chains (apply margin to all patterns?); test runtime ~36 s.
- USER (2026-10-08): moustache does not work at this pixel size (pixel size must NOT change). Skater looks messy (head: cap + grey patches + moustache crowd ~8 px). Clean up the skater sprite for a clear, readable silhouette in every pose; drop the moustache; keep grey hair subtle and tidy (a few clean grey pixels at temple/side under the cap instead of scattered noise); carried item, joint/red eyes and bubble overlays must still read. Slice "skater-cleanup" (owns src/player), next.

## Status checkpoint 2026-10-08
- DONE: skater cleanup (15d283c), final multi-persona playtest (all personas fun 7/10) and its fix round: 1f1dd00 (touch hold from touch start, readable lowercase e), d8267d1 (>= 9-tick human take-off window for every pattern, livelier start / softer end, stomp points), 39931e8 (popups below HUD + merged + outlined, opaque plates, key hints, parent-check key labels, stronger tints), f97e64e (scenery off the riding line, tidy greying band, readable kid bubble), 2c3d908 (persona scenarios).
- Leftovers (minor): final-phone-touch bench-grind check needs its bot to plan SWIPE_WINDOW ticks ahead (patch in workflow wf_976ad507-264 journal); portrait 'real tap on title starts a run' fails in that scenario; portrait play stays a small 390x180 strip; stomp shows two stacked popups (+points and 'Stomp!'); phone settings/parent-check still a bit empty; skater's middle-aged cue still subtle at 1x; football sprite shared art could move to core.
- OPEN USER DECISION: hosting. GitHub Pages workflow is ready, but the repo is private (needs public repo or GitHub Pro), or use Cloudflare Pages / Netlify.

## User feedback 2026-10-08 (after the final playtest), prioritised
1. **Smoothness (HIGH):** the game does not feel fluid, the picture sometimes hangs. Measure frame times and update counts per frame in a real browser, find long frames (GC, per-frame allocations, sprite rebuilds) and uneven scroll steps (the render `alpha` is computed but unused). Fix in core; report hot spots in other slices for the next wave.
2. **Bug: bench back edge:** landing on the rear end of the bench seat crashes, but it must grind.
3. **Too hard:** obstacles placed too tightly (gaps too small, too close). Wider gaps and a bigger human take-off and landing margin, measured with the human bot before and after.
4. **Start in Bad Cannstatt:** the run (and title) starts in Cannstatt, then the route goes Cannstatt → Neckar → Mitte → Neckar → Cannstatt … (zone indices stay the same).
5. **Bin crash:** crashing into a Mülltonne makes the skater stick head-first in the bin for a moment (legs and board sticking out, legs kicking), then he pops out.
6. **Mitte traffic:** in Stuttgart-Mitte, suddenly many cars on the foreground street (in front of the riding line, never covering obstacles or the skater), exhaust puffs and traffic noise (rumble and the odd honk, only in Mitte).
7. **POI Neckar: Mombachquelle:** the spring's outlet into the Neckar with people chilling at the bathing pool (background scenery, not obstacles).
8. **Using caught items** (new "use" action: key E, on touch a big item button shown while carrying):
   - Maßkrug (never in kid mode): drink it with a "glug glug glug" sound → drunk for ~6 s, unreliable controls (deterministic random input delay, the skater and screen sway). While drunk the spawner only places easy patterns that the solver validates with the extra delay.
   - Brezel / Lebkuchenherz: eat it → +1 health (bonus points if health is full).
   - Football: throw it forward. Hitting a person makes them tumble (points, "Treffer!"). A miss can ricochet back (deterministic chance) and knock the skater off the board (crash, −1 health) unless he jumps or ducks it.

Plan: Wave 5a (parallel): core (smoothness + use/drunk contract), world (Cannstatt start, Mombachquelle, Mitte traffic visuals), gameplay (bench edge bug, wider gaps, bin-crash entity handling), player (bin-crash pose). Wave 5b (parallel): item use in gameplay, player, ui and audio (incl. Mitte traffic sound) + perf hot spots from 5a.
