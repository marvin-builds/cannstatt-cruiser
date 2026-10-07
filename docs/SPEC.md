# Cannstatt Cruiser – product spec

A fullscreen 2D pixel-art endless side-scroller. A skater rides left to right
through Stuttgart and Bad Cannstatt. It must be fully playable on phones (touch)
and on desktop (keyboard and mouse). The UI language is German.

## Rendering

- Internal resolution is 180 pixels high and 320 wide at minimum; the width
  grows up to 427 (about 21:9) to use the spare screen width left by the
  integer scale.
  Scaling is nearest-neighbour and integer: use the largest scale that stays
  crisp, fill the small remaining space with a matching colour (letterbox),
  keep image smoothing off and respect devicePixelRatio.
- Fullscreen API with a button and a fallback. On phones, landscape is the play
  orientation; in portrait the game shows a "Bitte Gerät drehen" hint (it may
  keep rendering behind it).
- Updates run on a fixed 60 Hz timestep; rendering uses requestAnimationFrame.
- No page scrolling, zooming, text selection, long-press menu or double-tap
  zoom on mobile.

## Controls

- Jump: Space / ArrowUp / W / mouse button / touch anywhere.
- Tap = small ollie, hold = higher jump (variable jump height up to a maximum
  hold time).
- Duck: ArrowDown / S (held while the key is held), or a swipe down on touch
  (ducks for ~0.6 s or until the next tap). A swipe down never also jumps; to
  tell it from a tap, a touch during a run waits up to ~83 ms (or until the
  finger lifts) before it jumps. Ducking works on the ground only (not on
  rails, no fast fall in the air); jumping while ducked stands up and jumps.
- Coyote time (~80 ms) and jump buffering (~120 ms).
- P / Escape = pause; P / Escape, Space (the jump key) or a tap resumes.

## Skater

- A middle-aged person of normal height, with salt-and-pepper (mixed dark-grey)
  hair visible under a cap. Casual clothes, e.g. hoodie or jacket, jeans and
  sneakers.
- Board: a short longboard. The deck is longer than a street board, with a slight
  kicktail and visibly bigger, soft wheels.
- Animations: push, ride, ollie/jump, air, land, grind, crash/fall.

## Obstacles and scoring

- Obstacles: Mülltonne (bin), Absperrbake (traffic barrier), Parkbank,
  Pflanzkübel (planter), Bordstein/curb gaps.
- Overhead obstacles hanging from posts or a pole: Absperrbanner with a
  construction warning sign on a gantry, Stadtbahn-Haltestellenschild (green H
  on yellow) with timetable on a cantilever. They can only be ducked under
  (too high to jump over) and unlock at a mid difficulty tier.
- People, themed by zone, about the skater's size and low enough to jump:
  VfB fans in red and white (scarf, jersey with chest band, no club crest)
  walking slowly at the Neckar near the Arena, and tipsy Wasen visitors in
  Lederhosen or Dirndl with a Maßkrug, swaying, in Bad Cannstatt. Bumping into
  one is friendly: fans cheer with their arms up, visitors spill some beer.
- Grindable rails: handrails and pipes. The Parkbank can be ground too: landing
  on it from above grinds it like a rail; riding into its front or side crashes.
- Clearing an obstacle by jumping or ducking under it scores points (a duck
  on the ground does not extend a combo). Landing on a rail starts a
  grind, which scores points per tick. A combo multiplier grows for chains that
  don't touch the ground or crash.

## Health

- Health bar with 5 segments.
- Crashing into an obstacle costs 1 segment, plays a short stumble animation and
  gives ~1.5 s of invulnerability (blinking). Empty = Game Over.

## Stars

- Collectible floating stars, just for fun (no gameplay effect). The HUD shows a
  counter, and the lifetime total is persisted in localStorage.

## Joint (chill effect)

- A rare joint pickup (never in the first 30 s, then at most one every
  ~45-60 s). Picking it up chills the skater for ~6 s: red eyes and a smoking
  joint in the mouth, the street slows to ~60 % (easing in over ~0.5 s and
  back over the last ~1 s), jumps are a bit lower (80 % take-off speed), a
  warm hazy tint lies over the screen and the HUD shows a draining timer.
  Score and combo are unaffected.

## Difficulty

- Speed ramps gently from 90 to at most 165 px/s (over ~4 min); obstacle
  density and the pattern mix keep getting harder before that. The spawner
  guarantees that every pattern can be cleared with the available jump, also
  with moving people and with the lower chill jump where the chill effect can
  be active.

## Zones

The parallax background has 3-4 layers and cycles endlessly through the zones
with smooth transitions:

1. **Stuttgart-Mitte:** Fernsehturm, Hauptbahnhof tower with the rotating
   Mercedes star, Stäffele (stair lanes), vineyards on the hills around the
   basin, a yellow Stadtbahn (U-Bahn) train.
2. **Neckar:** river, bridge, Stadtbahn, Mercedes-Benz Arena silhouette.
3. **Bad Cannstatt:** Altstadt half-timbered houses, Kursaal, Mineralbad /
   mineral water fountain, Cannstatter Wasen with Fruchtsäule, Riesenrad (Ferris
   wheel) and beer tents (Volksfest), the Grabkapelle on the vineyard-covered Württemberg in the distance.

The art is recognisable but stylised.

## Screens (German)

- Titelbildschirm ("Tippen oder Leertaste zum Starten").
- HUD (Punkte, Sterne, Gesundheit, chill timer while chilled). Numbers use the
  German thousands dot (61.234).
- Pause.
- Game Over with Punkte, Highscore, Sterne and a restart.
- Highscore and the star total are stored in localStorage.
- Mute button.

## Audio

- Chiptune-style SFX generated with WebAudio: jump, land, grind loop, star,
  crash, game over.
- The audio context is unlocked on the first input. Mute is persisted.

## PWA

- Installable: manifest, icons generated as pixel art, and a service worker for
  offline play.
- Deployable to GitHub Pages under a sub-path (relative base).

## Art

All art is drawn in code from palette-based sprite strings. There are no
external image assets.
