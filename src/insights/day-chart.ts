/** Geometry of the per-day grouped bar chart (pure, drawn by charts.ts). */
import type { DayStats } from '../net/telemetry-types';

export type DaySeries = 'sessions' | 'runs' | 'entries';

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

export interface DaySlot {
  day: string;
  x: number;
  width: number;
  bars: Bar[];
  /** Whether the day gets an x-axis label (thinned so labels never crowd). */
  label: boolean;
}

export interface DayChart {
  max: number;
  baseline: number;
  ticks: { value: number; y: number }[];
  slots: DaySlot[];
}

/** At most this many day labels on the x axis. */
const MAX_LABELS = 8;

/** Smallest 1/2/5 * 10^n that is >= value (1 for 0). */
export function niceMax(value: number): number {
  if (value <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 5, 10]) if (step * magnitude >= value) return step * magnitude;
  return 10 * magnitude;
}

export function dayChart(days: readonly DayStats[], series: readonly DaySeries[], box: ChartBox): DayChart {
  const top = box.padTop;
  const baseline = box.height - box.padBottom;
  const plot = baseline - top;
  const peak = days.reduce((m, d) => Math.max(m, ...series.map((s) => d[s])), 0);
  const max = niceMax(peak);
  const slotWidth = (box.width - box.padLeft) / Math.max(1, days.length);
  const inner = slotWidth * 0.8;
  const barWidth = Math.max(1, (inner - box.gap * (series.length - 1)) / series.length);
  const every = Math.ceil(days.length / MAX_LABELS);
  const last = days.length - 1;
  const slots = days.map((d, i) => {
    const x = box.padLeft + i * slotWidth;
    const start = x + (slotWidth - inner) / 2;
    const bars = series.map((s, j) => {
      const height = (d[s] / max) * plot;
      return { series: s, value: d[s], x: start + j * (barWidth + box.gap), y: baseline - height, width: barWidth, height };
    });
    return { day: d.day, x, width: slotWidth, bars, label: (last - i) % every === 0 };
  });
  const half = max / 2;
  const ticks = [0, half, max].filter((v) => Number.isInteger(v)).map((value) => ({ value, y: baseline - (value / max) * plot }));
  return { max, baseline, ticks, slots };
}
