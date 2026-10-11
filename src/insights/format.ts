/** German number, duration and date formatting for the insights board. */

const whole = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

export function formatNumber(n: number): string {
  return whole.format(n);
}

export function formatDecimal(n: number, digits: number): string {
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

/** A 0..1 fraction as whole percent, e.g. '63 %'. */
export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)} %`;
}

/** '45 s', '6 min 40 s', '1 h 5 min' (seconds are dropped from an hour on). */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const min = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts = h > 0 ? [h && `${h} h`, min && `${min} min`] : [min && `${min} min`, s && `${s} s`];
  return parts.filter(Boolean).join(' ') || '0 s';
}

/** 'YYYY-MM-DD' -> '9.10.' */
export function formatDay(day: string): string {
  const [, month, date] = day.split('-');
  return `${Number(date)}.${Number(month)}.`;
}

const regions = new Intl.DisplayNames('de-DE', { type: 'region' });

/** German name of a two-letter country code ('DE' -> 'Deutschland'); other values unchanged. */
export function countryName(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  try {
    return regions.of(code) ?? code;
  } catch {
    return code;
  }
}
