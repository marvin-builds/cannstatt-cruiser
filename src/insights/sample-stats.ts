/**
 * A realistic GET /stats answer for unit tests and the insights playtest
 * (scripts/scenarios/insights.ts). Never imported by the board itself.
 */
import { ALL_RANGE, type DayStats, type InsightsStats, type StatsRange } from '../net/telemetry-types';

/** Days at the end of each fixture with known new/returning flags. */
const KNOWN_DAYS = 20;

function days(count: number, end: string): DayStats[] {
  const last = Date.parse(`${end}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => {
    const day = new Date(last - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10);
    const weekend = [0, 6].includes(new Date(day).getUTCDay());
    const sessions = Math.round(14 + 9 * Math.sin(i / 3) + (weekend ? 12 : 0) + (i % 5));
    // The newest days come from builds that send the returning flag; older ones count as unknown.
    const flagged = i >= count - KNOWN_DAYS;
    const newPlayers = flagged ? Math.round(sessions * (0.3 + (i % 4) * 0.05)) : 0;
    const returningVisits = flagged ? sessions - newPlayers : 0;
    return { day, sessions, runs: Math.round(sessions * (2.4 + (i % 3) * 0.4)), entries: i % 4 === 0 ? 0 : 1 + (i % 3), newPlayers, returningVisits };
  });
}

/** `allDays` is how much history the 'Alles' range (ALL_RANGE) has. */
export function sampleStats(range: StatsRange, end = '2026-10-11', allDays = 500): InsightsStats {
  const perDay = days(range === ALL_RANGE ? allDays : range, end);
  const sessions = perDay.reduce((a, d) => a + d.sessions, 0);
  const runs = perDay.reduce((a, d) => a + d.runs, 0);
  const share = (f: number) => Math.round(sessions * f);
  const newPlayers = perDay.reduce((a, d) => a + d.newPlayers, 0);
  const returning = perDay.reduce((a, d) => a + d.returningVisits, 0);
  return {
    days: range,
    generatedAt: `${end}T12:00:00.000Z`,
    perDay,
    sessions: { total: sessions, medianSeconds: 400, avgSeconds: 545 },
    visits: { new: newPlayers, returning, unknown: sessions - newPlayers - returning },
    runs: {
      total: runs,
      perSession: Math.round((runs / sessions) * 100) / 100,
      seconds: [
        { key: '0', count: share(0.4) },
        { key: '20', count: share(0.5) },
        { key: '40', count: share(0.6) },
        { key: '90', count: share(0.7) },
        { key: '240', count: share(0.3) },
        { key: '720', count: share(0.08) },
      ],
      distance: [
        { key: '0', count: share(0.9) },
        { key: '300', count: share(0.7) },
        { key: '700', count: share(0.5) },
        { key: '1400', count: share(0.3) },
        { key: '3000', count: share(0.1) },
      ],
      score: [
        { key: '0', count: share(0.6) },
        { key: '100', count: share(0.9) },
        { key: '500', count: share(0.6) },
        { key: '2000', count: share(0.25) },
        { key: '5000', count: share(0.05) },
      ],
    },
    split: {
      input: [
        { key: 'touch', count: share(0.68) },
        { key: 'keys', count: share(0.32) },
      ],
      platform: [
        { key: 'android', count: share(0.41) },
        { key: 'ios', count: share(0.29) },
        { key: 'other', count: share(0.3) },
      ],
      kid: [
        { key: 'false', count: share(0.78) },
        { key: 'true', count: share(0.22) },
      ],
      version: [
        { key: '2026-10-11.1', count: share(0.55) },
        { key: '2026-10-10.2', count: share(0.3) },
        { key: '2026-10-08.1', count: share(0.1) },
        { key: 'other', count: share(0.05) },
      ],
      country: [
        { key: 'DE', count: share(0.86) },
        { key: 'AT', count: share(0.05) },
        { key: 'CH', count: share(0.04) },
        { key: 'other', count: share(0.05) },
      ],
      region: [
        { key: 'Baden-Württemberg', count: share(0.74) },
        { key: 'Bayern', count: share(0.08) },
        { key: 'Wien', count: share(0.04) },
        { key: 'other', count: share(0.14) },
      ],
      city: [
        { key: 'Stuttgart', count: share(0.46) },
        { key: 'Esslingen am Neckar', count: share(0.12) },
        { key: 'Ludwigsburg', count: share(0.08) },
        { key: 'Waiblingen', count: share(0.05) },
        { key: 'Fellbach', count: share(0.04) },
        { key: 'other', count: share(0.25) },
      ],
    },
    topScores: [
      { name: 'Wasen-Wiesel', score: 18_420, date: '2026-10-10T17:02:00.000Z' },
      { name: 'Neckarblitz', score: 15_105, date: '2026-10-09T15:41:00.000Z' },
      { name: '<b>Kessel</b>', score: 12_880, date: '2026-10-11T09:12:00.000Z' },
      { name: 'Rösslesbahn', score: 9_870, date: '2026-10-07T18:30:00.000Z' },
      { name: 'Max', score: 7_455, date: '2026-10-05T12:00:00.000Z' },
    ],
  };
}
