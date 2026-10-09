import { describe, expect, it } from 'vitest';
import { GAMEOVER_INPUT_DELAY, TICK_DT } from '../core/config';
import { Game } from '../core/game';
import { keyDown, keyUp } from '../core/input';
import { createMemoryStore } from '../core/storage';
import type { ScoreEntry } from '../net/api';
import type { RunStats } from '../net/payload';
import type { SubmitOutcome } from '../net/service';
import type { Rect } from '../types';
import type { ScoreServiceLike } from './highscore-flow';
import { createUiSystem } from './index';
import { uiMetrics } from './layout';
import { gameOverLayout } from './menu-layout';
import type { NameField } from './name-field';
import { allNicknames } from './nicknames';
import { closeButton, scoreEntryLayout, titleTrophy } from './score-layout';

const entry = (rank: number, score: number): ScoreEntry => ({ rank, name: `P${rank}`, score, distance: 100, date: '2026-10-09T10:00:00.000Z' });
const fullList = () => Array.from({ length: 20 }, (_, i) => entry(i + 1, 5000 - i * 100));
const centre = (r: Rect) => [r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2)] as const;

function setup(options: { fullscreen?: boolean } = {}) {
  const sent: { run: RunStats; name: string }[] = [];
  const outcomes: SubmitOutcome[] = [];
  let refreshes = 0;
  const service: ScoreServiceLike = {
    top: fullList(),
    topState: 'ready',
    pending: null,
    async refreshTop() {
      refreshes++;
    },
    async submit(run, name) {
      sent.push({ run, name });
      const outcome = outcomes.shift() ?? { kind: 'ok', rank: 1, entries: [{ ...entry(1, run.score), name }] };
      if (outcome.kind === 'ok') service.top = outcome.entries;
      return outcome;
    },
    async retryPending() {},
  };
  const placed: (Rect | null)[] = [];
  let focused = 0;
  const nameField: NameField = {
    place: (rect) => void placed.push(rect),
    focus: () => void focused++,
  };
  const store = createMemoryStore();
  const ui = createUiSystem({ store, fullscreenAvailable: () => !!options.fullscreen, scores: service, nameField });
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
      install: null,
      newRecord: true,
      submit: true,
    }).buttons.submit!;
  return { game, flow, service, sent, outcomes, store, placed, key, crash, submitRect, refreshes: () => refreshes, focused: () => focused };
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

  it('shows the native name field over the entry field only in adult mode, focused on desktop', () => {
    const { game, crash, key, placed, focused } = setup();
    crash(4500);
    key('KeyE');
    const field = scoreEntryLayout({ ...game.display }, false).field;
    expect(placed[placed.length - 1]).toEqual(field);
    expect(focused()).toBe(1);
    key('Escape');
    expect(placed[placed.length - 1]).toBeNull();
  });

  it('kid mode: no free text field, a generated nickname, N for a new one', async () => {
    const { game, flow, crash, key, placed, sent } = setup();
    game.state.kidMode = true;
    crash(4500);
    key('KeyE');
    expect(placed[placed.length - 1]).toBeNull();
    const first = flow.name;
    expect(allNicknames()).toContain(first);
    key('KeyN');
    expect(flow.name).not.toBe(first);
    const reroll = scoreEntryLayout({ ...game.display }, true).reroll!;
    game.hitHotspot(...centre(reroll));
    expect(allNicknames()).toContain(flow.name);
    const picked = flow.name;
    game.hitHotspot(...centre(scoreEntryLayout({ ...game.display }, true).submit));
    await Promise.resolve();
    expect(sent[0]!.name).toBe(picked);
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

describe('without an online list', () => {
  it('shows no trophy and no Eintragen (tests, headless games)', () => {
    const ui = createUiSystem({ store: createMemoryStore(), fullscreenAvailable: () => false, scores: null });
    const game = new Game({ systems: [ui] });
    expect(ui.highscores).toBeNull();
    const trophy = titleTrophy(game.display.viewWidth, false, uiMetrics(game.display));
    expect(game.hitHotspot(...centre(trophy))).toBe(false);
  });
});
