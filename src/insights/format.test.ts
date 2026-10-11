import { describe, expect, it } from 'vitest';
import { countryName, formatDate, formatDay, formatDecimal, formatDuration, formatNumber, formatPercent } from './format';

describe('formatDuration', () => {
  it('shows seconds below a minute', () => {
    expect(formatDuration(0)).toBe('0 s');
    expect(formatDuration(45)).toBe('45 s');
  });
  it('shows minutes and seconds', () => {
    expect(formatDuration(400)).toBe('6 min 40 s');
    expect(formatDuration(120)).toBe('2 min');
  });
  it('shows hours and minutes and drops seconds', () => {
    expect(formatDuration(3600)).toBe('1 h');
    expect(formatDuration(3900 + 59)).toBe('1 h 5 min');
  });
  it('rounds fractional seconds', () => {
    expect(formatDuration(59.6)).toBe('1 min');
  });
});

describe('number formatting', () => {
  it('groups thousands the German way', () => {
    expect(formatNumber(12345)).toBe('12.345');
  });
  it('formats decimals with a comma', () => {
    expect(formatDecimal(2.456, 1)).toBe('2,5');
    expect(formatDecimal(3, 1)).toBe('3,0');
  });
  it('formats a fraction as whole percent', () => {
    expect(formatPercent(0.625)).toBe('63 %');
    expect(formatPercent(0)).toBe('0 %');
  });
  it('formats a UTC day as short German date', () => {
    expect(formatDay('2026-10-09')).toBe('9.10.');
  });
});

describe('countryName', () => {
  it('names ISO codes in German and keeps anything else', () => {
    expect(countryName('DE')).toBe('Deutschland');
    expect(countryName('CH')).toBe('Schweiz');
    expect(countryName('Atlantis')).toBe('Atlantis');
  });
});

describe('formatDate', () => {
  it('adds the year to the short day', () => {
    expect(formatDate('2026-10-11')).toBe('11.10.2026');
    expect(formatDate('2025-05-03')).toBe('3.5.2025');
  });
});
