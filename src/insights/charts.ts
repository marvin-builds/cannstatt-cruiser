/** Chart elements of the board: inline SVG bar charts and HTML split / ranked bars. */
import type { CountEntry } from '../net/telemetry-types';
import { type DaySeries, dayChart } from './day-chart';
import { h, s } from './dom';
import { formatNumber, formatPercent } from './format';
import type { Grain, Period } from './periods';
import type { RankedRow, Segment } from './split';

export const SERIES_LABEL: Record<DaySeries, string> = { sessions: 'Sessions', runs: 'Runs', entries: 'Einträge', newPlayers: 'neue Spieler' };
/** 'pro Tag', 'pro Woche', 'pro Monat'. */
export const GRAIN_UNIT: Record<Grain, string> = { day: 'Tag', week: 'Woche', month: 'Monat' };

/** Value labels need this much room per bar (px). */
const MIN_LABEL_BAR = 18;

/** A legend row; identity never hangs on color alone. */
export function legend(items: { label: string; color: string }[]): HTMLElement {
  return h(
    'ul',
    { class: 'legend' },
    ...items.map((i) => h('li', {}, h('span', { class: `swatch ${i.color}` }), i.label)),
  );
}

/** Left room of the period chart for the value axis (px). */
export const CHART_PAD_LEFT = 34;

/** Grouped bars per day, week or month, sized to `width` px so text stays at its real size. */
export function periodBars(periods: readonly Period[], grain: Grain, series: DaySeries[], width: number): SVGSVGElement {
  const height = 200;
  const chart = dayChart(periods, series, { width, height, padLeft: CHART_PAD_LEFT, padTop: 16, padBottom: 22, gap: 2 });
  const svg = s('svg', { class: 'chart', width, height, viewBox: `0 0 ${width} ${height}`, role: 'img' });
  svg.append(s('title', {}, `${series.map((k) => SERIES_LABEL[k]).join(' und ')} pro ${GRAIN_UNIT[grain]}`));
  for (const tick of chart.ticks) {
    svg.append(
      s('line', { class: 'grid', x1: CHART_PAD_LEFT, x2: width, y1: tick.y, y2: tick.y }),
      s('text', { class: 'axis', x: 28, y: tick.y + 4, 'text-anchor': 'end' }, formatNumber(tick.value)),
    );
  }
  for (const slot of chart.slots) {
    const group = s('g', { class: 'slot' });
    const tip = `${slot.item.title}: ${slot.bars.map((b) => `${formatNumber(b.value)} ${SERIES_LABEL[b.series]}`).join(', ')}`;
    group.append(s('title', {}, tip), s('rect', { class: 'hit', x: slot.x, y: 0, width: slot.width, height: chart.baseline }));
    for (const bar of slot.bars) {
      if (bar.height > 0) {
        const r = Math.min(3, bar.width / 2, bar.height);
        group.append(s('path', { class: `bar ${bar.series}`, d: roundedTop(bar.x, bar.y, bar.width, bar.height, r) }));
      }
      if (bar.width >= MIN_LABEL_BAR && bar.value > 0) {
        group.append(s('text', { class: 'value', x: bar.x + bar.width / 2, y: bar.y - 4, 'text-anchor': 'middle' }, formatNumber(bar.value)));
      }
    }
    if (slot.label) {
      group.append(s('text', { class: 'axis', x: slot.x + slot.width / 2, y: chart.baseline + 15, 'text-anchor': 'middle' }, slot.item.label));
    }
    svg.append(group);
  }
  svg.append(s('line', { class: 'baseline', x1: CHART_PAD_LEFT, x2: width, y1: chart.baseline, y2: chart.baseline }));
  return svg;
}

/** Bar path with rounded top corners, anchored flat on the baseline. */
function roundedTop(x: number, y: number, w: number, hgt: number, r: number): string {
  const b = y + hgt;
  return `M${x},${b}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${b}Z`;
}

/** Histogram as labelled horizontal bars (count and share of runs). */
export function histogram(groups: CountEntry[], color: string): HTMLElement {
  const total = groups.reduce((a, g) => a + g.count, 0);
  const max = groups.reduce((a, g) => Math.max(a, g.count), 0);
  return h(
    'ul',
    { class: 'hbars' },
    ...groups.map((g) =>
      h(
        'li',
        { title: `${g.key}: ${formatNumber(g.count)} Runs` },
        h('span', { class: 'hbar-label' }, g.key),
        h('span', { class: 'hbar-track' }, h('span', { class: `hbar ${color}`, style: `width:${max ? (g.count / max) * 100 : 0}%` })),
        h('span', { class: 'hbar-value' }, formatNumber(g.count), h('small', {}, total ? formatPercent(g.count / total) : '')),
      ),
    ),
  );
}

const SPLIT_COLORS = ['c1', 'c2', 'c3'];

/** One 100 % bar with its segments, legend values below. */
export function splitBar(title: string, segments: Segment[]): HTMLElement {
  const color = (seg: Segment, i: number) => (seg.key === 'other' ? 'muted' : SPLIT_COLORS[i] ?? 'muted');
  const shown = segments.filter((seg) => seg.count > 0);
  return h(
    'div',
    { class: 'split' },
    h('h3', {}, title),
    h(
      'div',
      { class: 'split-bar', role: 'img', 'aria-label': segments.map((seg) => `${seg.label} ${seg.percent} %`).join(', ') },
      ...(shown.length
        ? segments.map((seg, i) =>
            seg.count > 0
              ? h('span', { class: `seg ${color(seg, i)}`, style: `flex-grow:${seg.count}`, title: `${seg.label}: ${formatNumber(seg.count)}` })
              : null,
          )
        : [h('span', { class: 'seg empty' })]),
    ),
    h(
      'ul',
      { class: 'legend' },
      ...segments.map((seg, i) =>
        h('li', {}, h('span', { class: `swatch ${color(seg, i)}` }), seg.label, ' ', h('strong', {}, `${seg.percent} %`)),
      ),
    ),
  );
}

/** Ranked list with a share bar per row. */
export function rankedList(title: string, rows: RankedRow[]): HTMLElement {
  return h(
    'section',
    { class: 'card ranked' },
    h('h2', {}, title),
    rows.length
      ? h(
          'ol',
          {},
          ...rows.map((r) =>
            h(
              'li',
              { class: r.key === 'other' ? 'other' : undefined },
              h('span', { class: 'rank-bar', style: `width:${r.bar * 100}%` }),
              h('span', { class: 'rank-label' }, r.label),
              h('span', { class: 'rank-value' }, formatNumber(r.count), h('small', {}, formatPercent(r.share))),
            ),
          ),
        )
      : h('p', { class: 'empty-note' }, 'Noch keine Daten'),
  );
}
