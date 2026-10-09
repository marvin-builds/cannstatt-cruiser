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
}

/** Item limits, so an entry fits the "Neu in dieser Version" screen. */
export const CHANGELOG_ITEM_MAX_CHARS = 40;
export const CHANGELOG_MAX_ITEMS_PER_ENTRY = 6;
/** Items shown at most on the screen, over all entries since the last-seen version. */
export const WHATS_NEW_MAX_ITEMS = 6;

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: '2026-10-09.2',
    date: '2026-10-09',
    items: ['Neue Grind-Kombis mit Sternen'],
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
  },
  {
    version: '2026-10-08.7',
    date: '2026-10-08',
    items: ['Ton startet am Handy zuverlässiger'],
  },
  {
    version: '2026-10-08.6',
    date: '2026-10-08',
    items: [
      'Fahnen hängen jetzt nach unten',
      'Jede Fahne nur noch einmal',
      'Autos klingen beim Vorbeifahren',
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
 * The entries newer than `lastSeen`, newest first, with at most `maxItems`
 * items over all of them (entries left without items are dropped). Empty on
 * a first visit (`lastSeen` null) and once the newest entry was seen.
 */
export function changesSince(
  lastSeen: string | null,
  log: readonly ChangelogEntry[],
  maxItems = WHATS_NEW_MAX_ITEMS,
): ChangelogEntry[] {
  if (lastSeen === null) return [];
  const shown: ChangelogEntry[] = [];
  let room = maxItems;
  for (const entry of log) {
    if (room <= 0 || compareVersions(entry.version, lastSeen) <= 0) break;
    const items = entry.items.slice(0, room);
    shown.push({ ...entry, items });
    room -= items.length;
  }
  return shown;
}
