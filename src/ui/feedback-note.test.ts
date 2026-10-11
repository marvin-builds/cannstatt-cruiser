import { describe, expect, it } from 'vitest';
import { VIEW_H } from '../core/config';
import { measureText } from '../core/font';
import { Game } from '../core/game';
import { keyDown, keyUp, PointerControls } from '../core/input';
import { createMemoryStore } from '../core/storage';
import type { FeedbackStatusLike } from '../net/feedback-status';
import { MAX_REPLY_CHARS, type FeedbackStatusEntry } from '../net/feedback-types';
import { FEEDBACK_NOTE_TEXT, feedbackNoteLayout } from './feedback-note';
import { createUiSystem } from './index';
import { hudButtons, uiMetrics } from './layout';
import { titleLayout } from './menu-layout';

const DISPLAYS = [
  { name: 'desktop', viewWidth: 320, touch: false, portrait: false },
  { name: 'desktop wide', viewWidth: 427, touch: false, portrait: false },
  { name: 'phone landscape', viewWidth: 390, touch: true, portrait: false },
  { name: 'phone portrait', viewWidth: 320, touch: true, portrait: true },
];
const LONG_REPLY = 'Wir haben uns das genau angeschaut, aber der Schlossgarten passt leider nicht zur Strecke durch Bad Cannstatt. Danke dir!'
  .padEnd(MAX_REPLY_CHARS, '!');

describe('feedback note texts', () => {
  it('says what happened, short and kid-safe', () => {
    expect(feedbackNoteLayout(DISPLAYS[0]!, { id: 1, status: 'done', reply: null }).headline).toBe('Dein Feedback: umgesetzt!');
    expect(feedbackNoteLayout(DISPLAYS[0]!, { id: 1, status: 'rejected', reply: null }).headline).toBe('Dein Feedback: nicht geplant');
    expect(feedbackNoteLayout(DISPLAYS[0]!, { id: 1, status: 'todo', reply: null }).headline).toBe('Dein Feedback: geplant!');
    expect(FEEDBACK_NOTE_TEXT.ok).toBe('OK');
  });

  it("shows the operator's reply, else a friendly default line", () => {
    const withReply = feedbackNoteLayout(DISPLAYS[0]!, { id: 1, status: 'rejected', reply: 'Passt nicht zur Strecke.' });
    expect(withReply.lines.join(' ')).toContain('Passt nicht zur Strecke.');
    const plain = feedbackNoteLayout(DISPLAYS[0]!, { id: 1, status: 'done', reply: null });
    expect(plain.lines).toEqual([FEEDBACK_NOTE_TEXT.thanks.done]);
  });
});

describe('feedback note layout', () => {
  for (const display of DISPLAYS) {
    it(`fits the view (${display.name}), also with the longest reply`, () => {
      for (const reply of [null, 'Kurz.', LONG_REPLY]) {
        const l = feedbackNoteLayout(display, { id: 1, status: 'rejected', reply });
        expect(measureText(l.headline, 2), 'headline').toBeLessThanOrEqual(display.viewWidth - 8);
        for (const line of l.lines) expect(measureText(line, l.scale), line).toBeLessThanOrEqual(display.viewWidth - 8);
        expect(l.headlineY).toBeGreaterThanOrEqual(2);
        expect(l.linesY).toBeGreaterThan(l.headlineY + 14);
        expect(l.ok.y).toBeGreaterThanOrEqual(l.linesY + l.lines.length * l.lineH);
        expect(l.ok.y + l.ok.h).toBeLessThanOrEqual(VIEW_H - 2);
        expect(l.ok.h).toBe(uiMetrics(display).menuButtonH);
      }
    });
  }

  it('draws the reply at scale 2 in portrait, where a view pixel is about one CSS px', () => {
    expect(feedbackNoteLayout(DISPLAYS[3]!, { id: 1, status: 'done', reply: LONG_REPLY }).scale).toBe(2);
    expect(feedbackNoteLayout(DISPLAYS[0]!, { id: 1, status: 'done', reply: LONG_REPLY }).scale).toBe(1);
  });

  it('shortens a reply that would not fit with "..."', () => {
    const l = feedbackNoteLayout(DISPLAYS[3]!, { id: 1, status: 'done', reply: 'Wort '.repeat(60) });
    expect(l.lines.at(-1)!.endsWith('...')).toBe(true);
  });
});

/** A fake status check: a fixed list of notes, shown in order. */
function fakeStatus(notes: FeedbackStatusEntry[]) {
  const fake = {
    checks: 0,
    dismissed: [] as FeedbackStatusEntry[],
    get note() {
      return notes[0] ?? null;
    },
    checkIfDue() {
      fake.checks++;
      return Promise.resolve();
    },
    dismiss() {
      const shown = notes.shift();
      if (shown) fake.dismissed.push(shown);
    },
  } satisfies FeedbackStatusLike & Record<string, unknown>;
  return fake;
}

function app(notes: FeedbackStatusEntry[], { kid = false, touch = false, portrait = false } = {}) {
  const store = createMemoryStore();
  if (kid) store.set('kidMode', true);
  const status = fakeStatus(notes);
  const ui = createUiSystem({ store, fullscreenAvailable: () => true, scores: null, telemetry: null, feedback: null, feedbackStatus: status });
  const game = new Game({ systems: [ui] });
  game.display.touch = touch;
  game.display.portrait = portrait;
  const pointers = new PointerControls(game);
  const tap = (x: number, y: number) => {
    pointers.down(1, x, y, touch);
    pointers.up(1);
    for (let i = 0; i < 4; i++) game.tick();
  };
  const key = (code: string) => {
    keyDown(game, code);
    keyUp(game, code);
    game.tick();
  };
  game.tick();
  return { game, ui, status, tap, key };
}

const DONE: FeedbackStatusEntry = { id: 3, status: 'done', reply: null };
const REJECTED: FeedbackStatusEntry = { id: 5, status: 'rejected', reply: 'Passt nicht zur Strecke.' };

describe('feedback note on the title', () => {
  it('asks for the status when the title shows (the check itself keeps to once a day)', () => {
    const t = app([]);
    expect(t.status.checks).toBe(1);
    t.game.tick();
    expect(t.status.checks).toBe(1);
    t.game.commands.startRun();
    t.game.tick();
    t.game.commands.gameOver();
    t.game.commands.toTitle();
    t.game.tick();
    expect(t.status.checks).toBe(2);
  });

  it('covers the title with the note; OK closes it and the next note follows, then the title', () => {
    const t = app([DONE, REJECTED]);
    expect(t.ui.feedbackNote).toEqual(DONE);
    const ok = feedbackNoteLayout(t.game.display, DONE).ok;
    t.tap(ok.x + 2, ok.y + 2);
    expect(t.status.dismissed).toEqual([DONE]);
    expect(t.game.state.mode).toBe('title');
    expect(t.ui.feedbackNote).toEqual(REJECTED);
    t.key('Enter');
    expect(t.status.dismissed).toEqual([DONE, REJECTED]);
    expect(t.ui.feedbackNote).toBeNull();
    expect(t.game.state.mode).toBe('title');
  });

  it('a tap anywhere or a key closes it without starting a run; M still mutes', () => {
    const t = app([DONE]);
    t.key('KeyM');
    expect(t.game.state.muted).toBe(true);
    expect(t.status.dismissed).toEqual([]);
    t.tap(-50, 400);
    expect(t.status.dismissed).toEqual([DONE]);
    expect(t.game.state.mode).toBe('title');
  });

  it('hides the title buttons (gear, mute): a tap there only closes the note', () => {
    const gearApp = app([DONE]);
    const gear = titleLayout({
      viewWidth: gearApp.game.display.viewWidth, touch: false, portrait: false, fullscreenAvailable: true, reload: false, install: null, settingsButton: true,
    }).buttons.settings!;
    gearApp.tap(gear.x + 2, gear.y + 2);
    expect(gearApp.ui.settings.open).toBe(false);
    expect(gearApp.status.dismissed).toEqual([DONE]);
    const muteApp = app([DONE]);
    const mute = hudButtons(muteApp.game.display.viewWidth, true, undefined, false).mute;
    muteApp.tap(mute.x + 2, mute.y + 2);
    expect(muteApp.game.state.muted).toBe(false);
    expect(muteApp.status.dismissed).toEqual([DONE]);
  });

  it('never shows nor asks in kid mode', () => {
    const t = app([DONE], { kid: true });
    expect(t.ui.feedbackNote).toBeNull();
    expect(t.status.checks).toBe(0);
    t.key('Enter');
    expect(t.status.dismissed).toEqual([]);
  });

  it('waits until "Neu in dieser Version" was closed', () => {
    const t = app([DONE]);
    t.game.state.whatsNew = [{ version: '2026-10-11.9', date: '2026-10-11', items: ['Neu'] }];
    t.game.tick();
    expect(t.ui.feedbackNote).toBeNull();
    t.game.commands.markVersionSeen();
    t.game.tick();
    expect(t.ui.feedbackNote).toEqual(DONE);
  });
});
