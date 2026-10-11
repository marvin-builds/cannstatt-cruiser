import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { GAMEOVER_INPUT_DELAY, TICK_DT } from '../core/config';
import { keyDown, keyUp, PointerControls } from '../core/input';
import { createStore, type Store } from '../core/storage';
import type { FeedbackContext, FeedbackDraft, FeedbackResult } from '../net/feedback';
import type { Rect } from '../types';
import type { FeedbackField } from './feedback-field';
import { feedbackIcon, feedbackLayout } from './feedback-layout';
import { createUiSystem } from './index';
import { uiMetrics } from './layout';
import { gameOverLayout, type MenuInput, pauseLayout } from './menu-layout';

function memoryStore(): Store {
  const raw = new Map<string, string>();
  return createStore({ getItem: (k: string) => raw.get(k) ?? null, setItem: (k: string, v: string) => void raw.set(k, v) } as unknown as Storage);
}

const centre = (r: Rect) => [r.x + r.w / 2, r.y + r.h / 2] as const;

function app(options: { touch?: boolean; portrait?: boolean; kid?: boolean; result?: FeedbackResult; hold?: boolean } = {}) {
  let answer: (r: FeedbackResult) => void = () => {};
  const sent: { draft: FeedbackDraft; context: FeedbackContext }[] = [];
  const sender = {
    send: (draft: FeedbackDraft, context: FeedbackContext) => {
      sent.push({ draft: { ...draft }, context: { ...context } });
      if (options.hold) return new Promise<FeedbackResult>((resolve) => (answer = resolve));
      return Promise.resolve(options.result ?? 'sent');
    },
  };
  const field = {
    rect: null as Rect | null,
    value: '',
    placeholder: '',
    focused: 0,
    blurred: 0,
    place(rect: Rect | null, value: string, placeholder: string) {
      field.rect = rect;
      field.value = value;
      field.placeholder = placeholder;
    },
    focus() {
      field.focused++;
    },
    blur() {
      field.blurred++;
    },
  } satisfies FeedbackField & Record<string, unknown>;
  const store = memoryStore();
  if (options.kid) store.set('kidMode', true);
  const ui = createUiSystem({ store, fullscreenAvailable: () => true, scores: null, telemetry: null, feedback: sender, feedbackField: field });
  const game = new Game({ systems: [ui] });
  game.display.touch = options.touch ?? false;
  game.display.portrait = options.portrait ?? false;
  const input = (fields: Partial<MenuInput> = {}): MenuInput => ({
    viewWidth: game.display.viewWidth,
    touch: game.display.touch,
    portrait: game.display.portrait,
    fullscreenAvailable: true,
    reload: false,
    install: null,
    feedback: true,
    ...fields,
  });
  const press = (r: Rect | null) => (r ? game.hitHotspot(...centre(r)) : false);
  const key = (code: string) => {
    keyDown(game, code);
    keyUp(game, code);
    game.tick();
  };
  const form = () => feedbackLayout(game.display);
  const icon = () => feedbackIcon(game.display.viewWidth, uiMetrics(game.display));
  const pointers = new PointerControls(game);
  /** A whole tap (down, up, a few ticks) at view px (x, y), which may lie outside the view (letterbox, page). */
  const tap = (x: number, y: number) => {
    pointers.down(1, x, y, game.display.touch);
    pointers.up(1);
    for (let i = 0; i < 8; i++) game.tick();
  };
  game.tick();
  return { game, ui, flow: ui.feedback!, sent, field, input, press, key, form, icon, tap, answer: (r: FeedbackResult) => answer(r) };
}

describe('feedback in the game', () => {
  it('the pause menu has a "Feedback" button: it opens the screen and the run stays paused', () => {
    const t = app();
    t.game.commands.startRun();
    t.game.commands.pause();
    t.game.tick();
    expect(t.press(pauseLayout(t.input()).buttons.feedback)).toBe(true);
    expect(t.flow.open).toBe(true);
    t.game.tick();
    expect(t.game.state.mode).toBe('paused');
    // A tap on the screen outside its buttons does not resume behind it, nor do the pause keys.
    expect(t.game.hitHotspot(5, 100)).toBe(true);
    for (const code of ['Space', 'KeyP', 'KeyW', 'KeyS', 'KeyE', 'KeyT']) t.key(code);
    expect(t.game.state.mode).toBe('paused');
    expect(t.flow.open).toBe(true);
    // Esc closes it, the pause screen is back.
    t.key('Escape');
    expect(t.flow.open).toBe(false);
    expect(t.game.state.mode).toBe('paused');
    t.key('Space');
    expect(t.game.state.mode).toBe('playing');
  });

  it('the title icon (and F) opens it, no run starts behind it; "Abbrechen" closes it', () => {
    const t = app();
    expect(t.press(t.icon())).toBe(true);
    expect(t.flow.open).toBe(true);
    t.key('Space');
    t.key('Enter');
    expect(t.game.state.mode).toBe('title');
    expect(t.press(t.form().cancel)).toBe(true);
    expect(t.flow.open).toBe(false);
    t.key('KeyF');
    expect(t.flow.open).toBe(true);
    expect(t.game.state.mode).toBe('title');
  });

  it('F while riding pauses the run and opens the form; not in kid mode', () => {
    const t = app();
    t.game.commands.startRun();
    t.game.tick();
    t.key('KeyF');
    expect(t.game.state.mode).toBe('paused');
    expect(t.flow.open).toBe(true);
    t.key('Escape');
    expect(t.flow.open).toBe(false);
    expect(t.game.state.mode).toBe('paused');

    const kid = app({ kid: true });
    kid.game.commands.startRun();
    kid.game.tick();
    kid.key('KeyF');
    expect(kid.game.state.mode).toBe('playing');
    expect(kid.flow.open).toBe(false);
  });

  it('is not offered on game over', () => {
    const t = app();
    t.game.commands.startRun();
    t.game.commands.gameOver();
    for (let i = 0; i < 60; i++) t.game.tick();
    expect(t.press(t.icon())).toBe(false);
    t.key('KeyF');
    expect(t.flow.open).toBe(false);
  });

  it('kid mode has neither the title icon nor the pause button nor F', () => {
    const t = app({ kid: true });
    expect(t.game.state.kidMode).toBe(true);
    t.press(t.icon());
    t.key('KeyF');
    expect(t.flow.open).toBe(false);
    expect(t.game.state.mode).toBe('title');
    t.game.commands.startRun();
    t.game.commands.pause();
    t.game.tick();
    const button = pauseLayout(t.input()).buttons.feedback!;
    t.press(button);
    expect(t.flow.open).toBe(false);
  });

  it('the native field lies on the drawn field while the form shows, with the kind as placeholder; desktop focuses it on the next tick', () => {
    const t = app();
    expect(t.field.rect).toBeNull();
    keyDown(t.game, 'KeyF');
    // Not inside the opening key press: a focused textarea would get its 'f' typed into it.
    expect(t.field.focused).toBe(0);
    keyUp(t.game, 'KeyF');
    t.game.tick();
    expect(t.field.rect).toEqual(t.form().field);
    expect(t.field.focused).toBe(1);
    expect(t.field.placeholder).toBe('Was ist passiert?');
    t.press(t.form().idea);
    t.game.tick();
    expect(t.field.placeholder).toBe('Was wünschst du dir?');
    t.key('Escape');
    expect(t.field.rect).toBeNull();
  });

  it('touch: no automatic focus (the keyboard opens on a tap into the field); hidden under the portrait rotate hint', () => {
    const t = app({ touch: true, portrait: true });
    // The rotate hint covers the title: no icon until it is dismissed.
    expect(t.press(t.icon())).toBe(true);
    expect(t.flow.open).toBe(false);
    expect(t.press(t.icon())).toBe(true);
    expect(t.flow.open).toBe(true);
    t.game.tick();
    expect(t.field.focused).toBe(0);
    expect(t.field.rect).toEqual(t.form().field);
    t.game.display.portrait = false;
    t.game.tick();
    t.game.display.portrait = true;
    t.game.tick();
    expect(t.field.rect).toBeNull();
  });

  it('"Senden" sends kind, text and the log box with the game context; the log only when ticked on a bug report', async () => {
    const t = app();
    t.key('KeyF');
    t.flow.setText('Ich hänge in der Bank fest');
    t.press(t.form().send);
    await Promise.resolve();
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]!.draft).toEqual({ kind: 'bug', text: 'Ich hänge in der Bank fest', withLog: false });
    expect(t.sent[0]!.context).toEqual({ platform: t.game.state.install.platform, touch: false, portrait: false, viewWidth: 320, mode: 'title' });
    expect(t.flow.done).toBe(true);
    // OK closes the thank-you.
    t.press(t.form().ok);
    expect(t.flow.open).toBe(false);

    t.key('KeyF');
    t.flow.setText('Nochmal mit Protokoll');
    t.press(t.form().log);
    t.press(t.form().send);
    await Promise.resolve();
    expect(t.sent[1]!.draft.withLog).toBe(true);
  });

  it('the log toggle has no tap area on an idea, and nothing is sent before "Senden"', () => {
    const t = app();
    t.key('KeyF');
    t.press(t.form().idea);
    expect(t.flow.kind).toBe('idea');
    t.flow.setText('Mehr Brezeln');
    t.press(t.form().log);
    expect(t.flow.withLog).toBe(false);
    expect(t.sent).toHaveLength(0);
  });
});

/** Taps outside the view rect: the letterbox above and below (portrait), beside it, far off on the page. */
const outside = (w: number, h: number) =>
  [
    [w / 2, -30],
    [w / 2, h + 40],
    [-12, h / 2],
    [w + 12, h / 2],
    [-500, 2000],
  ] as const;

describe('the open feedback form is modal everywhere (phone bug of 2026-10-11.5)', () => {
  for (const [name, options] of [
    ['phone portrait', { touch: true, portrait: true }],
    ['phone landscape', { touch: true, portrait: false }],
    ['desktop', { touch: false, portrait: false }],
  ] as const) {
    it(`${name}: a tap outside the canvas or on the form's background starts nothing on the title, only blurs the field`, () => {
      const t = app(options);
      // The player dismissed the portrait rotate hint (a tap) before.
      if (options.portrait) t.game.hitHotspot(10, 10);
      t.ui.feedback!.openForm();
      t.game.tick();
      const blurred = t.field.blurred;
      for (const [x, y] of [...outside(t.game.display.viewWidth, t.game.display.viewHeight), [5, 100]] as const) t.tap(x, y);
      expect(t.game.state.mode).toBe('title');
      expect(t.flow.open).toBe(true);
      expect(t.field.blurred).toBeGreaterThan(blurred);
      expect(t.field.rect).toEqual(t.form().field);
    });

    it(`${name}: a tap outside the canvas does not resume the paused run behind the form`, () => {
      const t = app(options);
      if (options.portrait) t.game.hitHotspot(10, 10);
      t.game.commands.startRun();
      t.game.commands.pause();
      t.game.tick();
      t.flow.openForm();
      t.game.tick();
      for (const [x, y] of outside(t.game.display.viewWidth, t.game.display.viewHeight)) t.tap(x, y);
      expect(t.game.state.mode).toBe('paused');
      expect(t.flow.open).toBe(true);
    });
  }

  it('a run that starts while the form is open (any path) closes it and hides the field', () => {
    const t = app();
    t.key('KeyF');
    t.flow.setText('Entwurf bleibt');
    t.game.commands.startRun();
    expect(t.flow.open).toBe(false);
    t.game.tick();
    expect(t.field.rect).toBeNull();
    expect(t.flow.text).toBe('Entwurf bleibt');
  });

  it('leaving the pause screen while the form is open (resume, to title) closes it', () => {
    const t = app();
    t.game.commands.startRun();
    t.game.commands.pause();
    t.game.tick();
    t.flow.openForm();
    t.game.commands.resume();
    t.game.tick();
    expect(t.flow.open).toBe(false);
    expect(t.field.rect).toBeNull();

    t.game.commands.pause();
    t.game.tick();
    t.press(pauseLayout(t.input()).buttons.feedback);
    expect(t.flow.open).toBe(true);
    t.game.commands.toTitle();
    t.game.tick();
    expect(t.flow.open).toBe(false);
  });

  it('also while a report is still being sent', async () => {
    const t = app({ hold: true });
    t.key('KeyF');
    t.flow.setText('Ich hänge in der Bank fest');
    t.press(t.form().send);
    expect(t.flow.sending).toBe(true);
    t.game.commands.startRun();
    expect(t.flow.open).toBe(false);
    t.answer('sent');
    await Promise.resolve();
    expect(t.flow.open).toBe(false);
  });

  it('game over after a run that left the form open shows its buttons and a tap restarts', () => {
    const t = app({ touch: true });
    t.game.commands.startRun();
    t.game.commands.pause();
    t.game.tick();
    t.flow.openForm();
    // Whatever path resumed the run (the old bug: a tap outside the canvas).
    t.game.commands.resume();
    t.game.tick();
    t.game.commands.gameOver();
    for (let i = 0; i < Math.ceil(GAMEOVER_INPUT_DELAY / TICK_DT) + 1; i++) t.game.tick();
    expect(t.flow.open).toBe(false);
    const toTitle = gameOverLayout({ ...t.input({ feedback: false }), newRecord: false, submit: false }).buttons.toTitle;
    expect(toTitle).toBeTruthy();
    expect(t.press(toTitle!)).toBe(true);
    expect(t.game.state.mode).toBe('title');
    t.game.commands.startRun();
    t.game.commands.gameOver();
    for (let i = 0; i < Math.ceil(GAMEOVER_INPUT_DELAY / TICK_DT) + 1; i++) t.game.tick();
    t.tap(t.game.display.viewWidth / 2, 100);
    expect(t.game.state.mode).toBe('playing');
  });
});
