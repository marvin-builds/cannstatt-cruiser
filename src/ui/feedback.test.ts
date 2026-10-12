import { describe, expect, it } from 'vitest';
import { Game } from '../core/game';
import { GAMEOVER_INPUT_DELAY, TICK_DT } from '../core/config';
import { keyDown, keyUp, PointerControls } from '../core/input';
import { createStore, type Store } from '../core/storage';
import type { OrientationEnv } from '../core/orientation';
import type { FeedbackContext, FeedbackDraft, FeedbackResult } from '../net/feedback';
import { type KeptReport, reportSignature } from '../net/feedback-reports';
import type { FeedbackDeleteResult, FeedbackInboxLike } from '../net/feedback-status';
import type { FeedbackBody } from '../net/feedback-types';
import type { Rect } from '../types';
import type { FeedbackField } from './feedback-field';
import type { FeedbackSheet, FeedbackSheetHandlers } from './feedback-sheet';
import type { FeedbackSheetModel } from './portrait-sheets';
import { feedbackIcon, feedbackLayout } from './feedback-layout';
import { createUiSystem } from './index';
import { listRowRect, pageLayout } from './feedback-page-layout';

import { uiMetrics } from './layout';
import { gameOverLayout, type MenuInput, pauseLayout } from './menu-layout';
import { fakeRotateSheet } from './rotate-sheet.fake';
import { fakeHistory } from './back-nav.fake';
import type { SettleCover } from './settle-cover';
import { de } from './i18n/de';

function memoryStore(): Store {
  const raw = new Map<string, string>();
  return createStore({ getItem: (k: string) => raw.get(k) ?? null, setItem: (k: string, v: string) => void raw.set(k, v) } as unknown as Storage);
}

const centre = (r: Rect) => [r.x + r.w / 2, r.y + r.h / 2] as const;

interface AppOptions {
  touch?: boolean;
  portrait?: boolean;
  kid?: boolean;
  result?: FeedbackResult;
  hold?: boolean;
  installed?: boolean;
  /** The reports sent from this device (default: an inbox without any). */
  inbox?: FeedbackInboxLike & { checks?: number };
}

/** A fake inbox over `reports` (newest first) that counts its status checks; markSeen clears the changes. */
function fakeInbox(reports: KeptReport[]) {
  const inbox = {
    reports,
    checks: 0,
    get changed(): boolean {
      return inbox.changedIds().length > 0;
    },
    changedIds: (): number[] => reports.filter((r) => r.seen !== reportSignature(r)).map((r) => r.id),
    markSeen() {
      for (const r of reports) r.seen = reportSignature(r);
    },
    checkIfDue() {
      inbox.checks++;
      return Promise.resolve();
    },
    /** The worker's answer to a delete (ROADMAP 78) and the ids asked for. */
    answer: 'deleted' as FeedbackDeleteResult,
    removed: [] as number[],
    remove(id: number): Promise<FeedbackDeleteResult> {
      inbox.removed.push(id);
      if (inbox.answer === 'deleted') reports.splice(reports.findIndex((r) => r.id === id), 1);
      return Promise.resolve(inbox.answer);
    },
  } satisfies FeedbackInboxLike & Record<string, unknown>;
  return inbox;
}

/** A report kept on the device; `seen` 'old' makes it a change the player has not seen. */
function keptReport(id: number, extra: Partial<KeptReport> = {}): KeptReport {
  const r = {
    ...{ id, key: 'k'.repeat(32), day: '2026-10-11', kind: 'bug', text: `Bericht Nummer ${id}`, version: '2026-10-11.10' },
    ...{ platform: 'android', input: 'touch', orientation: 'landscape', viewWidth: 320, log: [] },
    ...{ status: 'open', reply: null, doneVersion: null },
    ...extra,
  } as KeptReport;
  return { ...r, seen: extra.seen ?? reportSignature(r) };
}

function app(options: AppOptions = {}) {
  let answer: (r: FeedbackResult) => void = () => {};
  const sent: { draft: FeedbackDraft; context: FeedbackContext; body: FeedbackBody }[] = [];
  /** What each prepared body was made from. */
  const made = new Map<FeedbackBody, { draft: FeedbackDraft; context: FeedbackContext }>();
  const sender = {
    hasLog: true,
    prepare: (draft: FeedbackDraft, context: FeedbackContext): FeedbackBody => {
      const body: FeedbackBody = {
        ...{ session: 's'.repeat(32), kind: draft.kind, text: draft.text, version: '2026-10-11.10', platform: context.platform },
        ...{ input: context.touch ? 'touch' : 'keys', orientation: context.portrait ? 'portrait' : 'landscape', viewWidth: context.viewWidth },
        ...{ log: draft.withLog ? ['error: x'] : [], key: 'k'.repeat(32) },
      };
      made.set(body, { draft: { ...draft }, context: { ...context } });
      return body;
    },
    send: (body: FeedbackBody) => {
      sent.push({ ...made.get(body)!, body });
      if (options.hold) return new Promise<FeedbackResult>((resolve) => (answer = resolve));
      return Promise.resolve(options.result ?? 'sent');
    },
  };
  const inbox = options.inbox ?? fakeInbox([]);
  /** The order of blur, settle cover and orientation lock when a form closes (ROADMAP 75). */
  const events: string[] = [];
  const field = {
    rect: null as Rect | null,
    value: '',
    placeholder: '',
    focused: 0,
    blurred: 0,
    hasFocus: false,
    place(rect: Rect | null, value: string, placeholder: string) {
      field.rect = rect;
      field.value = value;
      field.placeholder = placeholder;
      if (!rect) field.hasFocus = false;
    },
    focus() {
      field.focused++;
      field.hasFocus = true;
    },
    blur() {
      field.blurred++;
      field.hasFocus = false;
    },
    isFocused(): boolean {
      return field.hasFocus;
    },
  } satisfies FeedbackField & Record<string, unknown>;
  /** The portrait sheet (ROADMAP 58): what it shows and the player's actions on it. */
  const sheet = {
    model: null as FeedbackSheetModel | null,
    focused: 0,
    hasFocus: false,
    actions: null as FeedbackSheetHandlers | null,
    /** The scroll keys passed on to the sheet's list. */
    scrollKeys: [] as string[],
    show(model: FeedbackSheetModel | null) {
      sheet.model = model;
      if (!model) sheet.hasFocus = false;
    },
    focus() {
      sheet.focused++;
      sheet.hasFocus = true;
    },
    blur() {
      if (sheet.hasFocus) events.push('blur');
      sheet.hasFocus = false;
    },
    isFocused(): boolean {
      return sheet.hasFocus;
    },
    scrollKey(code: string): boolean {
      if (!code.startsWith('Arrow') && !code.startsWith('Page') && code !== 'Home' && code !== 'End') return false;
      sheet.scrollKeys.push(code);
      return true;
    },
  } satisfies FeedbackSheet & Record<string, unknown>;
  const store = memoryStore();
  if (options.kid) store.set('kidMode', true);
  /** The orientation locks asked for: a fake installed app (or a plain tab, which holds none). */
  const locks: string[] = [];
  const orientation: OrientationEnv = { locked: () => !!options.installed, lock: (o) => (locks.push(o), events.push(`lock:${o}`), Promise.resolve()) };
  const feedbackSheet = (handlers: FeedbackSheetHandlers) => ((sheet.actions = handlers), sheet);
  const rotate = fakeRotateSheet();
  const history = fakeHistory();
  const settleCover: SettleCover = { begin: (landscape) => void events.push(`cover:${landscape}`) };
  const ui = createUiSystem({
    ...{ store, fullscreenAvailable: () => true, scores: null, telemetry: null, feedback: sender, feedbackInbox: inbox, feedbackField: field, feedbackSheet },
    ...{ rotateSheet: rotate.factory, orientation, history: history.env, settleCover },
  });
  const game = new Game({ systems: [ui] });
  game.display.touch = options.touch ?? false;
  game.display.portrait = options.portrait ?? false;
  const input = (fields: Partial<MenuInput> = {}): MenuInput => ({
    viewWidth: game.display.viewWidth,
    touch: game.display.touch,
    portrait: game.display.portrait,
    fullscreenAvailable: true,
    reload: false,
    install: false,
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
  return { game, ui, flow: ui.feedback!, sent, field, sheet, rotate, locks, events, history, input, press, key, form, icon, tap, inbox, answer: (r: FeedbackResult) => answer(r) };
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

  it('the title icon (and F) opens it, no run starts behind it; "×" closes it', () => {
    const t = app();
    expect(t.press(t.icon())).toBe(true);
    expect(t.flow.open).toBe(true);
    t.key('Space');
    t.key('Enter');
    expect(t.game.state.mode).toBe('title');
    expect(t.press(t.form().close)).toBe(true);
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

  it('touch: no automatic focus (the keyboard opens on a tap into the field); the portrait sheet without the rotate screen', () => {
    const t = app({ touch: true, portrait: true });
    // The rotate hint covers the title: no icon until it is dismissed.
    expect(t.press(t.icon())).toBe(true);
    expect(t.flow.open).toBe(false);
    expect(t.press(t.icon())).toBe(true);
    expect(t.flow.open).toBe(true);
    t.game.tick();
    expect(t.field.focused).toBe(0);
    expect(t.sheet.focused).toBe(0);
    expect(t.sheet.model).not.toBeNull();
    t.game.display.portrait = false;
    t.game.tick();
    expect(t.sheet.model).toBeNull();
    expect(t.field.rect).toEqual(t.form().field);
    // Turned back to portrait: the sheet again, no rotate screen over it (ROADMAP 73).
    t.game.display.portrait = true;
    t.game.tick();
    expect(t.field.rect).toBeNull();
    expect(t.sheet.model).not.toBeNull();
    expect(t.rotate.shown).toBe(false);
  });

  it('portrait shows the full-screen sheet instead of the canvas form; its actions work like the form (ROADMAP 58)', async () => {
    const t = app({ touch: true, portrait: true });
    t.game.hitHotspot(10, 10); // the rotate hint
    t.press(t.icon());
    t.game.tick();
    expect(t.field.rect).toBeNull();
    expect(t.sheet.model).toMatchObject({ note: null, kind: 'bug', text: '', logShown: true });
    // The canvas form under the sheet takes no taps.
    t.press(t.form().idea);
    expect(t.flow.kind).toBe('bug');
    const a = t.sheet.actions!;
    a.onKind('idea');
    a.onKind('bug');
    a.onToggleLog();
    a.onInput('Die Bank ist zu hoch');
    t.game.tick();
    expect(t.sheet.model).toMatchObject({ text: 'Die Bank ist zu hoch', withLog: true, canSend: true });
    a.onSend();
    await Promise.resolve();
    t.game.tick();
    expect(t.sent[0]!.draft).toEqual({ kind: 'bug', text: 'Die Bank ist zu hoch', withLog: true });
    expect(t.sent[0]!.context).toMatchObject({ touch: true, portrait: true });
    // Sent: the sheet stays with the thanks on "Mein Feedback" (ROADMAP 75); the player closes it.
    expect(t.flow.open).toBe(true);
    expect(t.sheet.model).toMatchObject({ tab: 'mine', page: 'list', note: 'Danke für dein Feedback!' });
    a.onClose();
    t.game.tick();
    expect(t.flow.open).toBe(false);
    expect(t.sheet.model).toBeNull();
    expect(t.game.state.mode).toBe('title');
  });

  it('portrait: keys on the sheet type into its field, Esc closes; landscape never shows the sheet', () => {
    const t = app({ portrait: true });
    t.key('KeyF');
    t.game.tick();
    expect(t.sheet.model).not.toBeNull();
    expect(t.sheet.focused).toBe(1);
    t.sheet.blur();
    t.key('KeyQ');
    expect(t.sheet.isFocused()).toBe(true);
    t.key('Escape');
    expect(t.flow.open).toBe(false);
    const l = app();
    l.key('KeyF');
    l.game.tick();
    expect(l.sheet.model).toBeNull();
    expect(l.field.rect).toEqual(l.form().field);
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
    // The dialog stays on "Mein Feedback" with the thanks; "×" there closes it (ROADMAP 75).
    expect([t.flow.open, t.flow.page, t.flow.thanks]).toEqual([true, 'list', true]);
    t.game.tick();
    expect(t.field.rect).toBeNull();
    expect(t.press(pageLayout(t.game.display, 'list', t.flow.listNote).close)).toBe(true);
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
      if (options.portrait) expect(t.sheet.model).not.toBeNull();
      else {
        expect(t.field.blurred).toBeGreaterThan(blurred);
        expect(t.field.rect).toEqual(t.form().field);
      }
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

describe('portrait while typing feedback in the installed app (ROADMAP 54)', () => {
  it('opening the form frees portrait, "×" locks landscape again', () => {
    const t = app({ installed: true, touch: true });
    expect(t.locks).toEqual([]);
    t.press(t.icon());
    t.game.tick();
    expect(t.locks).toEqual(['any']);
    t.press(t.form().close);
    t.game.tick();
    expect(t.locks).toEqual(['any', 'landscape']);
  });

  it('Esc locks landscape again; after "Senden" portrait stays free on the list until the dialog closes', async () => {
    const t = app({ installed: true });
    t.key('KeyF');
    t.key('Escape');
    expect(t.locks).toEqual(['any', 'landscape']);
    t.key('KeyF');
    t.flow.setText('Die Bank ist zu hoch');
    t.press(t.form().send);
    await Promise.resolve();
    await Promise.resolve();
    t.game.tick();
    expect([t.flow.open, t.flow.thanks]).toEqual([true, true]);
    expect(t.locks).toEqual(['any', 'landscape', 'any']);
    t.key('Escape');
    expect(t.locks).toEqual(['any', 'landscape', 'any', 'landscape']);
  });

  it('the portrait sheet keeps portrait free after sending until the player closes it (ROADMAP 58, 75)', async () => {
    const t = app({ installed: true, touch: true });
    t.press(t.icon());
    t.game.display.portrait = true;
    t.game.tick();
    t.sheet.actions!.onInput('Die Bank ist zu hoch');
    t.sheet.actions!.onSend();
    await Promise.resolve();
    await Promise.resolve();
    t.game.tick();
    expect(t.sheet.model).toMatchObject({ page: 'list', note: 'Danke für dein Feedback!' });
    expect(t.locks).toEqual(['any']);
    t.sheet.actions!.onClose();
    t.game.tick();
    expect(t.locks).toEqual(['any', 'landscape']);
  });

  it('a run start or leaving the pause screen closes the form and locks landscape on the same tick', () => {
    const t = app({ installed: true });
    t.key('KeyF');
    t.game.commands.startRun();
    t.game.tick();
    expect(t.locks).toEqual(['any', 'landscape']);
    t.game.commands.pause();
    t.game.tick();
    t.press(pauseLayout(t.input()).buttons.feedback);
    t.game.tick();
    t.game.commands.resume();
    t.game.tick();
    expect(t.locks).toEqual(['any', 'landscape', 'any', 'landscape']);
  });

  it('turned to portrait while typing, the sheet takes over with the text and the focus instead of the rotate hint, and back', () => {
    const t = app({ installed: true, touch: true });
    t.press(t.icon());
    t.game.tick();
    t.press(t.form().field);
    t.ui.feedback!.setText('Halb getippt');
    expect(t.field.isFocused()).toBe(true);
    t.game.display.portrait = true;
    t.game.tick();
    expect(t.field.rect).toBeNull();
    expect(t.sheet.model).toMatchObject({ text: 'Halb getippt' });
    expect(t.sheet.isFocused()).toBe(true);
    t.sheet.actions!.onKind('idea');
    expect(t.flow.kind).toBe('idea');
    t.game.display.portrait = false;
    t.game.tick();
    expect(t.sheet.model).toBeNull();
    expect(t.field.rect).toEqual(t.form().field);
    expect(t.field.value).toBe('Halb getippt');
    expect(t.field.isFocused()).toBe(true);
  });

  it('a turn without the focus in the field moves no focus (no keyboard pops up by itself)', () => {
    const t = app({ installed: true, touch: true });
    t.press(t.icon());
    t.game.tick();
    t.game.display.portrait = true;
    t.game.tick();
    expect(t.sheet.model).not.toBeNull();
    expect(t.sheet.focused).toBe(0);
  });

  it('kid mode without feedback never frees portrait', () => {
    const t = app({ installed: true, kid: true });
    t.press(t.icon());
    t.key('KeyF');
    t.game.commands.startRun();
    t.game.commands.pause();
    t.game.tick();
    t.press(pauseLayout(t.input()).buttons.feedback);
    t.game.tick();
    expect(t.locks).toEqual([]);
  });
});

describe('"Mein Feedback" and "Ansehen" in the game (ROADMAP 70)', () => {
  const reports = () => [keptReport(5, { status: 'done', doneVersion: '2026-10-12.1', reply: 'Ist drin!', seen: 'old' }), keptReport(3)];
  const page = (t: ReturnType<typeof app>) => pageLayout(t.game.display, t.flow.page as 'list');
  const tapRect = (t: ReturnType<typeof app>, r: { x: number; y: number; w: number; h: number } | null) => {
    expect(r).not.toBeNull();
    t.tap(...centre(r!));
  };

  it('asks for the status each time the title shows in adult mode (the inbox keeps to once a minute), never in kid mode', () => {
    const t = app();
    expect(t.inbox.checks).toBe(1);
    t.game.tick();
    expect(t.inbox.checks).toBe(1);
    t.game.commands.startRun();
    t.game.tick();
    t.game.commands.gameOver();
    t.game.commands.toTitle();
    t.game.tick();
    expect(t.inbox.checks).toBe(2);
    const kid = app({ kid: true });
    kid.game.tick();
    expect(kid.inbox.checks).toBe(0);
  });

  it('the dot shows on the dialog while a report changed; the tab clears it, the changed row keeps its dot', () => {
    const t = app({ inbox: fakeInbox(reports()) });
    expect(t.flow.dot).toBe(true);
    t.press(t.icon());
    t.game.tick();
    expect([t.flow.tab, t.flow.page]).toEqual(['new', 'form']);
    expect(t.press(t.form().mineTab)).toBe(true);
    t.game.tick();
    expect([t.flow.tab, t.flow.page, t.flow.dot]).toEqual(['mine', 'list', false]);
    expect(t.flow.rows.map((r) => r.changed)).toEqual([true, false]);
    // The textarea hides on the list (nothing to type there).
    expect(t.field.rect).toBeNull();
  });

  it('a tap on a row opens its details, "Ansehen" what was sent, "Zurück" and Esc walk back, then Esc closes', () => {
    const t = app({ inbox: fakeInbox(reports()) });
    t.key('KeyF');
    t.press(t.form().mineTab);
    t.game.tick();
    tapRect(t, listRowRect(page(t), 0, 0));
    expect(t.flow.page).toBe('detail');
    expect(t.flow.detail?.headline).toBe('Umgesetzt in Version 2026-10-12.1');
    tapRect(t, pageLayout(t.game.display, 'detail').view);
    expect(t.flow.page).toBe('sent');
    tapRect(t, pageLayout(t.game.display, 'sent').back);
    expect(t.flow.page).toBe('detail');
    t.key('Escape');
    expect(t.flow.page).toBe('list');
    t.key('Escape');
    expect(t.flow.open).toBe(false);
    expect(t.game.state.mode).toBe('title');
  });

  it('a drag over the list scrolls it and opens nothing', () => {
    const many = Array.from({ length: 12 }, (_, i) => keptReport(20 - i));
    const t = app({ inbox: fakeInbox(many) });
    t.key('KeyF');
    t.press(t.form().mineTab);
    t.game.tick();
    const row = listRowRect(page(t), 1, 0)!;
    const pointers = new PointerControls(t.game);
    pointers.down(1, ...centre(row), false);
    t.flow.scrollBy(20);
    pointers.up(1);
    t.game.tick();
    expect(t.flow.page).toBe('list');
    expect(t.flow.scroll).toBe(20);
    // Keys scroll too, kept within the list.
    t.key('End');
    t.game.tick();
    expect(t.flow.scroll).toBe(12 * page(t).rowH - page(t).content.h);
    t.key('Home');
    expect(t.flow.scroll).toBe(0);
  });

  it('"Ansehen" on the form shows the snapshot, and "Senden" sends exactly that body', async () => {
    const t = app();
    t.key('KeyF');
    t.flow.setText('Hängt im Tunnel');
    t.press(t.form().log);
    expect(t.press(t.form().view)).toBe(true);
    expect(t.flow.page).toBe('preview');
    const shown = t.flow.preview;
    t.game.tick();
    expect(t.field.rect).toBeNull();
    tapRect(t, pageLayout(t.game.display, 'preview').back);
    expect(t.flow.page).toBe('form');
    t.game.tick();
    expect(t.field.rect).toEqual(t.form().field);
    t.press(t.form().send);
    await Promise.resolve();
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]!.body).toBe(shown);
  });

  it('portrait: the sheet carries the tabs and pages and acts on them', () => {
    const t = app({ touch: true, portrait: true, inbox: fakeInbox(reports()) });
    t.game.hitHotspot(10, 10); // the rotate hint
    t.press(t.icon());
    t.game.tick();
    expect(t.sheet.model).toMatchObject({ tab: 'new', page: 'form', dot: true });
    const a = t.sheet.actions!;
    a.onTab('mine');
    t.game.tick();
    expect(t.sheet.model).toMatchObject({ tab: 'mine', page: 'list', dot: false });
    a.onOpenReport(5);
    t.game.tick();
    expect(t.sheet.model!.detail?.reply).toBe('Antwort: „Ist drin!“');
    a.onSentLog();
    a.onBack();
    a.onBack();
    t.game.tick();
    expect(t.sheet.model?.page).toBe('list');
    a.onTab('new');
    a.onInput('Mehr Brezeln');
    a.onPreview();
    t.game.tick();
    expect(t.sheet.model).toMatchObject({ page: 'preview', title: 'Das wird gesendet' });
    a.onBack();
    a.onBack();
    t.game.tick();
    expect(t.flow.open).toBe(false);
    expect(t.sheet.model).toBeNull();
  });

  it('portrait: the scroll keys move the sheet\'s list and text pages, not the canvas page', () => {
    const t = app({ touch: true, portrait: true, inbox: fakeInbox(reports()) });
    t.game.hitHotspot(10, 10); // the rotate hint
    t.press(t.icon());
    t.game.tick();
    t.key('ArrowDown');
    expect(t.sheet.scrollKeys).toEqual([]); // the form: keys type into the field
    t.sheet.actions!.onTab('mine');
    t.game.tick();
    t.key('ArrowDown');
    t.key('PageDown');
    t.sheet.actions!.onOpenReport(5);
    t.game.tick();
    t.key('End');
    expect(t.sheet.scrollKeys).toEqual(['ArrowDown', 'PageDown', 'End']);
    expect(t.flow.scroll).toBe(0);
  });

  it('keeps portrait free on every page of the dialog (ticket #6), not only on the form', () => {
    const t = app({ installed: true, inbox: fakeInbox(reports()) });
    t.key('KeyF');
    t.game.tick();
    expect(t.locks).toEqual(['any']);
    t.press(t.form().mineTab);
    t.game.tick();
    tapRect(t, listRowRect(page(t), 0, 0));
    tapRect(t, pageLayout(t.game.display, 'detail').view);
    expect(t.locks).toEqual(['any']);
    t.key('Escape');
    t.key('Escape');
    t.key('Escape');
    expect(t.flow.open).toBe(false);
    expect(t.locks).toEqual(['any', 'landscape']);
  });

  it('turned on the list or the details, the sheet follows portrait and the canvas page comes back in landscape (ticket #6)', () => {
    const t = app({ installed: true, touch: true, inbox: fakeInbox(reports()) });
    t.press(t.icon());
    t.game.tick();
    t.press(t.form().mineTab);
    t.game.tick();
    for (const go of [() => {}, () => t.flow.openReport(5), () => t.flow.openSentLog()]) {
      go();
      t.game.tick();
      const page = t.flow.page;
      t.game.display.portrait = true;
      t.game.tick();
      expect([t.rotate.shown, t.sheet.model?.page], page).toEqual([false, page]);
      t.game.display.portrait = false;
      t.game.tick();
      expect(t.sheet.model, page).toBeNull();
      expect(t.flow.page, page).toBe(page);
    }
    expect(t.locks).toEqual(['any']);
  });
});


describe('the rotate screen around the feedback dialog (ROADMAP 73)', () => {
  it('a plain tab: turned to portrait while typing, the sheet shows at once, without the rotate screen or a tap', () => {
    const t = app({ touch: true });
    t.press(t.icon());
    t.game.tick();
    t.ui.feedback!.setText('Halb getippt');
    t.game.display.portrait = true;
    t.game.tick();
    expect(t.rotate.shown).toBe(false);
    expect(t.sheet.model).toMatchObject({ text: 'Halb getippt' });
  });

  it('the tabs and pages ("Mein Feedback", "Ansehen") keep the sheet too', () => {
    const t = app({ touch: true, inbox: fakeInbox([keptReport(5)]) });
    t.press(t.icon());
    t.game.tick();
    t.game.display.portrait = true;
    t.game.tick();
    t.sheet.actions!.onTab('mine');
    t.game.tick();
    t.sheet.actions!.onOpenReport(5);
    t.game.tick();
    expect(t.rotate.shown).toBe(false);
    expect(t.sheet.model?.page).toBe('detail');
  });

  it('closing the sheet in portrait brings the rotate screen back over the title; "Trotzdem weiter" dismisses it', () => {
    const t = app({ touch: true });
    t.press(t.icon());
    t.game.tick();
    t.game.display.portrait = true;
    t.game.tick();
    t.sheet.actions!.onClose();
    t.game.tick();
    expect(t.flow.open).toBe(false);
    expect(t.sheet.model).toBeNull();
    expect(t.rotate.shown).toBe(true);
    t.rotate.actions!.onDismiss();
    t.game.tick();
    expect(t.rotate.shown).toBe(false);
    expect(t.game.state.mode).toBe('title');
  });

  it('opened from the pause menu: the turn shows the sheet, the run stays paused', () => {
    const t = app({ touch: true });
    t.game.commands.startRun();
    t.game.commands.pause();
    t.game.tick();
    t.press(pauseLayout(t.input()).buttons.feedback);
    t.game.tick();
    t.game.display.portrait = true;
    t.game.tick();
    expect(t.rotate.shown).toBe(false);
    expect(t.sheet.model).not.toBeNull();
    expect(t.game.state.mode).toBe('paused');
  });
});

describe('closing a portrait form smoothly (ROADMAP 75)', () => {
  /** Opens the sheet in portrait with the keyboard up and text typed. */
  function typing(options: AppOptions) {
    const t = app({ touch: true, ...options });
    t.press(t.icon());
    t.game.display.portrait = true;
    t.game.tick();
    t.sheet.focus();
    t.sheet.actions!.onInput('Die Bank ist zu hoch');
    t.game.tick();
    t.events.length = 0;
    return t;
  }

  it('the installed app: the field is blurred first, then the cover, then the landscape lock', () => {
    const t = typing({ installed: true });
    t.sheet.actions!.onClose();
    t.game.tick();
    expect(t.events).toEqual(['blur', 'cover:true', 'lock:landscape']);
    expect(t.sheet.model).toBeNull();
    t.game.tick();
    expect(t.events).toHaveLength(3);
  });

  it('after sending too, once the player closes the sheet', async () => {
    const t = typing({ installed: true });
    t.sheet.actions!.onSend();
    await Promise.resolve();
    t.game.tick();
    // Off the form the keyboard goes down at once; portrait stays free.
    expect(t.events).toEqual(['blur']);
    t.sheet.actions!.onClose();
    t.game.tick();
    expect(t.events).toEqual(['blur', 'cover:true', 'lock:landscape']);
  });

  it('a plain browser tab covers until the keyboard is down, without waiting for landscape', () => {
    const t = typing({});
    t.sheet.actions!.onBack();
    t.game.tick();
    expect(t.events).toEqual(['blur', 'cover:false']);
  });

  it('a plain browser tab without the keyboard up needs no cover', () => {
    const t = typing({});
    t.sheet.blur();
    t.events.length = 0;
    t.sheet.actions!.onClose();
    t.game.tick();
    expect(t.events).toEqual([]);
  });

  it('closing the canvas form in landscape needs no cover', () => {
    const t = app({ touch: true, installed: true });
    t.press(t.icon());
    t.game.tick();
    t.press(t.form().close);
    t.game.tick();
    expect(t.events).toEqual(['lock:any', 'lock:landscape']);
  });
});

describe('Android back (ROADMAP 75)', () => {
  it('walks the feedback dialog back one level per press: details, list, closed; then the title lets go', () => {
    const t = app({ touch: true, inbox: fakeInbox([keptReport(5), keptReport(3)]) });
    t.press(t.icon());
    t.game.tick();
    expect([t.history.pushes, t.history.extra]).toEqual([1, 1]);
    t.flow.showTab('mine');
    t.flow.openReport(5);
    t.game.tick();
    t.history.pressBack();
    expect([t.flow.open, t.flow.page]).toEqual([true, 'list']);
    t.game.tick();
    expect(t.history.extra).toBe(1);
    t.history.pressBack();
    expect(t.flow.open).toBe(false);
    t.game.tick();
    expect(t.history.extra).toBe(0);
    expect(t.game.state.mode).toBe('title');
    t.history.pressBack();
    expect(t.history.left).toBe(true);
    expect(t.history.pushes).toBe(2);
  });

  it('a run pauses on back and stays paused; leaving it by the menu drops the entry', () => {
    const t = app({ touch: true });
    t.game.commands.startRun();
    t.game.tick();
    expect(t.history.extra).toBe(1);
    t.history.pressBack();
    expect(t.game.state.mode).toBe('paused');
    t.game.tick();
    t.history.pressBack();
    t.game.tick();
    expect(t.game.state.mode).toBe('paused');
    expect([t.history.extra, t.history.left]).toEqual([1, false]);
    t.game.commands.toTitle();
    t.game.tick();
    expect(t.history.backs).toBe(1);
    t.history.settle();
    t.game.tick();
    expect([t.history.extra, t.game.state.mode]).toEqual([0, 'title']);
  });

  it('closes the settings to the title, and goes from game over to the title', () => {
    const t = app();
    t.ui.settings.openMenu(false);
    t.game.tick();
    t.history.pressBack();
    expect(t.ui.settings.open).toBe(false);
    t.game.tick();
    expect(t.history.extra).toBe(0);
    t.game.commands.startRun();
    t.game.tick();
    t.game.commands.gameOver();
    t.game.tick();
    t.history.pressBack();
    expect(t.game.state.mode).toBe('title');
  });

  it('the feedback dialog over the pause screen closes back to the pause screen', () => {
    const t = app();
    t.game.commands.startRun();
    t.game.commands.pause();
    t.game.tick();
    t.key('KeyF');
    expect(t.flow.open).toBe(true);
    t.history.pressBack();
    expect([t.flow.open, t.game.state.mode]).toEqual([false, 'paused']);
  });
});

describe('deleting an own report in the game (ROADMAP 78)', () => {
  const settle = async (t: ReturnType<typeof app>) => {
    await Promise.resolve();
    await Promise.resolve();
    t.game.tick();
  };
  const onDetail = (options: AppOptions = {}) => {
    const inbox = fakeInbox([keptReport(5), keptReport(3)]);
    const t = app({ inbox, ...options });
    t.press(t.icon());
    t.game.tick();
    t.flow.showTab('mine');
    t.flow.openReport(3);
    t.game.tick();
    return { ...t, inbox };
  };
  const rects = (t: ReturnType<typeof app>) => pageLayout(t.game.display, t.flow.page as 'detail');

  it('touch on the canvas: "Löschen", then "Ja, löschen" deletes it and the list says "Feedback gelöscht"', async () => {
    const t = onDetail({ touch: true });
    expect(t.press(rects(t).del)).toBe(true);
    t.game.tick();
    expect(t.flow.page).toBe('confirm');
    expect(t.press(rects(t).yes)).toBe(true);
    await settle(t);
    expect(t.inbox.removed).toEqual([3]);
    expect([t.flow.page, t.flow.listNote, t.flow.rows.map((r) => r.id)]).toEqual(['list', de.feedbackPages.deleted, [5]]);
  });

  it('"Abbrechen", Esc and Android back close the confirm first and delete nothing', () => {
    const t = onDetail({ touch: true });
    t.press(rects(t).del);
    t.game.tick();
    t.press(rects(t).no);
    expect(t.flow.page).toBe('detail');
    t.press(rects(t).del);
    t.key('Escape');
    expect([t.flow.open, t.flow.page]).toEqual([true, 'detail']);
    t.press(rects(t).del);
    t.game.tick();
    t.history.pressBack();
    expect([t.flow.open, t.flow.page]).toEqual([true, 'detail']);
    expect(t.inbox.removed).toEqual([]);
  });

  it('offline: the report stays and the confirm says so', async () => {
    const t = onDetail();
    t.inbox.answer = 'offline';
    t.press(rects(t).del);
    t.press(rects(t).yes);
    await settle(t);
    expect([t.flow.page, t.flow.deleteMessage, t.flow.rows.length]).toEqual(['confirm', 'Keine Verbindung. Später nochmal.', 2]);
  });

  it('the portrait sheet: "Löschen" and "Ja, löschen" act the same', async () => {
    const t = onDetail({ touch: true });
    t.game.display.portrait = true;
    t.game.tick();
    expect(t.sheet.model?.page).toBe('detail');
    t.sheet.actions!.onDelete();
    t.game.tick();
    expect(t.sheet.model).toMatchObject({ page: 'confirm', title: de.feedbackPages.confirmTitle, deleteMessage: null });
    t.sheet.actions!.onConfirmDelete();
    await settle(t);
    expect(t.sheet.model).toMatchObject({ page: 'list', note: de.feedbackPages.deleted });
    expect(t.sheet.model!.rows.map((r) => r.id)).toEqual([5]);
  });
});
