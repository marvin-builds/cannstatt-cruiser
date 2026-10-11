import { describe, expect, it } from 'vitest';
import type { GameMode } from '../types';
import { reloadOffered } from './notices';

describe('reload offer', () => {
  it('shows only while a new version waits, on title, pause and game over, never mid-run', () => {
    const modes: GameMode[] = ['title', 'playing', 'paused', 'gameover'];
    const shown = modes.filter((mode) => reloadOffered({ mode, updateReady: true }));
    expect(shown).toEqual(['title', 'paused', 'gameover']);
    expect(modes.some((mode) => reloadOffered({ mode, updateReady: false }))).toBe(false);
  });
});
