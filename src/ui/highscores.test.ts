import { describe, expect, it } from 'vitest';
import { GAMEOVER_INPUT_DELAY, TICK_DT } from '../core/config';
import { Game } from '../core/game';
import { keyDown, keyUp, PointerControls } from '../core/input';
import { createMemoryStore } from '../core/storage';
import type { OrientationEnv } from '../core/orientation';
import type { ScoreEntry } from '../net/api';
import type { RunStats } from '../net/payload';
import type { SubmitOutcome } from '../net/service';
import type { Rect } from '../types';
import type { ScoreServiceLike } from './highscore-flow';
import { createUiSystem } from './index';
import { uiMetrics } from './layout';
import { gameOverLayout } from './menu-layout';
import type { NameField } from './name-field';
import type { EntrySheet, EntrySheetHandlers } from './entry-sheet';
import type { EntrySheetModel } from './portrait-sheets';
import { closeButton, scoreEntryLayout, scoreListLayout, titleTrophy } from './score-layout';
import { loadStatsOptOut } from '../net/telemetry';

const entry = (rank: number, score: number): ScoreEntry => ({ rank, name: `P${rank}`, score, distance: 100, date: '2026-10-09T10:00:00.000Z' });
const fullList = () => Array.from({ length: 20 }, (_, i) => entry(i + 1, 5000 - i * 100));
const centre = (r: Rect) => [r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2)] as const;

function setup(options: { fullscreen?: boolean; installed?: boolean } = {}) {
  const opened: string[] = [];
  const sent: { run: RunStats; name: string }[] = [];
  const outcomes: SubmitOutcome[] = [];
  let refreshes = 0;
  const service: Omit<ScoreServiceLike, 'ownBest'> & { ownBest: number } = {
    top: fullList(),
    topState: 'ready',
    pending: null,
    ownBest: 0,
    ownRank: null,
    async refreshTop() {
      refreshes++;
    },
    async submit(run, name) {
      sent.push({ run, name });
      const outcome = outcomes.shift() ?? { kind: 'ok', stored: true, rank: 1, best: run.score, entries: [{ ...entry(1, run.score), name }] };
      if (outcome.kind === 'ok') {
        service.top = outcome.entries;
        service.ownRank = outcome.rank;
        service.ownBest = outcome.best;
      }
      return outcome;
    },
    async retryPending() {},
  };
  const placed: (Rect | null)[] = [];
  let focused = 0;
  let blurred = 0;
  let fieldFocus = false;
  const nameField: NameField = {
    place: (rect) => {
      placed.push(rect);
      if (!rect) fieldFocus = false;
    },
    focus: () => void (focused++, (fieldFocus = true)),
    blur: () => void (blurred++, (fieldFocus = false)),
    isFocused: () => fieldFocus,
  };
  /** The portrait name entry sheet (ROADMAP 58). */
  const sheet = {
    model: null as EntrySheetModel | null,
    focused: 0,
    hasFocus: false,
    actions: null as EntrySheetHandlers | null,
    show(model: EntrySheetModel | null) {
      sheet.model = model;
      if (!model) sheet.hasFocus = false;
    },
    focus() {
      sheet.focused++;
      sheet.hasFocus = true;
    },
    blur() {
      sheet.hasFocus = false;
    },
    isFocused(): boolean {
      return sheet.hasFocus;
    },
  } satisfies EntrySheet & Record<string, unknown>;
  const entrySheet = (handlers: EntrySheetHandlers) => ((sheet.actions = handlers), sheet);
  const store = createMemoryStore();
  /** The orientation locks asked for: a fake installed app (or a plain tab, which holds none). */
  const locks: string[] = [];
  const orientation: OrientationEnv = { locked: () => !!options.installed, lock: (o) => (locks.push(o), Promise.resolve()) };
  const ui = createUiSystem({ store, fullscreenAvailable: () => !!options.fullscreen, scores: service, nameField, entrySheet, orientation, openPage: (url) => (opened.push(url), true) });
  const game = new Game({ systems: [ui], store });
  const flow = ui.highscores!;
  const key = (code: string) => {
    keyDown(game, code);
    game.tick();
    keyUp(game, code);
    game.tick();
  };
  /** A run of `seconds` playing time ending in game over with `score`, ready for input. */
  const crash = (score: number, seconds = 2) => {
    game.commands.startRun();
    for (let i = 0; i < Math.round(seconds / TICK_DT); i++) game.tick();
    game.state.score = score;
    game.state.distance = 4321;
    game.commands.gameOver();
    for (let i = 0; i < Math.ceil(GAMEOVER_INPUT_DELAY / TICK_DT) + 1; i++) game.tick();
  };
  const submitRect = () =>
    gameOverLayout({
      viewWidth: game.display.viewWidth,
      touch: false,
      portrait: false,
      fullscreenAvailable: !!options.fullscreen,
      reload: false,
      install: false,
      newRecord: true,
      submit: true,
    }).buttons.submit!;
  const pointers = new PointerControls(game);
  /** A whole tap at view px (x, y), which may lie outside the view (the letterbox, the page). */
  const tap = (x: number, y: number) => {
    pointers.down(1, x, y, true);
    pointers.up(1);
    for (let i = 0; i < 8; i++) game.tick();
  };
  return { game, flow, service, sent, sheet, locks, outcomes, store, placed, key, crash, submitRect, tap, refreshes: () => refreshes, focused: () => focused, blurred: () => blurred, opened };
}

describe('Bestenliste from the title', () => {
  it('the trophy button opens the list without starting a run; X closes it', () => {
    const { game, flow, refreshes } = setup();
    const trophy = titleTrophy(game.display.viewWidth, false, uiMetrics(game.display));
    expect(game.hitHotspot(...centre(trophy))).toBe(true);
    expect(flow.screen).toBe('list');
    expect(refreshes()).toBe(1);
    game.tick();
    expect(game.state.mode).toBe('title');
    // While the list shows, taps and Space never start a run.
    expect(game.hitHotspot(160, 120)).toBe(true);
    keyDown(game, 'Space');
    game.tick();
    keyUp(game, 'Space');
    expect(game.state.mode).toBe('title');
    game.hitHotspot(...centre(closeButton(game.display.viewWidth, uiMetrics(game.display))));
    expect(flow.screen).toBe('closed');
  });

  it('B opens and closes it, Esc closes it', () => {
    const { flow, key } = setup();
    key('KeyB');
    expect(flow.screen).toBe('list');
    key('KeyB');
    expect(flow.screen).toBe('closed');
    key('KeyB');
    key('Escape');
    expect(flow.screen).toBe('closed');
  });

  it('arrow keys scroll the list while held', () => {
    const { game, flow, key } = setup();
    key('KeyB');
    keyDown(game, 'ArrowDown');
    for (let i = 0; i < 10; i++) game.tick();
    keyUp(game, 'ArrowDown');
    const scrolled = flow.scroll;
    expect(scrolled).toBeGreaterThan(0);
    game.tick();
    expect(flow.scroll).toBe(scrolled);
    key('ArrowUp');
    expect(flow.scroll).toBeLessThan(scrolled);
  });

  it('the trophy is gone during a run and on game over', () => {
    const { game, flow } = setup();
    const trophy = titleTrophy(game.display.viewWidth, false, uiMetrics(game.display));
    game.commands.startRun();
    game.hitHotspot(...centre(trophy));
    expect(flow.screen).toBe('closed');
  });
});

describe('Eintragen after game over', () => {
  it('is offered for a top-20 score: a tap opens the name entry, nothing restarts', () => {
    const { game, flow, crash, submitRect } = setup();
    crash(4500);
    expect(flow.offered).toBe(true);
    expect(game.hitHotspot(...centre(submitRect()))).toBe(true);
    game.tick();
    expect(flow.screen).toBe('entry');
    expect(game.state.mode).toBe('gameover');
  });

  it('is not offered for a low score: the same tap starts a new run as before', () => {
    const { game, flow, crash, submitRect } = setup();
    crash(100);
    expect(flow.offered).toBe(false);
    expect(game.hitHotspot(...centre(submitRect()))).toBe(false);
    game.buttons.action.press('test');
    game.tick();
    expect(game.state.mode).toBe('playing');
  });

  it('E opens it on the keyboard; Space still restarts when it is not opened', () => {
    const { game, flow, crash, key } = setup();
    crash(4500);
    key('KeyE');
    expect(flow.screen).toBe('entry');
    key('Escape');
    expect(flow.screen).toBe('closed');
    expect(game.state.mode).toBe('gameover');
    key('Space');
    expect(game.state.mode).toBe('playing');
  });

  it('Enter opens it too, and Enter in the entry sends the remembered name with the play time', async () => {
    const { flow, crash, key, sent, store } = setup();
    store.set('scoreName', 'Max');
    crash(4500, 3);
    key('Enter');
    expect(flow.screen).toBe('entry');
    expect(flow.name).toBe('Max');
    key('Enter');
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.name).toBe('Max');
    expect(sent[0]!.run.score).toBe(4500);
    expect(sent[0]!.run.distance).toBe(4321);
    expect(sent[0]!.run.seconds).toBeCloseTo(3, 1);
    expect(flow.screen).toBe('list');
    expect(flow.highlight).toBe(1);
    expect(flow.offered).toBe(false);
  });

  it('after an own entry: a lower or equal run offers nothing, a higher one offers it with the name prefilled', async () => {
    const { game, flow, crash, key, sent } = setup();
    crash(4500);
    key('KeyE');
    flow.setName('Mia');
    key('Enter');
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toHaveLength(1);
    key('Escape');
    crash(4400);
    expect(flow.offered).toBe(false);
    key('KeyE');
    expect(flow.screen).toBe('closed');
    crash(4500);
    expect(flow.offered).toBe(false);
    crash(4800);
    expect(flow.offered).toBe(true);
    key('KeyE');
    expect(flow.screen).toBe('entry');
    expect(flow.name).toBe('Mia');
    expect(game.state.mode).toBe('gameover');
  });

  it('paused time does not count as play time', () => {
    const { game, sent, key, store } = setup();
    store.set('scoreName', 'Max');
    game.commands.startRun();
    for (let i = 0; i < 60; i++) game.tick();
    game.commands.pause();
    for (let i = 0; i < 600; i++) game.tick();
    game.commands.resume();
    for (let i = 0; i < 60; i++) game.tick();
    game.state.score = 4500;
    game.commands.gameOver();
    for (let i = 0; i < 60; i++) game.tick();
    key('KeyE');
    key('Enter');
    expect(sent[0]!.run.seconds).toBeCloseTo(2, 1);
  });

  it('shows the native name field over the entry field in adult mode (the default with nothing stored), focused on desktop', () => {
    const { game, crash, key, placed, focused } = setup();
    expect(game.state.kidMode).toBe(false);
    crash(4500);
    key('KeyE');
    const field = scoreEntryLayout({ ...game.display }).field;
    expect(placed[placed.length - 1]).toEqual(field);
    expect(focused()).toBe(1);
    key('Escape');
    expect(placed[placed.length - 1]).toBeNull();
  });

  it('a new run closes the screens and asks for the list again', () => {
    const { game, flow, crash, key, refreshes } = setup();
    crash(4500);
    const before = refreshes();
    key('KeyE');
    game.commands.startRun();
    game.tick();
    expect(flow.screen).toBe('closed');
    expect(refreshes()).toBe(before + 1);
  });
});

describe('kid mode: local records only (ROADMAP 45)', () => {
  it('the title has no trophy: its spot and B open nothing', () => {
    const { game, flow, key, refreshes } = setup();
    game.state.kidMode = true;
    const trophy = titleTrophy(game.display.viewWidth, false, uiMetrics(game.display));
    game.hitHotspot(...centre(trophy));
    expect(flow.screen).toBe('closed');
    key('KeyB');
    expect(flow.screen).toBe('closed');
    expect(game.state.mode).toBe('title');
    expect(refreshes()).toBe(0);
  });

  it('a kid run never offers Eintragen and never sends or queues it', async () => {
    const { game, flow, crash, key, sent, submitRect } = setup();
    game.state.kidMode = true;
    crash(4500);
    expect(flow.offered).toBe(false);
    expect(game.hitHotspot(...centre(submitRect()))).toBe(false);
    key('KeyE');
    expect(flow.screen).toBe('closed');
    key('Enter');
    await Promise.resolve();
    expect(sent).toHaveLength(0);
  });

  it('a kid run fetches no list at its start', () => {
    const { game, refreshes } = setup();
    game.state.kidMode = true;
    game.commands.startRun();
    game.tick();
    expect(refreshes()).toBe(0);
  });

  it('the adult trophy comes back once kid mode is off', () => {
    const { game, flow, key } = setup();
    game.state.kidMode = true;
    key('KeyB');
    expect(flow.screen).toBe('closed');
    game.state.kidMode = false;
    key('KeyB');
    expect(flow.screen).toBe('list');
  });
});

describe('without an online list', () => {
  it('shows no trophy and no Eintragen (tests, headless games)', () => {
    const ui = createUiSystem({ store: createMemoryStore(), fullscreenAvailable: () => false, scores: null });
    const game = new Game({ systems: [ui] });
    expect(ui.highscores).toBeNull();
    const trophy = titleTrophy(game.display.viewWidth, false, uiMetrics(game.display));
    expect(game.hitHotspot(...centre(trophy))).toBe(false);
  });
});

describe('statistics switch on the Bestenliste', () => {
  it('a tap on the switch (or A) stores the opt-out and keeps the list open', () => {
    const t = setup();
    t.game.tick();
    t.key('KeyB');
    expect(t.flow.screen).toBe('list');
    const l = scoreListLayout(t.game.display, t.flow.entries.length, t.flow.message !== null);
    expect(t.game.hitHotspot(...centre(l.stats))).toBe(true);
    expect(loadStatsOptOut(t.store)).toBe(true);
    expect(t.flow.screen).toBe('list');
    t.key('KeyA');
    expect(loadStatsOptOut(t.store)).toBe(false);
    expect(t.flow.screen).toBe('list');
  });
});

describe('"Datenschutz" link on the Bestenliste', () => {
  it('a tap opens datenschutz.html on the gesture and keeps the list open', () => {
    const t = setup();
    t.game.tick();
    t.key('KeyB');
    const l = scoreListLayout(t.game.display, t.flow.entries.length, t.flow.message !== null);
    expect(t.game.hitHotspot(...centre(l.privacyLink))).toBe(true);
    t.game.notifyUserGesture();
    expect(t.opened).toEqual(['datenschutz.html']);
    expect(t.flow.screen).toBe('list');
    expect(loadStatsOptOut(t.store)).toBe(false);
  });
});

describe('the open highscore screens are modal everywhere (taps outside the canvas)', () => {
  const outside = [
    [100, -30],
    [100, 220],
    [-12, 90],
    [-500, 2000],
  ] as const;

  it('a tap outside the canvas on the name entry neither restarts nor closes it, it only blurs the input', () => {
    const { game, flow, crash, submitRect, tap, blurred } = setup();
    crash(4500);
    game.hitHotspot(...centre(submitRect()));
    game.tick();
    expect(flow.screen).toBe('entry');
    for (const [x, y] of outside) tap(x, y);
    expect(game.state.mode).toBe('gameover');
    expect(flow.screen).toBe('entry');
    expect(blurred()).toBeGreaterThan(0);
  });

  it('a tap outside the canvas on the "Bestenliste" starts no run behind it', () => {
    const { game, flow, tap } = setup();
    game.tick();
    flow.openList();
    for (const [x, y] of outside) tap(x, y);
    expect(game.state.mode).toBe('title');
    expect(flow.screen).toBe('list');
  });
});

describe('portrait while typing a name in the installed app (ROADMAP 54)', () => {
  it('the name entry frees portrait, Esc locks landscape again; the list alone does not free it', () => {
    const { game, flow, crash, key, locks } = setup({ installed: true });
    flow.openList();
    game.tick();
    key('Escape');
    expect(locks).toEqual([]);
    crash(4500);
    key('KeyE');
    expect(locks).toEqual(['any']);
    key('Escape');
    expect(locks).toEqual(['any', 'landscape']);
  });

  it('sending the name (the list follows) or a new run locks landscape again', async () => {
    const { game, crash, key, locks, store } = setup({ installed: true });
    store.set('scoreName', 'Max');
    crash(4500);
    key('Enter');
    key('Enter');
    await Promise.resolve();
    await Promise.resolve();
    game.tick();
    expect(locks).toEqual(['any', 'landscape']);
    crash(4800);
    key('KeyE');
    game.commands.startRun();
    game.tick();
    expect(locks).toEqual(['any', 'landscape', 'any', 'landscape']);
  });

  it('turned to portrait while typing, the full-screen entry sheet takes over with the name and the focus, and back', () => {
    const { game, flow, crash, key, placed, sheet } = setup({ installed: true });
    crash(4500);
    key('KeyE');
    flow.setName('Ma');
    game.display.portrait = true;
    game.tick();
    expect(placed[placed.length - 1]).toBeNull();
    expect(sheet.model).toMatchObject({ name: 'Ma', score: '4.500 Punkte', submit: 'Als Ma eintragen', canSubmit: true });
    expect(sheet.isFocused()).toBe(true);
    game.display.portrait = false;
    game.tick();
    expect(sheet.model).toBeNull();
    expect(placed[placed.length - 1]).toEqual(scoreEntryLayout({ ...game.display }).field);
  });
});

describe('the name entry in portrait (ROADMAP 58)', () => {
  it('opens as the full-screen sheet (focused in the tap when no name is known), and its actions type, send and close', async () => {
    const { game, flow, crash, sheet, sent } = setup();
    game.display.touch = true;
    game.display.portrait = true;
    game.hitHotspot(10, 10); // the rotate hint
    crash(4500);
    const submit = gameOverLayout({ viewWidth: game.display.viewWidth, touch: true, portrait: true, fullscreenAvailable: false, reload: false, install: false, newRecord: true, submit: true }).buttons.submit!;
    expect(game.hitHotspot(...centre(submit))).toBe(true);
    expect(flow.screen).toBe('entry');
    expect(sheet.model).not.toBeNull();
    expect(sheet.focused).toBe(1);
    // The canvas entry under the sheet takes no taps.
    expect(game.hitHotspot(...centre(scoreEntryLayout({ ...game.display }).submit))).toBe(true);
    expect(sent).toHaveLength(0);
    sheet.actions!.onInput('Rollo');
    game.tick();
    expect(sheet.model!.submit).toBe('Als Rollo eintragen');
    sheet.actions!.onSubmit();
    await Promise.resolve();
    await Promise.resolve();
    game.tick();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.name).toBe('Rollo');
    expect(flow.screen).toBe('list');
    expect(sheet.model).toBeNull();
    flow.close();
    game.tick();
    crash(4800);
    game.hitHotspot(...centre(submit));
    sheet.actions!.onCancel();
    game.tick();
    expect(flow.screen).toBe('closed');
    expect(game.state.mode).toBe('gameover');
  });
});
