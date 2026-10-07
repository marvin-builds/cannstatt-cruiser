import { describe, expect, it } from 'vitest';
import { nextMode } from './modes';

describe('nextMode', () => {
  it('follows title -> playing <-> paused -> gameover -> playing/title', () => {
    expect(nextMode('title', 'start')).toBe('playing');
    expect(nextMode('playing', 'pause')).toBe('paused');
    expect(nextMode('paused', 'resume')).toBe('playing');
    expect(nextMode('playing', 'die')).toBe('gameover');
    expect(nextMode('gameover', 'start')).toBe('playing');
    expect(nextMode('gameover', 'toTitle')).toBe('title');
    expect(nextMode('paused', 'toTitle')).toBe('title');
  });

  it('returns null for transitions that are not allowed', () => {
    expect(nextMode('title', 'pause')).toBeNull();
    expect(nextMode('title', 'die')).toBeNull();
    expect(nextMode('paused', 'die')).toBeNull();
    expect(nextMode('playing', 'start')).toBeNull();
    expect(nextMode('gameover', 'resume')).toBeNull();
  });
});
