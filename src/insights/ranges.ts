/** Labels of the board's time ranges (STATS_RANGES, ALL_RANGE = 'Alles'). */
import { ALL_RANGE, type DayStats, RAW_RETENTION_DAYS, type StatsRange } from '../net/telemetry-types';
import { formatDate } from './format';

export function rangeButtonLabel(days: StatsRange): string {
  return days === ALL_RANGE ? 'Alles' : `${days} T`;
}

/** Subtitle of the range tile: '365 Tage', or 'seit 11.10.2026' for Alles. */
export function rangeNote(days: StatsRange, perDay: readonly DayStats[]): string {
  if (days !== ALL_RANGE) return `${days} Tage`;
  const first = perDay[0];
  return first ? `seit ${formatDate(first.day)}` : 'Alles';
}

/** Ranges beyond the raw retention come from daily summaries, so their median is approximate. */
export function isApproximate(days: StatsRange): boolean {
  return days === ALL_RANGE || days > RAW_RETENTION_DAYS;
}
