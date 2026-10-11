/** Geometry of the grouped bar chart over days, weeks or months (pure, drawn by charts.ts). */

export type DaySeries = 'sessions' | 'runs' | 'entries' | 'newPlayers';

export interface ChartBox {
  width: number;
  height: number;
  padLeft: number;
  padTop: number;
  padBottom: number;
  /** Space between neighbouring bars of one day. */
  gap: number;
}

export interface Bar {
  series: DaySeries;
  value: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One chart period: a value per series (DayStats and periods.ts' Period fit). */
export type SeriesValues = Record<DaySeries, number>;

export interface DaySlot<T extends SeriesValues> {
  item: T;
  x: number;
  width: number;
  bars: Bar[];
  /** Whether the period gets an x-axis label (thinned so labels never crowd). */
  label: boolean;
}

export interface DayChart<T extends SeriesValues> {
  max: number;
  baseline: number;
  ticks: { value: number; y: number }[];
  slots: DaySlot<T>[];
}

/** At most this many x-axis labels, and each needs LABEL_SPACE_PX. */
const MAX_LABELS = 8;
const LABEL_SPACE_PX = 48;

/** Smallest 1/2/5 * 10^n that is >= value (1 for 0). */
export function niceMax(value: number): number {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) if (step * magnitude >= value) return step * magnitude;
  return 10 * magnitude;
}

export function dayChart<T extends SeriesValues>(days: readonly T[], series: readonly DaySeries[], box: ChartBox): DayChart<T> {
  const top = box.padTop;
  const baseline = box.height - box.padBottom;
  const plot = baseline - top;
  const peak = days.reduce((m, d) => Math.max(m, ...series.map((s) => d[s])), 0);
  const max = niceMax(peak);
  const slotWidth = (box.width - box.padLeft) / Math.max(1, days.length);
  const inner = slotWidth * 0.8;
  const barWidth = Math.max(1, (inner - box.gap * (series.length - 1)) / series.length);
  const labels = Math.max(1, Math.min(MAX_LABELS, Math.floor((box.width - box.padLeft) / LABEL_SPACE_PX)));
  const every = Math.ceil(days.length / labels);
  const last = days.length - 1;
  const slots = days.map((d, i) => {
    const x = box.padLeft + i * slotWidth;
    const start = x + (slotWidth - inner) / 2;
    const bars = series.map((s, j) => {
      const height = (d[s] / max) * plot;
      return { series: s, value: d[s], x: start + j * (barWidth + box.gap), y: baseline - height, width: barWidth, height };
    });
    return { item: d, x, width: slotWidth, bars, label: (last - i) % every === 0 };
  });
  const half = max / 2;
  const ticks = [0, half, max].filter((v) => Number.isInteger(v)).map((value) => ({ value, y: baseline - (value / max) * plot }));
  return { max, baseline, ticks, slots };
}
