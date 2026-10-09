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
  (ducks for ~1.2 s or until the next tap). Short swipes (~8 CSS px) and
  diagonal swipes up to ~45° from vertical count. A swipe down never also jumps; to
  tell it from a tap, a touch during a run waits up to ~83 ms (or until the
  finger lifts) before it jumps. Ducking works on the ground only (not on
  rails, no fast fall in the air); jumping while ducked stands up and jumps.
- Use the carried item: E on the keyboard; on touch (and mouse) a big item
  button that shows only while the skater carries an item (see Using items):
  top right under the HUD buttons in landscape, under the stats plate on the
  left (behind the skater, so it never hides what comes) in portrait.
- Grind trick: down (↓ / S, swipe down) while grinding (see Obstacles and
  scoring).
- Coyote time (~80 ms) and jump buffering (~120 ms).
- P / Escape = pause; P / Escape, Space (the jump key) or a tap resumes.
- On the menu screens: T = "Zum Startbildschirm" (pause, game over), U =
  "Neu laden" (when a new version is ready), Escape on game over = title.

## Skater

- A middle-aged person of normal height under a cap, with tidy grey hair at the
  temple and nape and no moustache. Casual clothes, e.g. hoodie or jacket, jeans and
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
  with a football under the arm, walking slowly at the Neckar near the Arena,
  and tipsy Wasen visitors in Lederhosen or Dirndl holding a Maßkrug or a
  Brezel, swaying, in Bad Cannstatt (kid mode: a Brezel or a Lebkuchenherz
  around the neck, never beer). Bumping into one is friendly: fans cheer with
  their arms up, visitors spill some beer. Landing on one is a stomp (see
  below).
- Grindable rails: handrails and pipes. The Parkbank can be ground too: landing
  on it from above grinds it like a rail; riding into its front or side crashes.
- Landing anywhere on the bench seat, from just before its front corner to its
  rear end, grinds; landing behind it or rolling off its end never crashes.
- Crashing into a Mülltonne sticks the skater head first in the bin for a
  moment (legs and board sticking out, legs kicking), then he pops out, lands
  back on his board and the bin tumbles away. It costs health like any crash.
- Clearing an obstacle by jumping or ducking under it scores points (a duck
  on the ground does not extend a combo). Landing on a rail starts a
  grind, which scores points per tick. A combo multiplier grows for chains that
  don't touch the ground or crash.
- Grind trick: holding down while grinding turns the skater to face the player
  (front view, the only view that shows his moustache) for as long as down is
  held. It ends when down is released or the grind ends and scores 3 trick
  points per tick (times the multiplier) on top of the grind, with the popup
  "Grind-Trick! +…".
- Kickflip (down in the air, see Stunt lines) pays for a reason, not for spam:
  - Over something: a street kickflip pays its full 100 only when that jump
    cleared an obstacle or stomped someone; a flip into empty air pays 20. A
    kickflip after a kicker launch always pays its full 150.
  - Repetition fades: kickflips in a row with nothing else in between pay
    100 %, 50 %, 25 %, then 10 % of that. Clearing an obstacle, a stomp, a
    grind start (rail, bench, ledge), a kicker launch, a high five or 3 s of
    riding without a kickflip make the next one full again.
  - Risk: a kickflip still turning when the wheels touch the street (more
    than 3 ticks left) is a bail: a crash like on any obstacle (one heart,
    combo broken, carried item lost) with the popup "Zu spät geflippt!", and
    the trick scores nothing. Started early on a high jump, e.g. at the top,
    it always finishes; a rail or ledge catch never bails.
  - A full kickflip gets the big "Kickflip! +…" callout and its sting; a cut
    one only a plain "Kickflip +…" popup and the plain trick sound. Kid mode
    follows the same rules.
- Grind trick hint: until the player has done a grind trick once (stored on
  the device), the first 3 grinds of a run show a small plate under the
  skater: "↓ = Trick!" with a key cap on desktop, "Wisch runter = Trick!" on
  touch. It hides while the trick is held and when the grind ends.

## Stomp and carried items

- Landing on top of a person while falling is not a crash but a stomp
  (coming down on the head or shoulders, or just beside the head; the window
  is about a quarter second of take-off timing at every speed): the
  skater bounces off (like a small jump without hold), the person tumbles onto
  their back and sits up dazed with stars circling their head, then laughs.
  Friendly, no violence. Afterwards the person is harmless.
- The person's item pops up in a short arc and lands in the skater's hands
  after ~0.45 s, also if the skater jumps or ducks meanwhile (it homes in on
  the hands); a flying Maßkrug spills a few foam drops. Popup: "Ball
  geschnappt!", "Brezel!", "Prost!" or "Lebkuchenherz!" (kid mode never shows
  "Prost!"), plus bonus points.
- The skater carries the item under the arm until he uses it or the next
  crash (a crash while it flies loses it too); a new run starts empty-handed.
  A Maßkrug is drunk by itself after ~6 s in hand (Wave 5c), so beer cannot
  be carried around forever.
- A stomp counts as a trick in the combo. Patterns never require a stomp.

## Using items

The carried item can be used (E, or the item button on touch); using it
empties the hands:

- **Maßkrug** (never in kid mode): the skater drinks it (popup "Prost! Gluck
  gluck gluck", glug sound) and is drunk for 6 s: jump and duck react
  clearly late, ~130-330 ms (8-20 ticks, a deterministic random delay), and
  every press's hold comes out up to 10 ticks shorter or longer, so a tap
  can become a high jump and a long hold a small one (no press is ever
  lost). The skater sways up to 2 px over the board and now and then
  staggers with a flailing arm; the screen sees double (two faint copies
  swaying against each other, up to 6 px), with a slowly pulsing amber wash
  and darker side edges; the HUD stays sharp and shows a draining Maßkrug
  timer. Meanwhile (and already while a Maßkrug is in hand or within reach)
  the spawner places only easy patterns (single or paired ground obstacles,
  no people, nothing overhead, no rails, a longer run-up) that are clearable
  with that delay and hold wobble by a player who holds the button long
  (~0.7 s) for a sure full jump. The street never goes empty while drunk
  (see Difficulty). Not used within ~6 s (counted from when it
  came into the hands), it is drunk by itself.
- **Brezel / Lebkuchenherz**: eating it gives +1 health ("Lecker! +1"); at
  full health 150 bonus points instead (times the multiplier).
- **Football**: thrown forward ("Wurf!"). Hitting a person makes them tumble
  (150 points times the multiplier, "Treffer!"). A miss ricochets back with a
  deterministic 50 % chance ("Achtung, der Ball!"), but only onto free street
  (no obstacle within 1 s of riding around where it meets the skater) and
  never while he is drunk; it bounces low and knocks the skater off the board
  (crash, -1 health) unless he jumps over it. Otherwise it rolls away.
- Popups of one moment are merged: a stomp and its points become one
  "Stomp! +150".

## Dropped items

- A person hit by the thrown football lets go of their item: it pops up a
  little and falls in a short arc onto the street, a bit further along than
  the person (VfB fan: the football; Wasen visitor: Brezel or Maßkrug; kid
  mode: Brezel or Lebkuchenherz, never beer). It lies on the street with a
  small shadow and a glint and scrolls with it.
- The skater picks it up by touching it: riding over it, or jumping through
  it low enough (a high jump passes over it). The pickup works like a catch
  (catch popup, bonus points; a picked-up Maßkrug is drunk by itself ~6 s
  later). It always replaces what he carries: the newest item wins.
- A missed item scrolls off the screen and is gone. It only ever comes to
  lie on free street (about half a second of riding with no obstacle on
  either side, else a bit further or just before the person, else nothing
  drops), so collecting it never needs a risky move.

## Health

- Health bar with 5 segments.
- Crashing into an obstacle (or a kickflip bail) costs 1 segment, plays a short stumble animation and
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

In kid mode (see Settings) the joint is a pink bubble gum ("Kaugummi") with
exactly the same effect: the skater blows a bubble instead of smoking, the
tint is a light, sweet pink and the HUD timer shows a gum bubble. Nothing in
kid mode refers to drugs.

## Settings (hidden)

- A settings menu "Einstellungen" with one setting, "Kindermodus", **on by
  default** (ROADMAP 39): a player who never chose plays in kid mode; an
  explicit choice in the menu (off or on) is stored in localStorage and
  kept.
- Kid mode is invisible (ROADMAP 38): no "Kindermodus" badge or sign on the
  title or anywhere else; only the hidden menu shows the switch.
- It has no visible button, so kids don't find it by accident: it opens on
  the title screen and on the pause screen by holding the "Cannstatt
  Cruiser" logo for 3 s (touch or mouse) or holding K for 3 s. A subtle
  progress bar appears only after ~1 s of holding. A shorter press on the
  logo is a normal tap and starts the run (title) or resumes (pause); the
  long press never does.
- Switching kid mode from the pause screen restarts the run (the menu says
  "Lauf wird neu gestartet"); the run so far still counts for the highscore
  and the star total.
- Kindermodus turns on and off at once; the hidden 3 s long press is the
  only guard (the earlier parent check was dropped in Wave 9).
- "Zurück" and Escape close the menu. All text is German.

## Difficulty

- Speed ramps gently from 90 to at most 190 px/s (over ~5 min); obstacle
  density and the pattern mix keep getting harder before that. The spawner
  guarantees that every pattern can be cleared with the available jump, also
  with moving people and with the lower chill jump where the chill effect can
  be active.
- Every pattern is fair for humans, not just for frame-perfect input: each
  take-off leaves a window of at least 14 ticks (~230 ms) in the first ~90 s,
  while the player is still learning, then at least 12 ticks (~200 ms), with
  a tap, half or full press at every speed, chilled too, and room to land.
  Every pattern is also checked together with the end of the previous one.
- Drunk and chilled phases keep the street busy with easy things to jump:
  no empty star stretches, only easy patterns while chilled (single pieces
  and pairs), at most ~1.1 s of free street after each pattern, and a lone
  curb gap or bench where nothing else fits. No joint comes while the skater
  is (or may soon be) drunk.
- People come alone in their pattern, with at least ~1 s of free street
  before and after them (nobody walks into other obstacles); where their
  window is impossible (e.g. chilled at the slowest speeds) no person comes.
  Acceptance: a bot with human timing (take-off +-4 ticks, three press
  lengths, sloppy ducking) has no crash into or within 1 s of a person in 20
  runs of 3 minutes.

## Stunt lines

ROADMAP 27 (Stunt Waves A and B): epic stunt lines that make runs more fun,
not harder.

- Kicker ramps on the street launch the skater high when the player
  presses jump on the ramp (ROADMAP 40; never automatically). The window is
  generous: a press shortly before the ramp, on it, or right after its lip
  counts, and an ollie that press already started turns into the launch.
  Without a press the skater simply rolls over the ramp (no launch, never a
  crash). A hint near each ramp says "Auf der Rampe springen! (Leertaste)"
  (keyboard) or "Auf der Rampe tippen!" (touch) until the player has
  launched a few times;
  slim ledges, railings and roof edges of an upper level 40-60 px above the
  street can be ground; a line chains kicker air, ledge grinds and gap jumps
  for a growing combo ("Combo x2!", "Combo x3!" ...; the first piece starts
  the line without a callout) and a line bonus ("Stunt-Linie! +…").
- Air trick: down (↓ / S, a swipe down) in the air after a launch or a high
  jump does a kickflip, scored on a clean landing ("Kickflip! +…"; see
  Obstacles and scoring for what it pays and the late-flip bail). It never
  changes the jump. Hints explain the ramp jump and the trick.
- The camera never moves; the upper level is slim and covers little of the
  background.
- Falling off or missing a stunt piece never costs health or crashes: the
  skater lands on the street, which always stays clearable, and the line
  ends. Generous timing.
- Roughly one line every 30-45 s of riding; none while drunk or chilled.
  Kid mode works the same.

## NorDIY skatepark

ROADMAP 36: once per Bad Cannstatt visit the skater rides through NorDIY, a
self-built but well built DIY skatepark about one screen wide.

- Scenery: two shipping containers, a self-built crane, concrete banks and a
  ramp under construction, people chilling on the containers and a pallet
  sofa, string lights, graffiti, some green. A wooden plank sign "NorDIY"
  hangs on a container ("Nor" white, "DIY" yellow, hand-painted).
- A guaranteed, optional stunt line: banks as kickers (jump on them like on
  every ramp), container roofs as
  ledges, the crane boom as the highest ledge with a bonus star.
- The crowd cheers for grind tricks, air tricks and combo steps; leaving the
  park gives a "Session! +…" bonus scaled by the cheering.
- High five: a skater at the edge raises a hand; pressing use (E / the item
  button) at the right moment gives a small bonus and a popup, and does not
  use a carried item.
- Safe spot: no traffic, no crash obstacles, the speed stays. Park sounds and
  a boombox with a short chill chiptune loop that fades in and out (the only
  music in the game; mute and ducking apply).
- Kid mode: lemonade instead of beer; nothing about alcohol or drugs.

## Zones

The parallax background has 3-4 layers. A run (and the title) starts in Bad
Cannstatt; the route then rides back and forth along the river, always to a
neighbouring zone, with smooth transitions through a landmark gateway:
Cannstatt -> Neckar -> Stuttgart-Mitte -> Neckar -> Cannstatt -> ...

1. **Stuttgart-Mitte:** Fernsehturm, Hauptbahnhof tower with the rotating
   Mercedes star, Stäffele (stair lanes), vineyards on the hills around the
   basin, a yellow Stadtbahn (U-Bahn) train.
   Suddenly dense, big traffic on the foreground street close to the camera
   (below the riding line, never covering obstacles, people or the skater):
   a back lane of cars and vans driving with the skater and an oncoming front
   lane with city buses and trucks. Big exhaust clouds drift up behind the
   action, headlights flash now and then, and the street rumbles by a pixel
   while a bus or truck passes. Loud traffic noise: a layered rumble (road
   noise, tyre hiss, engine drone) that dips briefly under gameplay sounds,
   car, small-car and deep bus / truck horns, and passing trucks.
   Everywhere else (Neckar, Bad Cannstatt) the street has light traffic:
   a single car or van now and then (a bus rarely, no trucks), one at a
   time with 4-11 s of empty street between, under the same rules. There
   is no steady hum there: each vehicle is heard as it passes (its noise
   swells in and out, with a pass-by whoosh by vehicle kind), and the
   street is quiet in between; no horns or trucks.
   A small trans pride flag hangs vertically from a top-floor window of a
   city terrace, once per Mitte visit, never covered by street props.
2. **Neckar:** river, bridge, Stadtbahn, Mercedes-Benz Arena silhouette, the
   Mombachquelle's outlet into the river after the real place, without any
   sign: a basin of light grey boulders at the foot of a green embankment,
   a stair, two benches, the spring jetting from a culvert into the basin, a
   bin on a tree and people chilling there (scenery, not obstacles).
3. **Bad Cannstatt:** Altstadt half-timbered houses, Kursaal, Mineralbad /
   mineral water fountain, Cannstatter Wasen with Fruchtsäule, Riesenrad (Ferris
   wheel) and beer tents (Volksfest), the Grabkapelle on the vineyard-covered Württemberg in the distance.
   A small Palestine flag hangs vertically from an upper window of a
   half-timbered house, once per Cannstatt visit, never covered by street
   props.

The art is recognisable but stylised.

## Screens (German)

- Titelbildschirm ("Tippen oder Leertaste zum Starten").
- HUD (Punkte, Sterne, Gesundheit, chill timer while chilled). Numbers use the
  German thousands dot (61.234).
- Pause ("Tippen zum Weiterfahren" / "Leertaste, P oder Esc zum Weiterfahren")
  with the logo (long press = settings, see Settings) and a "Zum
  Startbildschirm" button (T): it ends the run, which still counts for the
  highscore and star total, and shows the title. The installed app has no
  other way back to the title.
- Desktop title hints name the keys: "Leertaste kurz = kleiner Sprung",
  "Halten = hoher Sprung", "P/Esc = Pause, M = Ton aus".
- Game Over with Punkte, Highscore, Sterne, a restart and "Zum
  Startbildschirm" (T).
- Highscore and the star total are stored in localStorage.
- Mute button.
- On phones the pause, mute, fullscreen and settings buttons have tap areas
  of at least ~44 CSS px; desktop keeps small buttons.

## Bestenliste (online highscores)

- A shared online top 20 ("Bestenliste") with nickname, Punkte and date.
  The title has a trophy button in the top-right row (key B) that opens it;
  on phones the list scrolls. Offline the list is hidden behind a short
  note.
- After game over an "Eintragen" button appears only when the score would
  make the top 20. It asks for a name (on-screen keyboard on touch); the name
  is remembered, so later entries take one tap. Then the list shows with the
  own entry highlighted. Nothing in the pause menu.
- Kid mode: no free-text names, only generated nicknames such as "Flinker
  Fuchs 42".
- Entering is optional. An entry made offline is queued and sent later.
- Privacy: only nickname, score, distance, run time and date are stored (no
  IP address, no account); a short note in the game says so.
- The server rejects names that break the rules or the word filter and runs
  that the game cannot produce (too fast, too many points), and limits how
  often one device can send. It is not cheat-proof, which is fine for
  friends and family.

## Updates, install hint and what's new

- **New version:** when the service worker has fully cached a newer
  deploy, title, pause and game over (never mid-run) show "Neue Version da"
  with a real button "Neu laden" (touch-sized; keyboard U) that reloads the
  page. It is a button because the installed app has no browser reload.
  An app that stays open (or comes back from the background) re-checks for
  a new deploy on resume and every 5 minutes.
- **"Neu in dieser Version":** every build has a version id and a short
  German changelog (a few bullet points per version, never about drugs or
  alcohol, since kid mode shows them too). After an update (the stored
  last-seen version is older; never on the very first visit) this screen
  lists the changes since then, newest first, at most 6 lines, before the
  normal title. "Weiter", a tap anywhere or any key (but M) continues to the
  title and stores the new version as seen.
- **Install hint:** on phones and tablets only, when the game is not
  already running installed, from the first visit on, on title and game over
  (never in pause or mid-run): "Als App: Vollbild und offline" with an
  "Installieren" button where the browser offers an install prompt
  (Android / Chromium), or "Teilen [share icon] -> Zum Home-Bildschirm" on
  iPhone / iPad (no API there; installed it runs fullscreen and offline).
  "×" hides it for good. On game over it is a compact card ("App
  installieren" and "×") so the results stay readable.

## Audio

- Chiptune-style SFX generated with WebAudio: jump, land, grind loop, star,
  crash, game over.
- The audio context is unlocked on the first input (also when the finger
  lifts, so phones never start silent). Mute is persisted.
- Stuttgart-Mitte adds the traffic noise (rumble, horns, passing trucks; see
  Zones); outside Mitte each passing vehicle swells in and out with a
  pass-by sound, with silence in between.

## PWA

- Installable: manifest, icons generated as pixel art, and a service worker for
  offline play.
- Deployable to GitHub Pages under a sub-path (relative base).

## Art

All art is drawn in code from palette-based sprite strings. There are no
external image assets.
