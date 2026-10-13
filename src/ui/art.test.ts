import { describe, expect, it } from 'vitest';
import { parseSprite, rowsFromString } from '../core/sprite-data';
import { ICON_SETTINGS, SETTINGS_ART, SETTINGS_PALETTE, UI } from './art';

/** The USER's chosen "three sliders" settings icon (ROADMAP 87): w = knob, m = track. */
const SPEC = [
  '.ww......',
  'mwwmmmmmm',
  '.ww......',
  '.....ww..',
  'mmmmmwwmm',
  '.....ww..',
  '...ww....',
  'mmmwwmmmm',
  '...ww....',
];

describe('settings icon (three sliders)', () => {
  it('is 9x9, so iconButton gives it an odd plate', () => {
    expect(ICON_SETTINGS.width).toBe(9);
    expect(ICON_SETTINGS.height).toBe(9);
  });

  it('draws exactly the spec grid with white knobs and a muted grey track', () => {
    const data = parseSprite(rowsFromString(SETTINGS_ART), SETTINGS_PALETTE);
    const expected = SPEC.join('').split('').map((ch) => (ch === 'w' ? UI.white : ch === 'm' ? UI.muted : null));
    expect(data.pixels).toEqual(expected);
  });
});
