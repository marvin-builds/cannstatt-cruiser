import { describe, expect, it } from 'vitest';
import { RotateHint, uiScreen, wantsLandscape, type ScreenSource } from './rotate-screen';

const base: ScreenSource = { mode: 'title', whatsNew: false, installGuide: false, settings: false, feedback: false, scores: null };
const phone = { touch: true, portrait: true };

describe('wantsLandscape (ROADMAP 73): the rotate screen only where the game needs landscape', () => {
  it('the title needs landscape', () => expect(wantsLandscape('title')).toBe(true));
  it('a run needs landscape', () => expect(wantsLandscape('run')).toBe(true));
  it('the pause screen needs landscape', () => expect(wantsLandscape('pause')).toBe(true));
  it('game over needs landscape', () => expect(wantsLandscape('gameOver')).toBe(true));
  it('the "Bestenliste" needs landscape', () => expect(wantsLandscape('scores')).toBe(true));
  it('the settings menu needs landscape', () => expect(wantsLandscape('settings')).toBe(true));
  it('the manual install steps need landscape', () => expect(wantsLandscape('installGuide')).toBe(true));
  it('the feedback dialog (all tabs and pages) has its own portrait sheet', () => expect(wantsLandscape('feedback')).toBe(false));
  it('the highscore name entry has its own portrait sheet', () => expect(wantsLandscape('nameEntry')).toBe(false));
  it('"Neu in dieser Version" has its own portrait sheet', () => expect(wantsLandscape('whatsNew')).toBe(false));
});

describe('uiScreen: the screen on top', () => {
  it('follows the mode when nothing covers it', () => {
    expect(uiScreen(base)).toBe('title');
    expect(uiScreen({ ...base, mode: 'playing' })).toBe('run');
    expect(uiScreen({ ...base, mode: 'paused' })).toBe('pause');
    expect(uiScreen({ ...base, mode: 'gameover' })).toBe('gameOver');
  });

  it('"Neu in dieser Version" covers the title', () => {
    expect(uiScreen({ ...base, whatsNew: true })).toBe('whatsNew');
  });

  it('the online list and the name entry cover title and game over', () => {
    expect(uiScreen({ ...base, scores: 'list' })).toBe('scores');
    expect(uiScreen({ ...base, mode: 'gameover', scores: 'entry' })).toBe('nameEntry');
  });

  it('the feedback dialog covers title and pause', () => {
    expect(uiScreen({ ...base, feedback: true, whatsNew: true })).toBe('feedback');
    expect(uiScreen({ ...base, mode: 'paused', feedback: true })).toBe('feedback');
  });

  it('settings cover the menus, the install steps cover everything', () => {
    expect(uiScreen({ ...base, settings: true, scores: 'list' })).toBe('settings');
    expect(uiScreen({ ...base, installGuide: true, settings: true, feedback: true, scores: 'entry' })).toBe('installGuide');
  });
});

describe('RotateHint: shown, dismissed and back', () => {
  it('shows in portrait on a touch device where landscape is wanted', () => {
    const hint = new RotateHint();
    expect(hint.shown(phone, 'title')).toBe(true);
    expect(hint.shown(phone, 'run')).toBe(true);
    expect(hint.shown({ touch: true, portrait: false }, 'title')).toBe(false);
    expect(hint.shown({ touch: false, portrait: true }, 'title')).toBe(false);
  });

  it('never shows over a screen with its own portrait layout', () => {
    const hint = new RotateHint();
    for (const screen of ['feedback', 'nameEntry', 'whatsNew'] as const) expect(hint.shown(phone, screen)).toBe(false);
  });

  it('comes back when the player closes a portrait sheet while still in portrait', () => {
    const hint = new RotateHint();
    hint.update(phone);
    expect(hint.shown(phone, 'feedback')).toBe(false);
    hint.update(phone);
    expect(hint.shown(phone, 'title')).toBe(true);
  });

  it('a dismissal ("Trotzdem weiter", a tap) holds while in portrait, also across sheets', () => {
    const hint = new RotateHint();
    hint.dismiss();
    hint.update(phone);
    expect(hint.shown(phone, 'title')).toBe(false);
    expect(hint.shown(phone, 'feedback')).toBe(false);
    expect(hint.shown(phone, 'pause')).toBe(false);
  });

  it('landscape forgets the dismissal: the next turn to portrait shows it again', () => {
    const hint = new RotateHint();
    hint.dismiss();
    hint.update({ touch: true, portrait: false });
    hint.update(phone);
    expect(hint.shown(phone, 'title')).toBe(true);
  });
});
