/**
 * Composition root. Each feature slice exposes one factory from its index.ts;
 * slices change their own directory only, never this file or src/core.
 * Update order = array order; render order is by layer (see RENDER_LAYERS).
 */
import { createAudioSystem } from './audio';
import { startApp } from './core/app';
import { createGameplaySystem } from './gameplay';
import { createPlayerSystem } from './player';
import { createUiSystem } from './ui';
import { createWorldSystem } from './world';

startApp([
  createWorldSystem(), // zone progression, parallax
  createPlayerSystem(), // input -> physics -> player state
  createGameplaySystem(), // spawn, move, collide, score (sees the moved player)
  createAudioSystem(), // reacts to events
  createUiSystem(), // screens, HUD, hotspots
]);
