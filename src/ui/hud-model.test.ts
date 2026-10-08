import { describe, expect, it } from 'vitest';
import { createInitialState } from '../core/state';
import { HudModel } from './hud-model';

function playingState() {
  const state = createInitialState();
  state.mode = 'playing';
  return state;
}

describe('HUD model', () => {
  it('formats the score, stars and combo with German dots', () => {
    const state = playingState();
    Object.assign(state, { score: 48210, stars: 1200, combo: 4, multiplier: 3 });
    const hud = new HudModel();
    hud.update(state);
    expect(hud.score.text).toBe('48.210');
    expect(hud.stars.text).toBe('1.200');
    expect(hud.combo).toBe(true);
    expect(hud.multiplier.text).toBe('x3');
    expect(hud.comboLabel.text).toBe('Combo 4');
  });

  it('rebuilds nothing while the values stay the same', () => {
    const state = playingState();
    state.score = 1234;
    const hud = new HudModel();
    hud.update(state);
    const { layout } = hud;
    const score = hud.score.text;
    hud.update(state);
    expect(hud.layout).toBe(layout);
    expect(hud.score.text).toBe(score);
    state.score = 9_999_999; // wider than the hearts row
    hud.update(state);
    expect(hud.layout).not.toBe(layout);
  });

  it('adds the drunk row only while drunk and never in kid mode', () => {
    const state = playingState();
    const hud = new HudModel();
    state.drunkTimer = 3;
    hud.update(state);
    expect(hud.layout.drunk).not.toBeNull();
    state.kidMode = true;
    hud.update(state);
    expect(hud.layout.drunk).toBeNull();
  });

  it('places the desktop key cap chip right of the plate while carrying', () => {
    const state = playingState();
    const hud = new HudModel();
    hud.update(state);
    expect(hud.chip).toBeNull();
    state.carriedItem = 'pretzel';
    hud.update(state, true);
    expect(hud.chip!.x).toBeGreaterThan(hud.layout.plate.x + hud.layout.plate.w);
    hud.update(state, false);
    expect(hud.chip).toBeNull();
  });
});
