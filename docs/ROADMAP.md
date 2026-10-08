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
7. **POI Neckar: Mombachquelle:** while the Neckar is in the background, the Mombachquelle's outlet into the river appears there with people chilling at its bathing pool (background scenery, not obstacles).
8. **Using caught items** (new "use" action: key E, on touch a big item button shown while carrying):
   - Maßkrug (never in kid mode): drink it with a "glug glug glug" sound → drunk for ~6 s, unreliable controls (deterministic random input delay, the skater and screen sway). While drunk the spawner only places easy patterns that the solver validates with the extra delay.
   - Brezel / Lebkuchenherz: eat it → +1 health (bonus points if health is full).
   - Football: throw it forward. Hitting a person makes them tumble (points, "Treffer!"). A miss can ricochet back (deterministic chance) and knock the skater off the board (crash, −1 health) unless he jumps or ducks it.

Plan: Wave 5a (parallel): core (smoothness + use/drunk contract), world (Cannstatt start, Mombachquelle, Mitte traffic visuals), gameplay (bench edge bug, wider gaps, bin-crash entity handling), player (bin-crash pose). Wave 5b (parallel): item use in gameplay, player, ui and audio (incl. Mitte traffic sound) + perf hot spots from 5a.
9. **Hair less grey (USER 2026-10-08):** the hair reads as almost completely grey. Make it mostly dark (dark brown/dark grey) with only a few grey pixels at the temple, readable at 1x, in every pose.
10. **Grind trick facing the player (USER 2026-10-08):** pressing down (↓/S, swipe down) while grinding performs a trick: the skater turns to face the player (front view) for its duration, and in this front view the moustache is visible. All other views and poses stay unchanged (no moustache there). Gameplay awards trick points and a popup; the trick ends when the grind ends or down is released.

Hosting: DONE 2026-10-08. The repo is public, GitHub Pages deploys from main via .github/workflows/deploy.yml, live at https://marvinmai.github.io/cannstatt-cruiser/.
Wave 5b additionally covers 9 (player) and 10 (player + gameplay + ui popup + audio).

## Status checkpoint 2026-10-08 (evening)
- DONE (local commits, not pushed — user asked to hold pushes until they are back): Wave 5a (smooth loop + CSS-scaled canvas, item/drunk contract, Cannstatt start, Mitte traffic, Mombachquelle, bench rear edge, wider gaps, bin crash), Wave 5b (item use: beer → drunk, Brezel/Lebkuchenherz → +1 health, football throw + ricochet; grind trick with front view and moustache; darker hair; item sounds and traffic noise; planning spread over ticks; smooth scrolling), Wave 5c (beer auto-drink after 6 s, stacked popups, football icon, soft drunk effect, delayed sound cues, docs + item scenarios).
- Leftovers (Wave 5d): solver stack overflow when drunk planning runs at speed 0 (only reachable via test pinning; repro in scratchpad repro5c/d1.ts); gameplay render spike up to ~9 ms on a 4x-throttled phone; solver allocations (~20 KB/tick while planning, heap rise 18-20 KB/frame); ball hit plays 'cleared' and 'ballHit' sounds together; merged repeat popup keeps its old stack position; wide popups reach the left edge on phone portrait; phone-portrait item button plate touches the right edge; gulp timing duplicated in audio (GULP_AT) and player.
- DONE: Wave 5d (iterative solver without stack overflow, warmed gameplay sprites and cached rails/signs, ~83% fewer planning allocations, popups and item button off the screen edges, no doubled clear sound).

## User feedback 2026-10-08 (late)
11. **Mombachquelle redesign:** it must look entirely different (user gave a satellite photo). In German, as described: an der Einmündung des Quellwassers in den Neckar wurde aus Steinen ein Becken gebaut, etwa eine Personengröße im Durchmesser. Das Becken liegt am Fuß einer Böschung; links vom Becken führt eine Treppe die Böschung hoch. Links neben dem Becken ist ein flacher Bereich knapp über dem Neckarpegel mit einer Bank. Oberhalb rechts des Beckens hängt ein Mülleimer an einem Baum, links daneben, oberhalb des Beckens, steht eine weitere Bank. Das Wasser tritt unterhalb dieser oberen Bank aus einem Durchlass und plätschert ins Becken. The name must not appear anywhere (remove the sign). Surroundings: dense green trees and bushes on the bank, the stone basin juts into the river. A few people chilling there stay.
12. **Mitte traffic bigger and more disruptive:** the cars are "ridiculously small". Make the vehicles much bigger (close to the camera), denser and more disruptive, if technically reasonable; louder traffic noise to match. Gameplay must stay readable: anything reaching above the riding line must not hide the skater or obstacles.
13. **Grind trick hint:** players don't learn that down while grinding does a trick. Add a hint: on the title/pause key hints, and in game the first few times a grind starts ("↓ = Trick!" on keyboard, "Wisch runter = Trick!" on touch), until the player has done a trick once (persisted).
14. **Light traffic everywhere else:** in Neckar and Bad Cannstatt the foreground street gets occasional traffic too, but way, way less than in Mitte (a single car or van now and then, rare bus). Same rules: never hides the skater or obstacles; trafficDensity stays low there so the audio is quiet. Briefed to the next world slice after Wave 6 (the running world slice already owns the traffic redesign).
15. **Update hint after a deploy (USER 2026-10-08):** when the service worker has fully cached a changed version, it tells the open page; core sets `state.updateReady`; the UI shows "Neue Version da – tippen zum Neuladen" on title and pause screens only (never mid-run), and tapping it reloads. It must be a real button ("Neu laden", touch-sized, also keyboard: e.g. U) because the installed app (home-screen PWA, standalone) has no browser refresh; also shown on the game-over screen. Verify the reload works in standalone display mode. Infrastructure (sw.js + core) runs right away in parallel with Wave 6; the UI hint follows in the next wave with item 14.
16. **"Was ist neu" after an update (USER 2026-10-08):** each build carries a version id and a short German changelog (a few bullet points per version, newest first). If the stored last-seen version is older than the running build (and one was stored, so never on a first visit), a "Neu in dieser Version" screen lists the changes since the last-seen version (capped to a few lines) before the normal title; a tap/key continues to the title and stores the new version. The orchestrator writes the changelog entry for every deploy. Runs in the next wave together with items 14 and 15 (UI part).
17. **Easier stomps (USER 2026-10-08):** landing on people to get their items is too hard, especially later at higher speed. Widen the stomp zone and keep its window in ticks roughly constant across speeds; solver mirrors the rule. Started right away as gameplay slice (gameplay was free).
18. **Install hint (USER 2026-10-08):** on phones/tablets only, when not already running installed (display-mode standalone / navigator.standalone), show a dismissible hint on title or game over (never mid-run, from the 2nd-3rd visit on, never again after "×"): Android/Chromium captures `beforeinstallprompt` (core) and the UI shows an "Installieren" button that triggers it; iOS Safari shows "Teilen → Zum Home-Bildschirm" with a small share icon (no API there). Why: iPhone Safari has no fullscreen API, installed it runs fullscreen and offline. Next wave with items 14-16.
19. **Ball hit drops the person's item (USER 2026-10-08):** when the thrown football hits a person, their item (football from a fan; Brezel/Maßkrug or, in kid mode, Brezel/Lebkuchenherz from a Wasen visitor) falls to the ground and lies on the street; the skater collects it by riding over it (or jumping through it), like a caught item (itemCaught, carriedItem, popup). It scrolls with the street and is lost if missed. Never placed where collecting it would be unfair. Briefed to the next gameplay slice after the easier-stomp slice (gameplay is busy).
20. **Kid mode reachable everywhere (USER 2026-10-08, corrected):** the logo long-press itself works. The problem: once a run has started the title screen with the logo is gone, there is no way back to it, and the installed app (standalone) cannot reload to get it back. Fix: show the logo in the pause menu with the same 3 s long-press (keyboard: hold K) to open the settings; also offer a "Zum Startbildschirm" button in pause and on game over. Switching kid mode during a run restarts the run (short note: "Lauf wird neu gestartet"); the parent check stays for turning it off. Next ui slice (ui busy with Wave 6).
21. **Stronger drunk controls (USER 2026-10-08, approved):** measured before: press-to-takeoff 1 tick sober vs 3-6 ticks drunk (50-100 ms), not noticeable. New: delay 8-20 ticks (130-330 ms) per press, hold length wobbles by up to ±10 ticks (DRUNK_HOLD_WOBBLE, core input, seeded), stronger visible sway of skater and screen; solver and drunk patterns widened to match, the drunk human bot must still get through. Constants set by the orchestrator in core/config.ts (test-first); implementation in Wave 7.

## Status checkpoint 2026-10-08 (night)
- DONE + pushed: Wave 6 (Mombachquelle redrawn without name, big dense Mitte traffic with fx-layer front lane, louder traffic noise, grind trick hint), easier stomps (window ~15 ticks at every speed, late human stomp rate 65% -> 100%), update signal (sw.js updateReady, state.updateReady, reloadForUpdate), changelog data + last-seen version + install state.
- Wave 7 (running): ui (reload button item 15, "Neu in dieser Version" item 16, install hint item 18, logo + "Zum Startbildschirm" in pause item 20, stronger drunk screen effect item 21), world (light traffic item 14, near-layer lamp covering the Mombach basin), gameplay (dropped item pickup item 19, drunk planning item 21), core/docs (drunk hold wobble item 21, world scenario traffic checks, docs for waves 6-7), player (stronger drunk sway item 21).
22. **Flags in windows (USER 2026-10-08):** in Bad Cannstatt one background house has a Palestine flag hanging from a window (black, white, green horizontal stripes with a red triangle at the hoist); in Stuttgart-Mitte one background house has a trans pride flag hanging from a window (light blue, pink, white, pink, light blue horizontal stripes). Small, readable pixel art at 1x, hanging from a window sill (slight drape), on one house each, recurring like other house details. Next world slice (world busy in Wave 7).
23. **Top speed a bit faster again (USER 2026-10-08):** raise TOP_SPEED from 160 to 190 px/s (user decided) (earlier 220 was too fast), keeping the gentle ramp; re-verify fairness windows, stomp window (~15 ticks), drunk patterns and the human bots at the new top speed. Next gameplay slice (gameplay busy in Wave 7).
24. **Light traffic noise (USER 2026-10-08):** the light traffic outside Mitte should make a bit of noise. Contract added by the orchestrator: event `vehiclePassed {kind, front, light}` (world emits when a foreground vehicle's centre crosses PLAYER_X, all zones). Audio (now, parallel to Wave 8): pass-by whoosh per vehicle (engine pitch by kind, quieter for back lane, Doppler-ish sweep), plus an audible low hum at light density. World emits the event in the next world slice (after the flags).
- DONE: light-traffic audio (98bb241: soft hum at light density, pass-by sounds on vehiclePassed; world still has to emit the event).
25. **Remove the parent check (USER 2026-10-08):** turning kid mode off no longer asks the math question; the 3 s long-press (or hold K) to reach the settings is enough. Next ui slice.
26. **No empty streets during effects (USER 2026-10-08):** after drinking or the joint/gum there are long stretches without obstacles, which weakens the effect. Partly from drunk planning (extra run-up, replans that lay empty street while a plan is late). During chill and drunk phases there must always be one or two easy obstacles in view (never hard ones), so the effect is felt. Next gameplay slice.
27. **Epic stunt lines (USER 2026-10-08, plan approved):** optional bonus lines, more fun, not harder; the street path always stays and falling off an upper line never crashes (you land on the street). Camera does NOT move; the upper level lives in the space above the riding line as slim scrolling structures (railings, ledges, thin tent/tram roofs, Stäffele railing, quay wall), so they cover only little background. Kicker ramps launch higher; designed combo lines (ramp → rail → jump → rail → stomp → bench) with growing multiplier and a big "Combo xN!" popup; generous windows and a small rail magnet. Air trick: down while airborne after a big jump (kickflip-style), points + popup. Frequency: about one bonus line every 30-45 s (default, adjustable). Two waves after Wave 8: (a) ramps, upper level, combo lines; (b) air trick and polish.

28. **Update check while the app stays open (USER 2026-10-08):** the user saw the update hint only once. The service worker only compares the page on a navigation (app start), so an installed app that is resumed from the background never checks. Fix: on `visibilitychange` to visible and every few minutes while open, core asks the worker to re-check (`registration.update()` plus a page re-fetch through `storePage`), so the "Neu laden" hint appears after resuming. Orchestrator makes the core part test-first; public/sw.js in the next audio/PWA slice.

29. **Light traffic hum is constant (USER 2026-10-08, bug):** outside Mitte the hum from 98bb241 plays all the time instead of only around a passing vehicle. Fix in the next audio slice: no steady hum at light density; the sound swells in and out with each vehicle (driven by `vehiclePassed` and the vehicle's distance), silence on an empty street. Needs item 24 (world emits `vehiclePassed`) in the same wave.

## Status checkpoint 2026-10-08 (late night)
- Wave 8 committed locally (9db8138 flags, baf650e top speed 190, cbd7f98 ui polish, 910e0f1 docs, 3daca95 changelog .4). NOT pushed: the repo moves to the user's other GitHub account first.
- Repo move (user decided): rewrite the history with the new account's GitHub noreply identity, push to a new repo under the new account with Pages, then make the old repo marvinmai/cannstatt-cruiser private as a backup. Waiting for the user to run `gh auth login` with the new account. git filter-repo is not installed (use pip install or `git filter-branch --env-filter`). Update the Pages URL in this file and the /home/marvin path mention. Installed phone apps must be reinstalled from the new URL.
- Next wave after the move: 24 vehiclePassed from world + 29 hum fix (audio), 25 no parent check (ui), 26 easy obstacles during effects (gameplay), 28 update check while open (core part by orchestrator, sw.js in the audio/PWA slice). Then 27 stunt lines A/B, then the final playtest.

30. **Each flag only once (USER 2026-10-08):** the trans pride flag currently hangs on every `housesB` terrace in Mitte, so several show at once. Both flags must appear exactly once per zone visit: one flagged house instance per pass through Mitte (trans) and through Bad Cannstatt (Palestine), not a whole house type. Next world slice (with item 24).
- DONE 2026-10-08 ~21:50: repo moved. History rewritten to the new account's noreply identity, pushed to https://github.com/marvinmai/cannstatt-cruiser, Pages live at https://marvinmai.github.io/cannstatt-cruiser/ (build 2026-10-08.4). The old repo is private as a backup and its Pages site is removed. Phone apps must be reinstalled from the new URL.

31. **Flags hang down (USER 2026-10-08):** both flags rotated 90° clockwise, as if hung from the window by their hoist edge: the hoist edge is at the top (at the sill), stripes run vertically. Palestine: red triangle at the top pointing down, vertical stripes green (left), white, black (right). Trans pride: vertical light blue, pink, white, pink, light blue. Keep the drape/flutter (the bottom edge sways). Follow-up world slice right after the Wave 9 world slice (together with item 30, flags only once), pushed with priority.

32. **Game sometimes starts muted (USER 2026-10-08, bug):** sound missing until mute is toggled off and on. Likely cause: the audio context was only unlocked on pointerdown, which is no user activation for a touch on phones (only the touch's end is). Fix (orchestrator, core): input reports user gestures also on pointerup, touchend and click (`USER_GESTURE_EVENTS`), so the next finger-up resumes the context. To confirm on a real phone; if it persists, an audio slice investigates (context state after resume, master gain after setMuted, background/foreground interruptions).

## Status checkpoint 2026-10-08 (~23:00)
- Live: build 2026-10-08.7 at https://marvinmai.github.io/cannstatt-cruiser/ (Wave 9 complete, flags once and hanging, audio unlock on finger-up). The old site is offline (404, repo private).
- USER: do NOT push while the user is away; commit locally only. Stunt Wave A running (gameplay-stunt-lines, player-launch, ui-combo, audio-stunts, docs-wave9). The orchestrator's stunt contract in src/types.ts (StuntKind, launch, stuntStep, stuntEnd) is committed together with the gameplay slice, because the build needs its art.
- Next: verify + commit Wave A locally, then Stunt Wave B (air trick + polish), then the final multi-persona playtest + fix round, all committed locally; push only when the user is back.

33. **More combinations of existing elements (USER 2026-10-08):** after the stunt waves, add a few more patterns that combine elements the game already has, e.g. jump from a low grind pipe onto a higher pipe and collect a row of stars up there, or rail -> bench -> rail chains. Not harder: every combination must keep generous take-off windows (fairness rules >= 14 early / >= 12 late, also at 190 px/s), never narrow sequences, and the human bot must not get noticeably worse (report before/after). Gameplay slice, after Stunt Wave B and before the final playtest.

34. **Online highscore list (USER 2026-10-08):** after the final playtest. Backend: Cloudflare Worker + D1 (free plan, no credit card), set up by the user under the marvinmai account email (`wrangler login` once), workers.dev subdomain `marvinmai.workers.dev` (chosen by the user 2026-10-08); the worker code lives in this repo (e.g. `server/`), deployed by the orchestrator. API: `GET /top` (top 20: nickname, score, date) and `POST /score`. Server-side protection: plausibility checks (score vs distance and run time, max points per second, sane ranges), rate limit per device, name length + word filter; store only nickname, score, distance, date (no IP). Game: optional "Eintragen?" with a name after game over (kid mode: only generated nicknames like "Flinker Fuchs 42", no free text), a "Bestenliste" screen from the title; offline: queue the entry and send it later, hide the list while offline; a short privacy note in the game. Not cheat-proof (client-side game), which is fine for friends and family.

35. **Install hint from the first visit (USER 2026-10-08):** `INSTALL_HINT_MIN_VISITS` (src/ui/notices.ts) 2 -> 1, tests and docs updated. All other rules stay (touch only, not installed/standalone, not dismissed, Android only with the browser's install prompt, iOS instructions). Tiny tuning change; the orchestrator makes it test-first right after Stunt Wave A is committed (src/ui is busy with the ui-combo slice).
