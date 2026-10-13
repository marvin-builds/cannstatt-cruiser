/**
 * What changed in each deployed build, newest first. The orchestrator adds an
 * entry for every deploy (see docs/ARCHITECTURE.md, Changelog). Items are short
 * German bullet points in game-font glyphs and kid-safe: kid mode shows them too.
 */

export interface ChangelogEntry {
  /** `YYYY-MM-DD.n`: the deploy date and that day's build number (compareVersions). */
  version: string;
  /** `YYYY-MM-DD`, the date part of the version. */
  date: string;
  items: string[];
  /**
   * English lines (ROADMAP 71), one per item in the same order and under the same limits. Entries
   * from before English have none; the ui then shows the German items.
   */
  en?: string[];
}

/** Item limits, so an entry fits the "Neu in dieser Version" screen. */
export const CHANGELOG_ITEM_MAX_CHARS = 40;
export const CHANGELOG_MAX_ITEMS_PER_ENTRY = 6;
/** Entries shown at most on the (scrollable) screen: the newest ones since the last-seen version, each with all its items. */
export const WHATS_NEW_MAX_ENTRIES = 10;

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: '2026-10-13.2',
    date: '2026-10-13',
    items: ['Neues Symbol für die Einstellungen'],
    en: ['New icon for the settings'],
  },
  {
    version: '2026-10-13.1',
    date: '2026-10-13',
    items: ['NorDIY: freie Straße vor den Containern'],
    en: ['NorDIY: clear street by the containers'],
  },
  {
    version: '2026-10-12.6',
    date: '2026-10-12',
    items: [
      'Englisch: DE/EN im Startbild',
      'Kleine Missionen während der Fahrt',
      'Mit allen Herzen wird es voller',
    ],
    en: [
      'English: DE/EN on the title',
      'Small missions while you ride',
      'With all hearts it gets busier',
    ],
  },
  {
    version: '2026-10-12.4',
    date: '2026-10-12',
    items: [
      'Kurz aufsetzen hält die Combo',
      'Spät im Lauf seltener Brezeln',
      'Schönerer Dreh-Hinweis',
      'Aufgeräumtes Feedback-Fenster',
    ],
    en: [
      'A short landing keeps the combo',
      'Fewer pretzels late in a run',
      'Nicer rotate hint',
      'Tidier feedback window',
    ],
  },
  {
    version: '2026-10-12.3',
    date: '2026-10-12',
    items: [
      'Eigenes Feedback wieder löschen',
      'Mein Feedback dreht sich wieder mit',
    ],
    en: [
      'Delete your own feedback',
      'My feedback turns with you again',
    ],
  },
  {
    version: '2026-10-12.2',
    date: '2026-10-12',
    items: [
      'Fan-Massen: über die Köpfe springen!',
      'Feedback: Danke-Seite nach dem Senden',
      'Zurück-Taste führt zurück ins Menü',
      'Knöpfe nicht mehr unter der Kamera',
      'Weicher Wechsel nach dem Feedback',
    ],
    en: [
      'Fan crowds: jump over their heads!',
      'Feedback: thank-you page after sending',
      'Back button returns to the menu',
      'Buttons no longer under the camera',
      'Smooth switch after feedback',
    ],
  },
  {
    version: '2026-10-12.1',
    date: '2026-10-12',
    items: [
      'Kein Installier-Hinweis mehr in der App',
      'Großer Dreh-Hinweis im Hochformat',
      'Feedback tippen ohne Dreh-Hinweis',
    ],
    en: [
      'No install hint inside the app',
      'Big rotate hint in portrait',
      'Type feedback without rotate hint',
    ],
  },
  {
    version: '2026-10-11.11',
    date: '2026-10-11',
    items: [
      'Mein Feedback: sieh, was draus wurde',
      'Roter Punkt bei Neuem zu deinem Feedback',
      'Vor dem Senden ansehen, was rausgeht',
      'Neues Zahnrad für die Einstellungen',
      'App installieren klappt wieder',
      'Weniger Ducken am Stück',
    ],
    en: [
      'My feedback: see what came of it',
      'Red dot for news on your feedback',
      'See what gets sent before sending',
      'New gear for the settings',
      'Installing the app works again',
      'Less ducking in a row',
    ],
  },
  {
    version: '2026-10-11.10',
    date: '2026-10-11',
    items: [
      'Sterne geben jetzt Punkte',
      'Neu: Roller und Tauben auf der Straße',
      'Hindernis-Wellen mit Verschnaufpause',
      'Antwort auf dein Feedback im Spiel',
    ],
    en: [
      'Stars now give points',
      'New: scooters and pigeons',
      'Obstacle waves with a breather',
      'Replies to your feedback in the game',
    ],
  },
  {
    version: '2026-10-11.9',
    date: '2026-10-11',
    items: [
      'Neue Hindernis-Kombis auf der Straße',
      'Vom Kopf abspringen: tippen oder halten',
      'Hoch nur noch über die Rampe',
      'Zahnrad öffnet die Einstellungen',
      'Großes Feedback-Fenster im Hochformat',
      'Ton bleibt zuverlässig an',
    ],
    en: [
      'New obstacle combos on the street',
      'Jump off heads: tap or hold',
      'Up only over the ramp',
      'The gear opens the settings',
      'Big feedback window in portrait',
      'Sound stays on reliably',
    ],
  },
  {
    version: '2026-10-11.8',
    date: '2026-10-11',
    items: ['Datenschutz-Seite ergänzt'],
    en: [
      'Privacy page extended',
    ],
  },
  {
    version: '2026-10-11.7',
    date: '2026-10-11',
    items: [
      'Mehr los auf der Straße',
      'Neu: Boardslide auf dem Geländer',
      'Updates kommen schneller an',
    ],
    en: [
      'More going on in the street',
      'New: boardslide on the rail',
      'Updates arrive faster',
    ],
  },
  {
    version: '2026-10-11.6',
    date: '2026-10-11',
    items: [
      'Feedback-Fenster repariert',
      'Zum Tippen aufs Hochformat drehen',
    ],
    en: [
      'Feedback window fixed',
      'Turn to portrait for typing',
    ],
  },
  {
    version: '2026-10-11.5',
    date: '2026-10-11',
    items: [
      'Feedback senden: Pause oder Startbild',
      'Größere Schrift im Hochformat',
    ],
    en: [
      'Send feedback: pause or title',
      'Bigger text in portrait',
    ],
  },
  {
    version: '2026-10-11.4',
    date: '2026-10-11',
    items: [
      'Echtes High Five im NorDIY-Park',
      'High Five mit Klatsch und Jubel',
    ],
    en: [
      'Real high five in the NorDIY park',
      'High five with clap and cheer',
    ],
  },
  {
    version: '2026-10-11.3',
    date: '2026-10-11',
    items: [
      'Datenschutz-Seite im Spiel verlinkt',
    ],
    en: [
      'Privacy page linked in the game',
    ],
  },
  {
    version: '2026-10-11.2',
    date: '2026-10-11',
    items: [
      'Anonyme Statistik (abschaltbar)',
    ],
    en: [
      'Anonymous statistics (can opt out)',
    ],
  },
  {
    version: '2026-10-11.1',
    date: '2026-10-11',
    items: [
      'Bestenliste: nur dein bester Lauf',
      'Kindermodus: eigener Rekord',
    ],
    en: [
      'Leaderboard: only your best run',
      'Kid mode: its own record',
    ],
  },
  {
    version: '2026-10-10.1',
    date: '2026-10-10',
    items: [
      'Kindermodus-Knopf im Startbildschirm',
      'Eigenen Namen in der Bestenliste',
    ],
    en: [
      'Kid mode button on the title',
      'Your own name on the leaderboard',
    ],
  },
  {
    version: '2026-10-09.6',
    date: '2026-10-09',
    items: [
      'Wacklig oder entspannt: Flip schwerer',
      'Das Brett wackelt beim Flip',
    ],
    en: [
      'Wobbly or relaxed: flips are harder',
      'The board wobbles on a flip',
    ],
  },
  {
    version: '2026-10-09.5',
    date: '2026-10-09',
    items: [
      'Kickflip-Serien bringen weniger',
      'Kickflip über Hindernisse lohnt sich',
      'Zu spät geflippt, dann fällst du',
    ],
    en: [
      'Kickflip streaks give less',
      'Kickflips over obstacles pay off',
      'Flip too late and you fall',
    ],
  },
  {
    version: '2026-10-09.4',
    date: '2026-10-09',
    items: [
      'Online-Bestenliste mit Pokal-Knopf',
      'Rampe: selbst springen drücken',
      'Ohne Sprung rollst du drüber',
      'Hinweis zeigt, wann du springst',
    ],
    en: [
      'Online leaderboard with trophy button',
      'Ramp: press jump yourself',
      'No jump and you roll over it',
      'A hint shows when to jump',
    ],
  },
  {
    version: '2026-10-09.3',
    date: '2026-10-09',
    items: [
      'Kickflip: in der Luft runterziehen',
      'Kickflip mit großer Anzeige und Sound',
      'Startbildschirm-Knopf in der Ecke',
      'Hinweise bleiben länger stehen',
      'High Five behält deinen Gegenstand',
      'Kindermodus-Anzeige im Titel',
    ],
    en: [
      'Kickflip: swipe down in the air',
      'Kickflip with big popup and sound',
      'Title screen button in the corner',
      'Hints stay longer',
      'High five keeps your item',
      'Kid mode shown on the title',
    ],
  },
  {
    version: '2026-10-09.2',
    date: '2026-10-09',
    items: ['Neue Grind-Kombis mit Sternen'],
    en: [
      'New grind combos with stars',
    ],
  },
  {
    version: '2026-10-09.1',
    date: '2026-10-09',
    items: [
      'Neuer Skatepark NorDIY in Cannstatt',
      'High Five mit E oder dem Knopf',
      'Session-Bonus für Tricks im Park',
      'Kickflip in der Luft mit Pfeil runter',
      'Musik aus der Boombox im Park',
      'Kleinere Hinweise am Handy hochkant',
    ],
    en: [
      'New NorDIY skatepark in Cannstatt',
      'High five with E or the button',
      'Session bonus for park tricks',
      'Kickflip in the air with arrow down',
      'Music from the boombox in the park',
      'Smaller hints on phones in portrait',
    ],
  },
  {
    version: '2026-10-08.8',
    date: '2026-10-08',
    items: [
      'Stunt-Linien mit Rampen und Combos',
      'Obere Ebene zum Grinden in jeder Zone',
      'Neue Sounds für Sprünge und Combos',
      'Installieren-Hinweis schon beim Start',
    ],
    en: [
      'Stunt lines with ramps and combos',
      'Upper level to grind in every zone',
      'New sounds for jumps and combos',
      'Install hint right at the start',
    ],
  },
  {
    version: '2026-10-08.7',
    date: '2026-10-08',
    items: ['Ton startet am Handy zuverlässiger'],
    en: [
      'Sound starts more reliably on phones',
    ],
  },
  {
    version: '2026-10-08.6',
    date: '2026-10-08',
    items: [
      'Fahnen hängen jetzt nach unten',
      'Jede Fahne nur noch einmal',
      'Autos klingen beim Vorbeifahren',
    ],
    en: [
      'Flags now hang down',
      'Each flag only once',
      'Cars sound as they pass',
    ],
  },
  {
    version: '2026-10-08.5',
    date: '2026-10-08',
    items: [
      'Kindermodus ohne Rechenaufgabe',
      'Weniger leere Straße bei Effekten',
      'Update-Hinweis auch nach App-Wechsel',
      'Kein Dauerbrummen außerhalb Mitte',
      'Aufgeräumter Titel am Handy',
    ],
    en: [
      'Kid mode without a maths question',
      'Less empty street during effects',
      'Update hint also after app switch',
      'No constant hum outside Mitte',
      'Tidier title on phones',
    ],
  },
  {
    version: '2026-10-08.4',
    date: '2026-10-08',
    items: [
      'Höhere Höchstgeschwindigkeit',
      'Leiser Verkehr auch außerhalb Mitte',
      'Neue Fahnen an zwei Häusern',
      'Aufgeräumte Menüs am Handy',
    ],
    en: [
      'Higher top speed',
      'Quiet traffic outside Mitte too',
      'New flags on two houses',
      'Tidier menus on phones',
    ],
  },
  {
    version: '2026-10-08.3',
    date: '2026-10-08',
    items: [
      'Knopf "Neu laden" bei neuer Version',
      'Pause: Logo und Zum Startbildschirm',
      'Getroffene Leute verlieren ihre Sachen',
      'Auf Leuten landen ist leichter',
      'Mehr Verkehr, neue Quelle am Neckar',
      'Hinweis zum Grind-Trick',
    ],
    en: [
      '"Reload" button for a new version',
      'Pause: logo and back to title',
      'People you hit drop their things',
      'Landing on people is easier',
      'More traffic, new spring at the Neckar',
      'Hint for the grind trick',
    ],
  },
  {
    version: '2026-10-08.2',
    date: '2026-10-08',
    items: [
      'Gefangene Sachen benutzen (E / Knopf)',
      'Brezel und Lebkuchenherz geben Leben',
      'Ball werfen und Leute treffen',
      'Grind-Trick mit Pfeil runter',
      'Dunklere Haare',
      'Hinweis auf neue Version',
    ],
    en: [
      'Use caught things (E / button)',
      'Pretzel and heart give life',
      'Throw the ball and hit people',
      'Grind trick with arrow down',
      'Darker hair',
      'Hint about a new version',
    ],
  },
  {
    version: '2026-10-08.1',
    date: '2026-10-08',
    items: [
      'Start in Bad Cannstatt',
      'Flüssigeres Bild',
      'Größere Lücken zum Springen',
      'Bank-Grind am hinteren Rand',
      'Crash in die Mülltonne',
      'Verkehr in Mitte, Quelle am Neckar',
    ],
    en: [
      'Start in Bad Cannstatt',
      'Smoother picture',
      'Bigger gaps to jump',
      'Bench grind at the back edge',
      'Crash into the bin',
      'Traffic in Mitte, spring at the Neckar',
    ],
  },
];

/** The running build: the newest changelog entry. */
export const BUILD_VERSION = CHANGELOG[0]!.version;

/** < 0 when `a` is older than `b`, 0 when equal, > 0 when newer. Numeric parts compare as numbers. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[-.]/).map(Number);
  const pb = b.split(/[-.]/).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * The entries newer than `lastSeen`, newest first, each with all its items,
 * at most the newest `maxEntries` of them. Empty on a first visit (`lastSeen`
 * null) and once the newest entry was seen.
 */
export function changesSince(
  lastSeen: string | null,
  log: readonly ChangelogEntry[],
  maxEntries = WHATS_NEW_MAX_ENTRIES,
): ChangelogEntry[] {
  if (lastSeen === null) return [];
  return log
    .filter((entry) => compareVersions(entry.version, lastSeen) > 0)
    .slice(0, maxEntries)
    .map((entry) => ({ ...entry, items: [...entry.items], ...(entry.en ? { en: [...entry.en] } : {}) }));
}
