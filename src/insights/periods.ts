/**
 * Groups the per-day numbers into the periods a chart shows: days, ISO weeks
 * ('KW 41') or months ('Okt 26'). Long ranges and narrow charts go coarser so
 * bars never shrink to hairlines (pure, drawn by charts.ts).
 */
import { ALL_RANGE, type DayStats, type StatsRange } from '../net/telemetry-types';
import type { DaySeries } from './day-chart';
import { formatDay } from './format';

export type Grain = 'day' | 'week' | 'month';

export interface Period extends Record<DaySeries, number> {
  /** First and last day (YYYY-MM-DD) of the period that has data. */
  start: string;
  end: string;
  /** Short axis label. */
  label: string;
  /** Tooltip text naming the period. */
  title: string;
}

const GRAINS: readonly Grain[] = ['day', 'week', 'month'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const DAY_MS = 86_400_000;
/** Above this many days a fixed range shows weeks and 'Alles' shows months. */
const LONG_RANGE_DAYS = 120;
/** Each bar of a period needs this many px, plus SLOT_SPACE_PX per period. */
const BAR_MIN_PX = 5;
const SLOT_SPACE_PX = 2;

/** ISO 8601 week of a 'YYYY-MM-DD' day: weeks start Monday, week 1 holds the first Thursday. */
export function isoWeek(day: string): { year: number; week: number } {
  const date = Date.parse(`${day}T00:00:00Z`);
  const weekday = (new Date(date).getUTCDay() + 6) % 7;
  const thursday = new Date(date + (3 - weekday) * DAY_MS);
  const year = thursday.getUTCFullYear();
  const ordinal = Math.round((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS);
  return { year, week: Math.floor(ordinal / 7) + 1 };
}

function periodOf(day: string, grain: Grain): { key: string; label: string } {
  if (grain === 'day') return { key: day, label: formatDay(day) };
  if (grain === 'month') return { key: day.slice(0, 7), label: `${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(2, 4)}` };
  const { year, week } = isoWeek(day);
  return { key: `${year}-W${week}`, label: `KW ${week}` };
}

function titleOf(period: Period, grain: Grain): string {
  return grain === 'week' ? `${period.label} (${formatDay(period.start)}–${formatDay(period.end)})` : period.label;
}

/** Sums consecutive days (oldest first) into periods of one grain. */
export function groupDays(days: readonly DayStats[], grain: Grain): Period[] {
  const periods: Period[] = [];
  let lastKey = '';
  for (const d of days) {
    const { key, label } = periodOf(d.day, grain);
    const current = periods.at(-1);
    if (current && key === lastKey) {
      current.end = d.day;
      current.sessions += d.sessions;
      current.runs += d.runs;
      current.entries += d.entries;
      current.newPlayers += d.newPlayers;
    } else {
      periods.push({ start: d.day, end: d.day, label, title: '', sessions: d.sessions, runs: d.runs, entries: d.entries, newPlayers: d.newPlayers });
      lastKey = key;
    }
  }
  for (const p of periods) p.title = titleOf(p, grain);
  return periods;
}

function baseGrain(range: StatsRange, dayCount: number): Grain {
  if (range === ALL_RANGE) return dayCount > LONG_RANGE_DAYS ? 'month' : 'day';
  return range > LONG_RANGE_DAYS ? 'week' : 'day';
}

/**
 * The grain and periods for a chart `plotWidth` px wide with `seriesCount` bars
 * per period: weeks for 365 days, months for a long 'Alles', days otherwise,
 * and coarser whenever the bars would get thinner than BAR_MIN_PX.
 */
export function chartPeriods(days: readonly DayStats[], range: StatsRange, plotWidth: number, seriesCount: number): { grain: Grain; periods: Period[] } {
  const minSlot = seriesCount * BAR_MIN_PX + SLOT_SPACE_PX;
  let index = GRAINS.indexOf(baseGrain(range, days.length));
  let periods = groupDays(days, GRAINS[index]!);
  while (index < GRAINS.length - 1 && periods.length * minSlot > plotWidth) {
    index += 1;
    periods = groupDays(days, GRAINS[index]!);
  }
  return { grain: GRAINS[index]!, periods };
}
