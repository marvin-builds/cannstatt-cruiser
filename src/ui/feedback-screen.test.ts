import { describe, expect, it } from 'vitest';
import { measureText } from '../core/font';
import { feedbackPlaceholder, wrapText } from './feedback-screen';

describe('feedback screen drawing helpers', () => {
  it('wraps the typed text at word boundaries within the width, keeping new lines', () => {
    const lines = wrapText('Der Skater bleibt an der Bank hängen\nzweite Zeile', 60);
    expect(lines.every((l) => measureText(l) <= 60)).toBe(true);
    expect(lines.join(' ').replace(/ +/g, ' ')).toBe('Der Skater bleibt an der Bank hängen zweite Zeile');
    expect(lines[lines.length - 1]).toBe('zweite Zeile');
  });

  it('cuts a word longer than a line', () => {
    const lines = wrapText('x'.repeat(80), 40);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => measureText(l) <= 40)).toBe(true);
    expect(lines.join('')).toBe('x'.repeat(80));
  });

  it('asks what happened for a bug and what the player wishes for an idea', () => {
    expect(feedbackPlaceholder({ kind: 'bug' })).toBe('Was ist passiert?');
    expect(feedbackPlaceholder({ kind: 'idea' })).toBe('Was wünschst du dir?');
  });
});
