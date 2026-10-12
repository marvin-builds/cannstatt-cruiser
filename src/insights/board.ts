/**
 * The unlocked dashboard: header, then two tabs (ROADMAP 79): 'Statistik' (range switch, owner switches,
 * tiles, charts, lists) and 'Feedback' (the ticket card), whose label counts the tickets that need action.
 */
import { type InsightsStats, STATS_RANGES, type StatsRange } from '../net/telemetry-types';
import { distanceGroups, runLengthGroups, scoreGroups } from './buckets';
import { CHART_PAD_LEFT, GRAIN_UNIT, histogram, legend, periodBars, rankedList, splitBar } from './charts';
import type { DaySeries } from './day-chart';
import { deviceSwitches, type DeviceSwitchesHandlers } from './device-switches';
import { h } from './dom';
import { feedbackCard, type FeedbackHandlers, type FeedbackView } from './feedback-card';
import { countryName, formatDecimal, formatDuration, formatNumber } from './format';
import { chartPeriods } from './periods';
import { isApproximate, rangeButtonLabel, rangeNote } from './ranges';
import { rankedRows, type SplitKey, splitSegments } from './split';
import { BOARD_TABS, type BoardTab } from './tabs';
import { actionCount } from './ticket-actions';
import { visitsSummary } from './visits';

export interface BoardHandlers extends DeviceSwitchesHandlers {
  onRange(days: StatsRange): void;
  onReload(): void;
  onLock(): void;
  /** The operator picked a tab (to remember it); the board already shows it. */
  onTab(tab: BoardTab): void;
  feedback: FeedbackHandlers;
}

export interface BoardView {
  stats: InsightsStats;
  /** The range shown or being loaded. */
  range: StatsRange;
  loading: boolean;
  /** A failed reload, shown above the (older) data. */
  error: string | null;
  feedback: FeedbackView;
  tab: BoardTab;
  /** This device carries the test-device marker. */
  testDevice: boolean;
  /** The numbers include test devices. */
  testers: boolean;
  /** How the last tester pass refresh went (ROADMAP 75), or null. */
  testerPassNote: string | null;
  /** Signed in with a kept board session: the lock button reads "Abmelden" (ROADMAP 74). */
  remembered: boolean;
}

const SPLITS: { title: string; field: keyof InsightsStats['split']; keys: SplitKey[] }[] = [
  { title: 'Eingabe', field: 'input', keys: [{ key: 'touch', label: 'Touch' }, { key: 'keys', label: 'Tastatur' }] },
  { title: 'Lage', field: 'orientation', keys: [{ key: 'landscape', label: 'Quer' }, { key: 'portrait', label: 'Hoch' }] },
  {
    title: 'System',
    field: 'platform',
    keys: [{ key: 'android', label: 'Android' }, { key: 'ios', label: 'iOS' }, { key: 'other', label: 'Andere' }],
  },
  {
    title: 'Modus',
    field: 'kid',
    keys: [
      { key: 'false', label: 'Erwachsene', aliases: ['0'] },
      { key: 'true', label: 'Kinder', aliases: ['1'] },
    ],
  },
];

const timeFormat = new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });

function tile(label: string, value: string, ...notes: string[]): HTMLElement {
  return h(
    'div',
    { class: 'tile' },
    h('span', { class: 'tile-label' }, label),
    h('strong', { class: 'tile-value' }, value),
    ...notes.map((note, i) => h('span', { class: i ? 'tile-note fine' : 'tile-note' }, note)),
  );
}

/** Play time tile; long ranges come from daily medians, so the median is marked approximate. */
function playTimeTile(stats: InsightsStats): HTMLElement {
  const median = formatDuration(stats.sessions.medianSeconds);
  const avg = formatDuration(stats.sessions.avgSeconds);
  if (!isApproximate(stats.days)) return tile('Ø Spielzeit', avg, `Median ${median}`);
  return tile('Ø Spielzeit', avg, `Median ≈ ${median}`, 'ältere Tage aus Tageswerten');
}

function header(view: BoardView, handlers: BoardHandlers): HTMLElement {
  const generated = new Date(view.stats.generatedAt);
  const reload = h('button', { type: 'button', class: 'ghost', disabled: view.loading }, view.loading ? 'Lädt …' : 'Neu laden');
  reload.addEventListener('click', handlers.onReload);
  const lock = h('button', { type: 'button', class: 'ghost' }, view.remembered ? 'Abmelden' : 'Sperren');
  lock.addEventListener('click', handlers.onLock);
  return h(
    'header',
    { class: 'board-head' },
    h(
      'div',
      { class: 'title' },
      h('h1', {}, 'Insights'),
      h('p', {}, `Cannstatt Cruiser · Stand ${Number.isNaN(generated.getTime()) ? '–' : timeFormat.format(generated)}`),
    ),
    h('div', { class: 'controls' }, reload, lock),
  );
}

function rangeSwitch(view: BoardView, handlers: BoardHandlers): HTMLElement {
  return h(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': 'Zeitraum' },
    ...STATS_RANGES.map((days) => {
      const button = h('button', { type: 'button', 'aria-pressed': String(days === view.range) }, rangeButtonLabel(days));
      button.addEventListener('click', () => handlers.onRange(days));
      return button;
    }),
  );
}

const TAB_LABELS: Record<BoardTab, string> = { stats: 'Statistik', feedback: 'Feedback' };

/** The count on the Feedback tab: the number as a badge, read out as 'n zu bearbeiten'; nothing at 0. */
function fillCount(badge: HTMLElement, count: number): void {
  badge.hidden = count === 0;
  badge.replaceChildren(h('span', { 'aria-hidden': 'true' }, String(count)), h('span', { class: 'visually-hidden' }, ` (${count} zu bearbeiten)`));
}

/**
 * ARIA tabs over the two panels: arrow keys, Home and End move between them (automatic activation).
 * Returns the tab list and a setter for the Feedback count.
 */
function tabs(panels: Record<BoardTab, HTMLElement>, initial: BoardTab, count: number, onSelect: (tab: BoardTab) => void) {
  const badge = h('span', { class: 'tab-count' });
  fillCount(badge, count);
  const buttons = BOARD_TABS.map((tab) =>
    h(
      'button',
      { type: 'button', role: 'tab', id: `tab-${tab}`, 'aria-controls': `panel-${tab}`, class: 'tab' },
      TAB_LABELS[tab],
      tab === 'feedback' ? badge : null,
    ),
  );
  const select = (tab: BoardTab, focus: boolean) => {
    BOARD_TABS.forEach((t, i) => {
      const on = t === tab;
      buttons[i]!.setAttribute('aria-selected', String(on));
      buttons[i]!.tabIndex = on ? 0 : -1;
      panels[t].hidden = !on;
    });
    if (focus) buttons[BOARD_TABS.indexOf(tab)]!.focus();
  };
  const choose = (tab: BoardTab, focus: boolean) => {
    select(tab, focus);
    onSelect(tab);
  };
  BOARD_TABS.forEach((tab, i) => {
    buttons[i]!.addEventListener('click', () => choose(tab, false));
    buttons[i]!.addEventListener('keydown', (event) => {
      const last = BOARD_TABS.length - 1;
      const to = { ArrowRight: (i + 1) % BOARD_TABS.length, ArrowLeft: (i + last) % BOARD_TABS.length, Home: 0, End: last }[event.key];
      if (to === undefined) return;
      event.preventDefault();
      choose(BOARD_TABS[to]!, true);
    });
  });
  select(initial, false);
  return { list: h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Ansicht' }, ...buttons), setCount: (n: number) => fillCount(badge, n) };
}

function card(title: string, ...children: (Node | null)[]): HTMLElement {
  return h('section', { class: 'card' }, h('h2', {}, title), ...children);
}

const DAY_CHARTS: Record<string, { title: string; series: DaySeries[] }> = {
  sessions: { title: 'Sessions und Runs', series: ['sessions', 'runs'] },
  entries: { title: 'Highscore-Einträge', series: ['entries'] },
  visits: { title: 'Sessions und neue Spieler', series: ['sessions', 'newPlayers'] },
};

/** New players and returning visits of the range, then sessions and new players per period. */
function visitsCard(stats: InsightsStats): HTMLElement {
  const summary = visitsSummary(stats.visits);
  return card(
    `${DAY_CHARTS.visits!.title} pro Tag`,
    h(
      'p',
      { class: 'visits' },
      h('span', {}, h('strong', { class: 'tile-value' }, summary.value), ' neue Spieler im Zeitraum'),
      ...summary.notes.map((note) => h('span', { class: 'visits-note' }, note)),
    ),
    h('p', { class: 'card-note fine' }, summary.fine),
    legend([{ label: 'Sessions', color: 'c1' }, { label: 'neue Spieler', color: 'c3' }]),
    h('div', { class: 'chart-holder', 'data-day-chart': 'visits' }),
  );
}

/**
 * Sizes the period charts to their card; called again on resize. The main
 * chart's width picks the grain (day, week, month), and the entries chart uses
 * the same one so both read alike.
 */
export function drawDayCharts(root: HTMLElement, stats: InsightsStats): void {
  const holders = [...root.querySelectorAll<HTMLElement>('[data-day-chart]')];
  const widthOf = (holder: HTMLElement) => Math.max(240, Math.floor(holder.clientWidth));
  const main = holders.find((holder) => holder.dataset.dayChart === 'sessions');
  if (!main) return;
  const { grain, periods } = chartPeriods(stats.perDay, stats.days, widthOf(main) - CHART_PAD_LEFT, DAY_CHARTS.sessions!.series.length);
  for (const holder of holders) {
    const chart = DAY_CHARTS[holder.dataset.dayChart ?? ''];
    if (!chart) continue;
    const heading = holder.closest('.card')?.querySelector('h2');
    if (heading) heading.textContent = `${chart.title} pro ${GRAIN_UNIT[grain]}`;
    holder.replaceChildren(periodBars(periods, grain, chart.series, widthOf(holder)));
  }
}

export function renderBoard(root: HTMLElement, view: BoardView, handlers: BoardHandlers): void {
  const { stats } = view;
  const today = stats.perDay.at(-1);
  const tiles = h(
    'div',
    { class: 'tiles' },
    tile('Sessions heute', formatNumber(today?.sessions ?? 0), 'UTC-Tag'),
    tile('Sessions im Zeitraum', formatNumber(stats.sessions.total), rangeNote(stats.days, stats.perDay)),
    tile('Runs im Zeitraum', formatNumber(stats.runs.total), `${formatDecimal(stats.runs.perSession, 1)} Runs/Session`),
    playTimeTile(stats),
  );
  const entriesTotal = stats.perDay.reduce((a, d) => a + d.entries, 0);
  const top = h(
    'ol',
    { class: 'top' },
    ...stats.topScores.map((t) => h('li', {}, h('span', { class: 'top-name' }, t.name), h('span', { class: 'top-score' }, formatNumber(t.score)))),
  );
  const statsPanel = h(
    'section',
    { class: 'tab-panel', role: 'tabpanel', id: 'panel-stats', 'aria-labelledby': 'tab-stats' },
    h('div', { class: 'stats-controls' }, rangeSwitch(view, handlers)),
    deviceSwitches({ testDevice: view.testDevice, testers: view.testers, loading: view.loading, testerPassNote: view.testerPassNote }, handlers),
    tiles,
    card(`${DAY_CHARTS.sessions!.title} pro Tag`, legend([{ label: 'Sessions', color: 'c1' }, { label: 'Runs', color: 'c2' }]), h('div', { class: 'chart-holder', 'data-day-chart': 'sessions' })),
    visitsCard(stats),
    h(
      'div',
      { class: 'grid three' },
      card('Run-Länge', histogram(runLengthGroups(stats.runs.seconds), 'c2')),
      card('Distanz', histogram(distanceGroups(stats.runs.distance), 'c2')),
      card('Punkte', histogram(scoreGroups(stats.runs.score), 'c2')),
    ),
    card('Sessions nach Gerät und Modus', h('div', { class: 'splits' }, ...SPLITS.map((sp) => splitBar(sp.title, splitSegments(stats.split[sp.field], sp.keys))))),
    h(
      'div',
      { class: 'grid two' },
      rankedList('Städte', rankedRows(stats.split.city)),
      rankedList('Regionen', rankedRows(stats.split.region)),
      rankedList('Länder', rankedRows(stats.split.country, countryName)),
      rankedList('Versionen', rankedRows(stats.split.version)),
    ),
    h(
      'div',
      { class: 'grid two' },
      card(
        `${DAY_CHARTS.entries!.title} pro Tag`,
        h('p', { class: 'card-note' }, `${formatNumber(entriesTotal)} Einträge im Zeitraum`),
        h('div', { class: 'chart-holder', 'data-day-chart': 'entries' }),
      ),
      card('Aktuelle Bestenliste', stats.topScores.length ? top : h('p', { class: 'empty-note' }, 'Noch keine Einträge')),
    ),
    h('p', { class: 'foot' }, 'Anonyme Aggregate · Orte ohne Angabe zählen als „Andere“'),
  );
  // The card reports every changed list; the tab count follows it.
  const feedbackHandlers: FeedbackHandlers = {
    ...handlers.feedback,
    onEntries(entries) {
      handlers.feedback.onEntries(entries);
      tabBar.setCount(actionCount(entries));
    },
  };
  const feedbackPanel = h(
    'section',
    { class: 'tab-panel', role: 'tabpanel', id: 'panel-feedback', 'aria-labelledby': 'tab-feedback' },
    feedbackCard(view.feedback, feedbackHandlers),
  );
  const tabBar = tabs({ stats: statsPanel, feedback: feedbackPanel }, view.tab, actionCount(view.feedback.entries ?? []), (tab) => {
    handlers.onTab(tab);
    // Charts are sized to their holder, which has no width while its panel is hidden.
    if (tab === 'stats') drawDayCharts(root, stats);
  });
  root.replaceChildren(
    h(
      'main',
      { class: 'board', 'aria-busy': String(view.loading) },
      header(view, handlers),
      tabBar.list,
      view.error ? h('p', { class: 'banner', role: 'alert' }, view.error) : null,
      statsPanel,
      feedbackPanel,
    ),
  );
  if (view.tab === 'stats') drawDayCharts(root, stats);
}
