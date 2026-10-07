/**
 * PLACEHOLDER owned by the audio/PWA slice: WebAudio chiptune SFX driven by
 * bus events, unlocked via ctx.onUserGesture, mute persisted.
 */
import type { System } from '../types';

export function createAudioSystem(): System {
  return { name: 'audio' };
}
