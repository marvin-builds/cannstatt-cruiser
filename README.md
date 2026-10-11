# Cannstatt Cruiser

A pixel-art endless skate runner through Stuttgart and Bad Cannstatt. Ride along the Neckar,
past the Wasen and into the city centre, jump over bins, grind benches and ledges, and land a
kickflip in front of the Riesenrad. The game texts are in German.

### [▶ Play now: marvinmai.github.io/cannstatt-cruiser](https://marvinmai.github.io/cannstatt-cruiser/)

It runs in the browser on desktop and phones, and you can install it as an app on your phone
(fullscreen, works offline).

![The skater bounces off a Wasen visitor in front of the Riesenrad, the popup says "Stomp! +130"](docs/screenshots/stomp.png)

## Highlights

| | |
|:-:|:-:|
| ![Title screen with the logo and the German controls help](docs/screenshots/title.png) | ![The skater grinds a ledge high above the street in Stuttgart-Mitte, with the Fernsehturm and the Hauptbahnhof tower behind](docs/screenshots/stunt-line.png) |
| Title screen with the controls | A stunt line in Stuttgart-Mitte: "Linie x2!" |
| ![High five at the NorDIY skatepark with a "klatsch" burst and the popup "High Five! +100", the NorDIY container behind](docs/screenshots/nordiy-high-five.png) | ![Kid mode with a pink bubble-gum tint, Wasen visitors carrying a Lebkuchenherz and a Brezel, the Kursaal behind](docs/screenshots/kid-mode.png) |
| High five at the NorDIY skatepark | Kindermodus: bubble gum and Lebkuchenherz |
| ![The online Bestenliste with nicknames like Wasen-Wiesel and Neckarblitz](docs/screenshots/bestenliste.png) | ![The game on a phone in landscape at the Neckar bridge, with the touch buttons and the item button](docs/screenshots/phone.png) |
| The online "Bestenliste" | On a phone at the Neckar, with touch controls |

## Controls

| Action | Keyboard | Touch |
|---|---|---|
| Jump (tap = small ollie, hold = higher jump) | Space, ↑ or W (or a mouse click) | Tap anywhere, hold for higher |
| Duck | ↓ or S (held) | Swipe down |
| Boardslide (while grinding) | ↓ or S | Swipe down |
| Kickflip (in the air) | ↓ or S | Swipe down |
| Use the carried item / high five | E | The item button |
| Kicker ramp | Jump on the ramp | Tap on the ramp |
| Pause | P or Esc | Pause button |
| Sound on/off | M | Speaker button |
| Bestenliste (title screen) | B | Trophy button |
| Feedback | F | Pause menu or speech bubble on the title |
| Einstellungen (title screen) | G, or hold K for 3 s | Gear button, or hold the logo for 3 s |

On phones, landscape is the play orientation.

## Features

- **Real places:** Bad Cannstatt (Altstadt, Kursaal, the Cannstatter Wasen with Riesenrad,
  beer tents and Fruchtsäule, the Grabkapelle on the Württemberg), Am Neckar (the bridge with the
  Stadtbahn, the Mercedes-Benz Arena, the Mombachquelle) and Stuttgart-Mitte (Fernsehturm,
  Hauptbahnhof tower, Stäffele, vineyards and heavy traffic). The route rides back and forth
  between them.
- **Tricks:** ollies, ducking, stomps (land on a person's head, bounce off and catch what they
  carry), rail and bench grinds with a boardslide, kickflips, kicker ramps and stunt lines over
  ledges with a growing combo.
- **NorDIY skatepark:** a DIY park with containers, a crane, a cheering crowd and a skater who
  wants a high five.
- **Items:** catch a football, a Brezel or a Lebkuchenherz and use them: eat for health, throw
  the ball. Collect stars on the way.
- **Kindermodus:** kid-friendly pictures and texts, switched on in the settings (the gear on the
  title screen). Kid mode hides the gear; holding the logo (or K) for 3 s opens the settings to
  switch it off again.
- **Online Bestenliste:** a shared top 20 with nicknames, one entry per device (not in kid mode).
- **Offline and installable:** a PWA with a service worker. "App installieren" is always in the
  settings (until installed); phones also get it on game over after a good run ("×" snoozes it).
  Without the browser's install dialog it shows the steps (Android menu, iOS "Teilen"). After
  updates a "Neu in dieser Version" screen shows.
- **Feedback:** send a bug report ("Fehler") or an idea ("Idee") from inside the game (not in kid mode).

## Privacy

The game stores your records on your device. The online list keeps only nickname, score,
distance, run time and date. Anonymous play statistics (no IP address) can be switched off in
the game ("Anonyme Statistik"). Details: [Datenschutz](https://marvinmai.github.io/cannstatt-cruiser/datenschutz.html).

## Development

Needs Node.js 22.

```sh
npm install
npm run dev        # dev server (test hook window.__game is on)
npm test           # Vitest unit tests
npm run build      # type-check and production build into dist/
npm run preview    # serve the build
npm run playtest   # Playwright screenshots + state log in playtest-output/
```

Regenerate the screenshots in this README (after art changes):

```sh
npm run playtest -- --scenario scripts/scenarios/readme-shots.ts --viewports desktop,phone-landscape --name readme-shots
```

The highscore, statistics and feedback worker lives in [`server/`](server/README.md) with its
own `package.json` and tests (`cd server && npm install && npx vitest run`).

More docs:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): modules, contracts, events
- [docs/TESTING.md](docs/TESTING.md): unit tests, test hooks, playtest harness
- [docs/SPEC.md](docs/SPEC.md): product spec
- [docs/ROADMAP.md](docs/ROADMAP.md): plans and status

**Releases:** CI tests and builds every push to `main`. A release deploys to GitHub Pages when a
tag `v<version>` is pushed, where `<version>` is the newest entry in `src/changelog.ts`.

## Tech

Vite + TypeScript + Canvas 2D, no game engine. All pixel art is drawn in code from palette sprite
strings (no image files), the sound effects are generated with WebAudio, and the game runs on a
fixed 60 Hz timestep. The online list, statistics and feedback run on a Cloudflare Worker with
a D1 database.
