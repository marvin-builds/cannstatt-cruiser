/** Wording of the new vs. returning players tile (ROADMAP 55); a session counts as a visit, not a person. */
import type { InsightsStats } from '../net/telemetry-types';
import { formatNumber } from './format';

export const VISITS_NOTE = 'neu = ohne gespeicherte Spieldaten · Besuche, nicht Personen';

export function visitsSummary(visits: InsightsStats['visits']): { value: string; notes: string[]; fine: string } {
  const returning = `${formatNumber(visits.returning)} ${visits.returning === 1 ? 'Besuch' : 'Besuche'} Wiederkehrender`;
  const unknown = visits.unknown > 0 ? [`${formatNumber(visits.unknown)} unbekannt (ältere Version)`] : [];
  return { value: formatNumber(visits.new), notes: [returning, ...unknown], fine: VISITS_NOTE };
}
