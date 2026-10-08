/**
 * Layout of the menu screens (title, pause, game over, "Neu in dieser
 * Version") with their buttons: reload ("Neue Version da"), the install hint,
 * "Zum Startbildschirm", "Weiter" and the pause logo. One pure function per
 * screen, used by both the hotspots (index.ts) and the drawing
 * (menu-screens.ts), so what is drawn is what can be tapped. Optional text
 * rows give way when the buttons need the room (fitColumn), nothing
 * overlaps the HUD button row, and pause and game over keep the skater
 * visible outside portrait.
 */
import { GROUND_Y, PLAYER_X, VIEW_H } from '../core/config';
import { measureText } from '../core/font';
import type { Rect } from '../types';
import { ARROW_RIGHT, SHARE_ICON } from './art';
import { type Block, type ColumnBounds, fitColumn } from './column';
import { centreX, fitCentred, hudButtons, type UiMetrics, uiMetrics } from './layout';
import { logoRect } from './logo';
import type { InstallHintKind } from './notices';

/** What a menu screen depends on besides its texts. */
export interface MenuInput {
  viewWidth: number;
  touch: boolean;
  portrait: boolean;
  fullscreenAvailable: boolean;
  /** Offer "Neu laden" (reloadOffered). */
  reload: boolean;
  /** The install hint to show, or null (installHintKind). */
  install: InstallHintKind | null;
}

export interface MenuButtons {
  reload: Rect | null;
  /** "Installieren" (install kind 'prompt' only). */
  install: Rect | null;
  /** "×" of the install hint. */
  dismiss: Rect | null;
  toTitle: Rect | null;
  /** "Weiter" on the "Neu in dieser Version" screen. */
  next: Rect | null;
  /** The pause screen's logo: a long press opens the settings. */
  logo: Rect | null;
}

export interface MenuLayout {
  /** Every visible block by id (text rows, cards, buttons), dropped optional rows are missing. */
  blocks: Map<string, Rect>;
  buttons: MenuButtons;
  /** Opaque plate behind the screen's text, or null. */
  panel: Rect | null;
}

/** All texts of the menu screens (German, game font). */
export const MENU_TEXT = {
  reload: 'Neue Version da',
  installReason: 'Als App: Vollbild und offline',
  iosShare: 'Teilen',
  iosHome: 'Zum Home-Bildschirm',
  install: 'Installieren',
  whatsNew: 'Neu in dieser Version',
  next: 'Weiter',
  pause: 'Pause',
  gameOver: 'Sturz! Runde vorbei',
  newRecord: 'Neuer Rekord!',
  restartNote: 'Lauf wird neu gestartet',
} as const;

/** Labels that show their key on desktop. */
export const reloadLabel = (touch: boolean) => (touch ? 'Neu laden' : 'Neu laden (U)');
export const toTitleLabel = (touch: boolean) => (touch ? 'Zum Startbildschirm' : 'Zum Startbildschirm (T)');

export const pausePrompt = (touch: boolean) => (touch ? 'Tippen zum Weiterfahren' : 'Leertaste, P oder Esc zum Weiterfahren');
export const PAUSE_KEYS = 'E = Gegenstand benutzen, M = Ton aus';
/** The title prompt. */
export const startPrompt = (touch: boolean) => (touch ? 'Tippen zum Starten' : 'Leertaste zum Starten');
/** The title's controls in one line, when notices leave no room for the full help. */
export const controlsLine = (touch: boolean) =>
  touch ? 'Tippen = springen, runterwischen = ducken' : 'Leertaste = springen, S = ducken';
export const trickKeysHint = (touch: boolean) =>
  touch ? 'Beim Grinden runterwischen = Trick' : 'Beim Grinden: Pfeil runter / S = Trick';
export const gameOverPrompt = (touch: boolean) => (touch ? 'Tippen für eine neue Runde' : 'Leertaste für eine neue Runde');
export const GAMEOVER_KEYS = 'Esc = zum Titelbild';

/** Rows of the game-over results table (labels; values come from the run). */
export const RESULT_ROWS = ['Punkte', 'Highscore', 'Sterne', 'Sterne gesamt', 'Strecke'] as const;

/** Results rows that give way to buttons: totals first, then (after the record line) stars and distance; the score stays. */
const RESULT_ROW_DROP = [undefined, 2, 0.5, 2, 0.5];
/** On a crowded game over the install hint goes before stars and distance (the title still shows it). */
const INSTALL_DROP_GAMEOVER = 0.75;

/** Height of a text line; text sits at the top of its row. */
export const LINE = 11;
/** Space between a card's text and its buttons. */
export const CARD_GAP = 4;
const BUTTON_PAD = 6;
/** Two text lines of the iOS install hint. */
const TWO_LINES = 2 * LINE - 3;
/** Gap between the parts of the iOS steps line ("Teilen", icon, arrow, "Zum Home-Bildschirm"). */
export const STEP_GAP = 3;

/** The title's text panel: top just under the logo, at least this wide. */
export const TITLE_PANEL_Y = 66;
const TITLE_PANEL_W = 236;
/** Space between the title panel's edges and its rows and buttons (sides and bottom). */
export const PANEL_PAD = 4;
/**
 * Where the skater rides (and its board meets the ground) in pause and game
 * over: no text or button covers it outside portrait.
 */
export const SKATER_CLEAR: Rect = { x: PLAYER_X - 16, y: GROUND_Y - 36, w: 32, h: 40 };
/** Results table rows are this wide at most (label and value split at the centre). */
const TABLE_W = 150;
const BOTTOM = VIEW_H - 2;
/** Top of a screen's headline (game over, what's new). */
const HEADLINE_Y = 10;

/** Label scale of a menu button: 2 once it is touch-sized. */
export function buttonLabelScale(m: UiMetrics): number {
  return m.menuButtonH >= 24 ? 2 : 1;
}

function buttonWidth(label: string, m: UiMetrics): number {
  return Math.max(m.menuButtonH, measureText(label, buttonLabelScale(m)) + 2 * BUTTON_PAD);
}

const IOS_STEPS_W = measureText(MENU_TEXT.iosShare) + SHARE_ICON.width + ARROW_RIGHT.width + measureText(MENU_TEXT.iosHome) + 3 * STEP_GAP;

function reloadCardSize(m: UiMetrics, touch: boolean): { w: number; h: number } {
  return { w: measureText(MENU_TEXT.reload) + CARD_GAP + buttonWidth(reloadLabel(touch), m), h: m.menuButtonH };
}

function installCardSize(kind: InstallHintKind, m: UiMetrics): { w: number; h: number } {
  const dismiss = m.menuButtonH;
  if (kind === 'prompt') {
    return { w: measureText(MENU_TEXT.installReason) + CARD_GAP + buttonWidth(MENU_TEXT.install, m) + CARD_GAP + dismiss, h: m.menuButtonH };
  }
  const text = Math.max(measureText(MENU_TEXT.installReason), IOS_STEPS_W);
  return { w: text + CARD_GAP + dismiss, h: Math.max(m.menuButtonH, TWO_LINES) };
}

/** Text at the left, vertically centred, and the "Neu laden" button at the right of the reload card. */
export function reloadParts(card: Rect, m: UiMetrics, touch: boolean): { textX: number; textY: number; button: Rect } {
  const w = buttonWidth(reloadLabel(touch), m);
  return {
    textX: card.x,
    textY: card.y + Math.floor((card.h - 7) / 2),
    button: { x: card.x + card.w - w, y: card.y, w, h: m.menuButtonH },
  };
}

/** The install card: reason (and iOS steps) at the left, "Installieren" (prompt only) and "×" at the right. */
export function installParts(
  card: Rect,
  kind: InstallHintKind,
  m: UiMetrics,
): { textX: number; textY: number; button: Rect | null; dismiss: Rect } {
  const h = m.menuButtonH;
  const dismiss: Rect = { x: card.x + card.w - h, y: card.y + Math.floor((card.h - h) / 2), w: h, h };
  const lines = kind === 'prompt' ? 1 : 2;
  const textY = card.y + Math.floor((card.h - (lines * LINE - 4)) / 2);
  if (kind === 'ios') return { textX: card.x, textY, button: null, dismiss };
  const w = buttonWidth(MENU_TEXT.install, m);
  return { textX: card.x, textY, button: { x: dismiss.x - CARD_GAP - w, y: card.y, w, h }, dismiss };
}

function noButtons(): MenuButtons {
  return { reload: null, install: null, dismiss: null, toTitle: null, next: null, logo: null };
}

/** The notice cards a screen offers, as column blocks (droppable from `installDrop` on). */
function noticeBlocks(input: MenuInput, m: UiMetrics, installDrop?: number): Block[] {
  const blocks: Block[] = [];
  if (input.reload) blocks.push({ id: 'reload', ...reloadCardSize(m, input.touch), gap: 4 });
  if (input.install) blocks.push({ id: 'install', ...installCardSize(input.install, m), gap: 3, drop: installDrop });
  return blocks;
}

/** Fills the buttons from the placed cards. */
function cardButtons(input: MenuInput, m: UiMetrics, blocks: Map<string, Rect>, buttons: MenuButtons): void {
  const reload = blocks.get('reload');
  if (reload) buttons.reload = reloadParts(reload, m, input.touch).button;
  const install = blocks.get('install');
  if (install && input.install) {
    const parts = installParts(install, input.install, m);
    buttons.install = parts.button;
    buttons.dismiss = parts.dismiss;
  }
  buttons.toTitle = blocks.get('toTitle') ?? null;
}

/** Lowest y of the HUD button row and the x where it starts, for this screen. */
function hudBand(input: MenuInput, m: UiMetrics, riding: boolean): { bottom: number; left: number } {
  const h = hudButtons(input.viewWidth, input.fullscreenAvailable, m, riding);
  const row = [h.pause, h.mute, h.fullscreen].filter((r): r is Rect => !!r && (riding || r !== h.pause));
  return { bottom: Math.max(...row.map((r) => r.y + r.h)), left: Math.min(...row.map((r) => r.x)) };
}

/** A scale-2 headline at HEADLINE_Y, centred unless that runs under the HUD buttons. */
function headline(text: string, input: MenuInput, hudLeft: number): Rect {
  const w = measureText(text, 2);
  const cx = fitCentred(w, input.viewWidth, hudLeft);
  return { x: cx - Math.ceil(w / 2), y: HEADLINE_Y, w, h: 14 };
}

function bounds(input: MenuInput, top: number): ColumnBounds {
  return { top, bottom: BOTTOM, centre: centreX(input.viewWidth), maxWidth: input.viewWidth - 8 };
}

/** Pause and game over: like bounds, but keeping the skater clear outside portrait. */
function skaterBounds(input: MenuInput, top: number): ColumnBounds {
  return { ...bounds(input, top), clear: input.portrait ? undefined : SKATER_CLEAR };
}

/** The title under the logo: tagline, start prompt, controls help, notices, records. */
export function titleLayout(input: MenuInput): MenuLayout {
  const m = uiMetrics(input);
  const row = (id: string, gap: number, drop?: number, lines = 1): Block => ({ id, w: TITLE_PANEL_W - 8, h: lines * LINE, gap, drop });
  const tagline = row('tagline', 3, 2);
  const prompt: Block = { id: 'prompt', w: measureText(startPrompt(input.touch)), h: LINE, gap: 2 };
  const tail = [...noticeBlocks(input, m), row('records', 3, 3)];
  const column = { ...bounds(input, TITLE_PANEL_Y), bottom: BOTTOM - PANEL_PAD, maxWidth: input.viewWidth - 2 * PANEL_PAD - 4 };
  const help = [row('help', 3, 4, 5), ...(input.touch ? [] : [row('keys', 1, 5)])];
  let placed = fitColumn([tagline, prompt, ...help, ...tail], column);
  if (!placed.has('help')) placed = condensedTitle([tagline, prompt], tail, input, column);
  const buttons = noButtons();
  cardButtons(input, m, placed, buttons);
  return { blocks: placed, buttons, panel: titlePanel(input.viewWidth, [...placed.values()]) };
}

/**
 * The title when notices push the full help out: the one-line controls under
 * the prompt, or beside it when its own line would cost another row.
 */
function condensedTitle(head: Block[], tail: Block[], input: MenuInput, column: ColumnBounds): Map<string, Rect> {
  const line: Block = { id: 'controls', w: measureText(controlsLine(input.touch)), h: LINE, gap: 0 };
  const below = fitColumn([...head, line, ...tail], column);
  const beside = fitColumn([...head, { ...line, inline: true }, ...tail], column);
  const fits = Math.max(...[...below.values()].map((r) => r.y + r.h)) <= column.bottom;
  return fits && [...beside.keys()].every((id) => below.has(id)) ? below : beside;
}

/** The opaque plate behind the title's rows: centred, PANEL_PAD around them (none above, it meets the logo). */
function titlePanel(viewWidth: number, rows: Rect[]): Rect {
  const cx = centreX(viewWidth);
  const half = Math.max(TITLE_PANEL_W / 2, ...rows.map((r) => Math.max(cx - r.x, r.x + r.w - cx) + PANEL_PAD));
  const bottom = Math.max(...rows.map((r) => r.y + r.h)) + PANEL_PAD;
  return { x: cx - half, y: TITLE_PANEL_Y, w: 2 * half, h: bottom - TITLE_PANEL_Y };
}

/** "Zum Startbildschirm" and, beside it when there is room, the reload card. */
function navBlocks(input: MenuInput, m: UiMetrics, gap: number): Block[] {
  const nav: Block = { id: 'toTitle', w: buttonWidth(toTitleLabel(input.touch), m), h: m.menuButtonH, gap };
  if (!input.reload) return [nav];
  return [nav, { id: 'reload', ...reloadCardSize(m, input.touch), gap: 2, inline: true }];
}

/** Pause: the logo (long press = settings) left of the HUD buttons, "Pause", the resume prompt, hints, buttons. */
export function pauseLayout(input: MenuInput): MenuLayout {
  const m = uiMetrics(input);
  const hud = hudBand(input, m, true);
  const logo = logoRect(input.viewWidth);
  logo.x = fitCentred(logo.w, input.viewWidth, hud.left) - Math.floor(logo.w / 2);
  const text = (id: string, s: string, gap: number, drop?: number): Block => ({ id, w: measureText(s), h: LINE, gap, drop });
  const blocks: Block[] = [
    { id: 'pause', w: measureText(MENU_TEXT.pause, 2), h: 14, gap: 2, drop: 1 },
    { id: 'prompt', w: measureText(pausePrompt(input.touch)) + 16, h: 15, gap: 4 },
  ];
  if (!input.touch) blocks.push(text('keys', PAUSE_KEYS, 3, 2));
  blocks.push(text('trick', trickKeysHint(input.touch), input.touch ? 3 : 0, 2), ...navBlocks(input, m, 4));
  const placed = fitColumn(blocks, skaterBounds(input, Math.max(logo.y + logo.h, hud.bottom)));
  const buttons = noButtons();
  buttons.logo = logo;
  cardButtons(input, m, placed, buttons);
  return { blocks: placed, buttons, panel: null };
}

/** Game over: headline, new record, results, prompt, install hint, "Zum Startbildschirm" and reload. */
export function gameOverLayout(input: MenuInput & { newRecord: boolean }): MenuLayout {
  const m = uiMetrics(input);
  const hud = hudBand(input, m, false);
  const title = headline(MENU_TEXT.gameOver, input, hud.left);
  const blocks: Block[] = [];
  if (input.newRecord) blocks.push({ id: 'record', w: measureText(MENU_TEXT.newRecord, 2), h: 14, gap: 4, drop: 1 });
  RESULT_ROWS.forEach((_, i) => {
    blocks.push({ id: `row${i}`, w: TABLE_W, h: LINE, gap: i === 0 ? 8 : 0, drop: RESULT_ROW_DROP[i] });
  });
  blocks.push({ id: 'prompt', w: measureText(gameOverPrompt(input.touch)), h: LINE, gap: 6 });
  if (!input.touch) blocks.push({ id: 'keys', w: measureText(GAMEOVER_KEYS), h: LINE, gap: 2, drop: 3 });
  blocks.push(...noticeBlocks({ ...input, reload: false }, m, INSTALL_DROP_GAMEOVER), ...navBlocks(input, m, 4));
  const placed = fitColumn(blocks, skaterBounds(input, Math.max(title.y + title.h, hud.bottom)));
  placed.set('title', title);
  const buttons = noButtons();
  cardButtons(input, m, placed, buttons);
  return { blocks: placed, buttons, panel: null };
}

/** "Neu in dieser Version": headline, one bullet line per item, "Weiter". */
export function whatsNewLayout(input: MenuInput, lines: readonly string[]): MenuLayout {
  const m = uiMetrics(input);
  const hud = hudBand(input, m, false);
  const title = headline(MENU_TEXT.whatsNew, input, hud.left);
  const blocks: Block[] = lines.map((s, i) => ({ id: `line${i}`, w: BULLET_W + measureText(s), h: LINE, gap: i === 0 ? 8 : 0 }));
  blocks.push({ id: 'next', w: Math.max(buttonWidth(MENU_TEXT.next, m), 80), h: m.menuButtonH, gap: 10 });
  const placed = fitColumn(blocks, bounds(input, Math.max(title.y + title.h, hud.bottom)));
  placed.set('title', title);
  const buttons = noButtons();
  buttons.next = placed.get('next') ?? null;
  const items = lines.map((_, i) => placed.get(`line${i}`)!).filter(Boolean);
  const w = Math.max(...items.map((r) => r.w)) + 12;
  const panel = items.length
    ? { x: centreX(input.viewWidth) - Math.floor(w / 2), y: items[0]!.y - 4, w, h: items.length * LINE + 4 }
    : null;
  return { blocks: placed, buttons, panel };
}

/** Bullet square and space before each "Neu in dieser Version" line. */
export const BULLET_W = 6;
