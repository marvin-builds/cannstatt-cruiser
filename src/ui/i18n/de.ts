/**
 * Every player-visible text of the game in German (ROADMAP 71), the default language. `en.ts`
 * has the same shape (type Texts), so a key missing there is a type error. Texts with numbers
 * or names are functions; numbers come in already formatted (formatNumber). Game-font glyphs
 * only (core/font-data.ts) and kid-safe outside the adult-only texts (items.beer, popups.drink,
 * chill.adult), which kid mode never shows. The insights board stays German and is not here.
 */
/** The boardslide line; `short` fits the pause screen's big portrait font. */
const trick = (touch: boolean, short: boolean) => `${short ? 'Geländer:' : 'Auf dem Geländer'} ${touch ? 'runterwischen' : 'Pfeil runter'} = Boardslide`;

export const de = {
  /** The language switch "DE | EN" (title and settings). */
  language: { de: 'DE', en: 'EN' },
  /** Thousands separator of formatNumber: "1.234". */
  thousands: '.',
  /** "11.10.2026" for the day "2026-10-11". */
  day: (year: string, month: string, date: string) => `${date}.${month}.${year}`,
  hud: {
    points: 'Punkte',
    combo: (n: string) => `Combo ${n}`,
  },
  /** The zone ribbon: places keep their names. */
  zones: ['Stuttgart-Mitte', 'Am Neckar', 'Bad Cannstatt'],
  title: {
    tagline: 'Mit dem Longboard durch Stuttgart',
    start: (touch: boolean): string => (touch ? 'Tippen zum Starten' : 'Leertaste zum Starten'),
    /** The controls in one line, when notices leave no room for the full help. */
    controls: (touch: boolean): string => (touch ? 'Tippen = springen, runterwischen = ducken' : 'Leertaste = springen, S = ducken'),
    help: (touch: boolean) => [
      touch ? 'Kurz tippen = kleiner Sprung' : 'Leertaste kurz = kleiner Sprung',
      'Halten = hoher Sprung',
      touch ? 'Runterwischen = ducken' : 'Pfeil runter oder S = ducken',
      trick(touch, false),
      touch ? 'In der Luft runterwischen = Kickflip' : 'In der Luft Pfeil runter = Kickflip',
      touch ? 'Knopf antippen = Gegenstand benutzen' : 'E = Gegenstand benutzen',
    ],
    keys: 'P/Esc = Pause, M = Ton aus',
    feedbackKey: 'F = Feedback',
    settingsKey: 'G = Einstellungen',
    highscore: (n: string) => `Highscore ${n}`,
    starsTotal: (n: string) => `${n} gesamt`,
  },
  menu: {
    reload: 'Neue Version da',
    reloadButton: (touch: boolean): string => (touch ? 'Neu laden' : 'Neu laden (U)'),
    installApp: 'App installieren',
    whatsNew: 'Neu in dieser Version',
    next: 'Weiter',
    pause: 'Pause',
    gameOver: 'Sturz! Runde vorbei',
    newRecord: 'Neuer Rekord!',
    restartNote: 'Lauf wird neu gestartet',
    /** "Startbildschirm": T on desktop, and Esc where Esc leads there too (game over). */
    toTitle: (touch: boolean, escape: boolean): string => (touch ? 'Startbildschirm' : escape ? 'Startbildschirm (T/Esc)' : 'Startbildschirm (T)'),
    pausePrompt: (touch: boolean): string => (touch ? 'Tippen zum Weiterfahren' : 'Leertaste, P oder Esc zum Weiterfahren'),
    pauseKeys: 'E = Gegenstand benutzen, M = Ton aus',
    trick,
    feedback: (touch: boolean): string => (touch ? 'Feedback' : 'Feedback (F)'),
    submit: (touch: boolean): string => (touch ? 'Eintragen' : 'Eintragen (E)'),
    gameOverPrompt: (touch: boolean): string => (touch ? 'Tippen für eine neue Runde' : 'Leertaste für eine neue Runde'),
    /** The game-over table's labels: score, highscore, stars, stars total, distance. */
    results: ['Punkte', 'Highscore', 'Sterne', 'Sterne gesamt', 'Strecke'],
    metres: (n: string) => `${n} m`,
    /** "Version vom 11.10.2026 (Nr. 8)" over a changelog entry. */
    version: (day: string, build: string) => `Version vom ${day} (Nr. ${build})`,
  },
  settings: {
    title: 'Einstellungen',
    kidMode: (on: boolean) => `Kindermodus: ${on ? 'AN' : 'AUS'}`,
    /** The Kindermodus notes, long form first (note-text.ts picks the one that fits). */
    kidNoteOff: ['Für Kinder: freundliche Bilder und Texte.', 'Freundliche Bilder und Texte.'],
    kidNoteOn: ['Kindgerechte Bilder und Texte sind an.', 'Kindgerechte Bilder sind an.'],
    keys: 'Enter = Kindermodus, A = Statistik, Esc = zurück',
    back: 'Zurück',
    installApp: 'App installieren',
    testDevice: 'Testgerät',
  },
  stats: {
    label: (on: boolean) => `Anonyme Statistik: ${on ? 'AN' : 'AUS'}`,
    note: 'Ohne Namen. Ort grob (Stadt), keine IP gespeichert.',
    noteShort: 'Ohne Namen und IP, Ort nur grob.',
    /** The Bestenliste's line under its own privacy line. */
    listNote: 'Statistik: anonym, Ort grob (Stadt), keine IP.',
    listNoteShort: 'Statistik: anonym, ohne IP.',
    offNote: 'Aus: Es wird keine Statistik gesendet.',
  },
  privacy: { label: 'Datenschutz' },
  kidNotice: {
    title: 'Kindermodus ist an',
    ok: 'OK',
    what: 'Kindgerechte Bilder und Texte.',
    /** The way back: the logo on touch, K on a keyboard. */
    off: (touch: boolean): string => (touch ? 'Ausschalten: Logo 3 Sekunden halten' : 'Ausschalten: K 3 Sekunden halten'),
  },
  install: {
    title: 'App installieren',
    reason: 'Als App: Vollbild und offline',
    ok: 'OK',
    /** The steps per platform; the first line's icon (⋮ or Teilen) goes between its two parts. */
    android: { first: ['Oben rechts auf', 'tippen,'], rest: ['dann "App installieren"', 'oder "Zum Startbildschirm".'] },
    ios: { first: ['Auf Teilen', 'tippen,'], rest: ['dann "Zum Home-Bildschirm".'] },
    other: ['In der Adressleiste das', 'Symbol "Installieren" wählen', '(oder im Browser-Menü).'],
  },
  popups: {
    bail: { late: 'Zu spät geflippt!', wobbly: 'Zu wacklig!', relaxed: 'Zu entspannt!' },
    crowd: { vfb: 'VfB-Fans!', wasen: 'Wasen!' },
    stomp: 'Stomp!',
    ballHit: 'Treffer!',
    throw: 'Wurf!',
    /** Adult mode only. */
    drink: 'Gluck gluck gluck!',
    eat: 'Lecker!',
    eatPoints: '+Punkte',
    ballBack: 'Achtung, der Ball!',
    crash: 'Autsch!',
    boardslide: 'Boardslide!',
    highFive: 'High Five!',
    kickflip: 'Kickflip',
    star: 'Stern!',
    starArc: 'Sternenbogen!',
    grind: 'Grind!',
  },
  /** Catch popups; kid mode shows the pretzel for the beer. */
  items: { football: 'Ball geschnappt!', pretzel: 'Brezel!', beer: 'Prost!', gingerbread: 'Lebkuchenherz!' },
  chill: { adult: 'Ganz entspannt...', kid: 'Kaugummi!' },
  callout: {
    line: (n: string) => `Linie x${n}!`,
    kickflip: 'Kickflip!',
    stuntLine: 'Stunt-Linie!',
    session: 'Session!',
  },
  hints: {
    item: 'Tippe auf den Gegenstand',
    highFiveButton: 'Knopf: High Five!',
    highFiveKey: '= High Five!',
    /** After the arrow key cap. */
    trickKey: '= Boardslide!',
    trickTouch: 'Runterwischen = Boardslide!',
    /** After the swipe arrow (portrait). */
    trickSwipe: 'wischen = Boardslide!',
    kickerKeys: ['Auf der Rampe springen!', '(Leertaste)'],
    kickerTouch: 'Auf der Rampe tippen!',
    /** Before and after the arrow key cap. */
    airKey: ['In der Luft', '= Kickflip!'],
    airTouch: ['In der Luft', 'runterwischen = Kickflip!'],
    airSwipe: 'wischen = Kickflip!',
  },
  score: {
    title: 'Bestenliste',
    entryTitle: 'Eintragen',
    submit: 'Eintragen',
    /** The submit button once the name is valid. */
    submitAs: (name: string) => `Als ${name} eintragen`,
    points: (n: string) => `${n} Punkte`,
    loading: 'Lade Bestenliste ...',
    offline: 'Offline – Bestenliste nicht verfügbar',
    empty: 'Noch keine Einträge – fahr los!',
    privacy: 'Die Bestenliste speichert Name, Punkte, Strecke, Datum.',
    /** The privacy line where the long one does not fit (portrait, see note-text.ts). */
    privacyShort: 'Liste: Name, Punkte, Strecke, Datum.',
    sending: 'Wird gesendet ...',
    queued: 'Wird gesendet, sobald du online bist',
    queuedLater: 'Wird später gesendet',
    badName: 'Dieser Name geht leider nicht',
    rate: 'Bitte kurz warten',
    failed: 'Das hat leider nicht geklappt',
    short: 'Mindestens 2 Zeichen',
    namePrompt: 'Dein Name:',
    namePlaceholder: 'Name',
    nameAria: 'Dein Name für die Bestenliste',
    outside: 'Eingetragen! Leider nicht unter den Top 20',
    /** The server kept the device's better entry instead of the run. */
    kept: (n: string) => `Dein Eintrag bleibt: ${n} Punkte`,
    cancel: 'Abbrechen',
    listKeys: 'Pfeiltasten = blättern, A = Statistik, Esc/B = schließen',
    entryKeys: 'Enter = eintragen, Esc = zurück',
  },
  feedback: {
    title: 'Feedback',
    bug: 'Fehler',
    idea: 'Idee',
    log: 'Fehlerprotokoll mitsenden',
    /** The log label's short form where the long one does not fit beside "Ansehen". */
    logShort: 'Protokoll mitsenden',
    send: 'Senden',
    hint: 'Bitte keine persönlichen Daten.',
    bugPlaceholder: 'Was ist passiert?',
    ideaPlaceholder: 'Was wünschst du dir?',
    sending: 'Wird gesendet ...',
    sent: 'Danke für dein Feedback!',
    rate: 'Heute schon genug Feedback – danke!',
    offline: 'Keine Verbindung. Später nochmal.',
    invalid: 'Ging leider nicht. Text ändern.',
    short: (n: string) => `Bitte mindestens ${n} Zeichen schreiben.`,
    fieldAria: 'Dein Feedback',
    close: 'Schließen',
  },
  feedbackPages: {
    newTab: 'Neu',
    mineTab: 'Mein Feedback',
    view: 'Ansehen',
    back: 'Zurück',
    previewTitle: 'Das wird gesendet',
    sentTitle: 'Das wurde gesendet',
    empty: 'Noch kein Feedback von diesem Gerät',
    kind: 'Art',
    text: 'Text',
    version: 'Spielversion',
    device: 'Gerät',
    session: 'Sitzungsnummer (nur gegen Spam, wird nicht gespeichert)',
    log: 'Fehlerprotokoll',
    noErrors: 'Keine Fehler aufgezeichnet',
    unticked: 'Nicht angehakt, wird nicht gesendet',
    notSent: 'Nicht mitgesendet',
    notIncluded: 'Nicht dabei: Name, IP-Adresse, Geräte-ID, Highscores, deine Eingaben im Spiel.',
    testerPass: 'Testerpass',
    testerPassSent: 'Wird mitgesendet (Testgerät, ohne Tageslimit)',
    delete: 'Löschen',
    confirmTitle: 'Wirklich löschen?',
    confirmHint: 'Dein Feedback ist dann ganz weg.',
    confirmYes: 'Ja, löschen',
    cancel: 'Abbrechen',
    deleting: 'Wird gelöscht ...',
    deleted: 'Feedback gelöscht',
    deleteFailed: 'Ging leider nicht. Später nochmal.',
    status: { open: 'Offen', todo: 'Geplant', done: 'Umgesetzt', rejected: 'Nicht geplant', removed: 'Entfernt' },
    kinds: { bug: 'Fehler', idea: 'Idee' },
    platforms: { android: 'Android', ios: 'iPhone/iPad', other: 'Computer/anderes' },
    inputs: { touch: 'Touch', keys: 'Tastatur' },
    orientations: { landscape: 'quer', portrait: 'hochkant' },
    width: (px: string) => `${px} px breit`,
    logLines: (n: number) => `Fehlerprotokoll (${n} ${n === 1 ? 'Zeile' : 'Zeilen'})`,
    noLog: 'ohne Fehlerprotokoll',
    doneIn: (status: string, version: string) => `${status} in Version ${version}`,
    reply: (text: string) => `Antwort: „${text}“`,
    sentWith: (day: string, kind: string) => `Gesendet am ${day} mit: ${kind}`,
    versionOf: (version: string) => `Version ${version}`,
  },
  rotate: {
    title: 'Bitte Gerät drehen',
    reason: 'Im Querformat fährt es sich besser.',
    dismiss: 'Trotzdem weiter',
  },
};

/** The shape every language's catalogue has. */
export type Texts = typeof de;
