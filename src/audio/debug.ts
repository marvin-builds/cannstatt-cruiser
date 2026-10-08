/**
 * `window.__audio`: a log of the sounds the audio system triggered, for
 * playtests (no real audio is inspected). Only present when the test hook is on.
 */
import { testHookEnabled } from '../core/testhook';
import type { AudioBackend } from './backend';
import type { ParkSound } from './park';

export interface AudioDebug {
  /**
   * Sounds in trigger order: cue names plus `grind:start` / `grind:stop`.
   * Muted sounds are logged too (`muted: true`) although nothing was audible.
   */
  log: { at: number; sound: string; muted: boolean }[];
  /** Backend status, e.g. the AudioContext state. */
  status(): string;
  /** NorDIY park levels last sent to the backend (0 = silent), see audio/park.ts. */
  park(): { ambience: number; boombox: number };
}

declare global {
  interface Window {
    __audio?: AudioDebug;
  }
}

/** Installs `window.__audio` when the test hook is enabled; returns the logger or undefined. */
export function exposeAudioDebug(backend: AudioBackend, park: ParkSound): ((sound: string, muted: boolean) => void) | undefined {
  if (typeof window === 'undefined' || !testHookEnabled()) return undefined;
  const debug: AudioDebug = {
    log: [],
    status: () => backend.status?.() ?? 'unknown',
    park: () => ({ ambience: park.ambience, boombox: park.boombox }),
  };
  window.__audio = debug;
  return (sound, muted) => debug.log.push({ at: Math.round(performance.now()), sound, muted });
}
