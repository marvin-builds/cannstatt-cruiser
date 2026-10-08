import { describe, expect, it } from 'vitest';
import { createInstallState, type InstallState } from '../core/install';
import type { GameMode } from '../types';
import { installHintKind, reloadOffered, whatsNewLines } from './notices';

const install = (fields: Partial<InstallState> = {}): InstallState => ({ ...createInstallState(), visits: 2, ...fields });

describe('reload offer', () => {
  it('shows only while a new version waits, on title, pause and game over, never mid-run', () => {
    const modes: GameMode[] = ['title', 'playing', 'paused', 'gameover'];
    const shown = modes.filter((mode) => reloadOffered({ mode, updateReady: true }));
    expect(shown).toEqual(['title', 'paused', 'gameover']);
    expect(modes.some((mode) => reloadOffered({ mode, updateReady: false }))).toBe(false);
  });
});

describe('install hint', () => {
  it('Android with a captured prompt gets the button, iOS the share instructions', () => {
    expect(installHintKind(install({ platform: 'android', canPrompt: true }), true)).toBe('prompt');
    expect(installHintKind(install({ platform: 'ios' }), true)).toBe('ios');
  });

  it('a prompt wins on any platform; without one only iOS gets a hint', () => {
    expect(installHintKind(install({ platform: 'other', canPrompt: true }), true)).toBe('prompt');
    expect(installHintKind(install({ platform: 'android' }), true)).toBeNull();
    expect(installHintKind(install({ platform: 'other' }), true)).toBeNull();
  });

  it('only on touch devices, from the first visit on', () => {
    const ios = { platform: 'ios' as const };
    expect(installHintKind(install(ios), false)).toBeNull();
    expect(installHintKind(install({ ...ios, visits: 1 }), true)).toBe('ios');
    expect(installHintKind(install({ ...ios, visits: 3 }), true)).toBe('ios');
  });

  it('never when installed, running installed or dismissed', () => {
    const base = { platform: 'android' as const, canPrompt: true };
    expect(installHintKind(install({ ...base, standalone: true }), true)).toBeNull();
    expect(installHintKind(install({ ...base, installed: true }), true)).toBeNull();
    expect(installHintKind(install({ ...base, dismissed: true }), true)).toBeNull();
  });
});

describe("what's new lines", () => {
  it('lists the items of all entries, newest first', () => {
    const entries = [
      { version: '2026-10-09.1', date: '2026-10-09', items: ['Neu A', 'Neu B'] },
      { version: '2026-10-08.2', date: '2026-10-08', items: ['Alt C'] },
    ];
    expect(whatsNewLines(entries)).toEqual(['Neu A', 'Neu B', 'Alt C']);
    expect(whatsNewLines([])).toEqual([]);
  });
});
