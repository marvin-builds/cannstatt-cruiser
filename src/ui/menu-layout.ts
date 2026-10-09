/**
 * Layout of the menu screens (title, pause, game over, "Neu in dieser
 * Version") with their buttons: reload ("Neue Version da"), the install hint,
 * "Startbildschirm", "Weiter" and the pause logo. One pure function per
 * screen, used by both the hotspots (index.ts) and the drawing
 * (menu-screens.ts), so what is drawn is what can be tapped. Optional text
 * rows give way when the buttons need the room (fitColumn), nothing
 * overlaps the HUD button row, and pause and game over keep the skater
 * visible outside portrait. "Startbildschirm" ends the run, so it is a small
 * corner button at the left under the stats plate, away from where a thumb
 * taps to ride on or start a new run.
 */
import { GROUND_Y, PLAYER_X, VIEW_H } from '../core/config';
import { measureText } from '../core/font';
import type { Rect } from '../types';
import { ARROW_RIGHT, HEART_ICON, SHARE_ICON } from './art';
import { type Block, type ColumnBounds, fitColumn } from './column';
import { centreX, fitCentred, hudButtons, type UiMetrics, uiMetrics } from './layout';
import { LOGO_Y, logoRect } from './logo';
import type { InstallHintKind } from './notices';
import { statsLayout } from './stats';

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
  /** The HUD stats plate as drawn now (pause), which the logo keeps clear of. */
  plate?: Rect | null;
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

/**
 * How the install hint card shows: the full 'prompt' or 'ios' card, or
 * 'compact' (game over): just "App installieren" and "×".
 */
export type InstallCard = InstallHintKind | 'compact';

export interface MenuLayout {
  /** Every visible block by id (text rows, cards, buttons), dropped optional rows are missing. */
  blocks: Map<string, Rect>;
  /** The install card placed as block 'install', or null. */
  install: InstallCard | null;
  buttons: MenuButtons;
  /** Opaque plate behind the screen's text, or null. */
  panel: Rect | null;
  /** Font scale of the body text rows (prompt, hints): 2 in portrait where it fits. */
  textScale: number;
}

/** All texts of the menu screens (German, game font). */
export const MENU_TEXT = {
  reload: 'Neue Version da',
  installReason: 'Als App: Vollbild und offline',
  iosShare: 'Teilen',
  iosHome: 'Zum Home-Bildschirm',
  install: 'Installieren',
  installApp: 'App installieren',
  whatsNew: 'Neu in dieser Version',
  next: 'Weiter',
  pause: 'Pause',
  gameOver: 'Sturz! Runde vorbei',
  newRecord: 'Neuer Rekord!',
  restartNote: 'Lauf wird neu gestartet',
} as const;

/** Labels that show their key on desktop. */
export const reloadLabel = (touch: boolean) => (touch ? 'Neu laden' : 'Neu laden (U)');
/** "Startbildschirm": T on desktop, and Esc where Esc leads there too (game over). */
export const toTitleLabel = (touch: boolean, escape = false) =>
  touch ? 'Startbildschirm' : escape ? 'Startbildschirm (T/Esc)' : 'Startbildschirm (T)';

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

/** The title's controls help, one line each. */
export function titleHelp(touch: boolean): string[] {
  return [
    touch ? 'Kurz tippen = kleiner Sprung' : 'Leertaste kurz = kleiner Sprung',
    'Halten = hoher Sprung',
    touch ? 'Runterwischen = ducken' : 'Pfeil runter oder S = ducken',
    trickKeysHint(touch),
    touch ? 'In der Luft runterwischen = Kickflip' : 'In der Luft Pfeil runter = Kickflip',
    touch ? 'Knopf antippen = Gegenstand benutzen' : 'E = Gegenstand benutzen',
  ];
}

/** The chip in the title's top-left corner while kid mode is on. */
export const KID_CHIP_LABEL = 'Kindermodus';
const KID_CHIP_PAD = 3;
/** Space between the chip's heart and its label. */
export const KID_CHIP_GAP = 3;

/** The kid mode chip: a heart and "Kindermodus" on a plate in the top-left corner (the HUD buttons are top right). */
export function kidChipRect(): Rect {
  return { x: 2, y: 2, w: 2 * KID_CHIP_PAD + HEART_ICON.width + KID_CHIP_GAP + measureText(KID_CHIP_LABEL), h: 11 };
}

/** Rows of the game-over results table (labels; values come from the run). */
export const RESULT_ROWS = ['Punkte', 'Highscore', 'Sterne', 'Sterne gesamt', 'Strecke'] as const;

/**
 * Results rows that give way to buttons: the stars total first, then (after
 * the record line and the install hint) stars and distance, the highscore
 * last; the score stays.
 */
const RESULT_ROW_DROP = [undefined, 0.25, 0.5, 2, 0.5];
/** On a crowded game over the (compact) install hint goes before stars and distance (the title still shows it). */
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
export const TITLE_PANEL_Y = 64;
const TITLE_PANEL_W = 236;
/** Space between the title panel's edges and its rows and buttons, on all four sides. */
export const PANEL_PAD = 4;
/**
 * Where the skater rides (and its board meets the ground) in pause and game
 * over: no text or button covers it outside portrait.
 */
export const SKATER_CLEAR: Rect = { x: PLAYER_X - 16, y: GROUND_Y - 36, w: 32, h: 40 };
/** Results table rows are this wide at most (label and value split at the centre). */
const TABLE_W = 140;
const BOTTOM = VIEW_H - 2;
/** Top of a screen's headline (game over, what's new). */
const HEADLINE_Y = 10;
/** The HUD stats plate at its tallest (both timer rows): "Startbildschirm" sits under it. */
const TALLEST_PLATE = statsLayout(0, true, true).plate;
/** Space between the stats plate and the "Startbildschirm" button, and around the pause logo. */
const CORNER_GAP = 4;
/** Height of a body text row at font scale 1 and 2. */
const textRowH = (scale: number) => (scale === 2 ? 17 : LINE);
/** The pause prompt's ribbon: text and 4 px above and below. */
export const promptRibbonH = (scale: number) => 7 * scale + 8;

/** Label scale of a menu button: 2 once it is touch-sized. */
export function buttonLabelScale(m: UiMetrics): number {
  return m.menuButtonH >= 24 ? 2 : 1;
}

/** Visible height of the "Startbildschirm" plate at most: in portrait it sits centred in its taller (44 px) tap area. */
const CORNER_PLATE_H = 24;

function buttonWidth(label: string, m: UiMetrics, scale = buttonLabelScale(m)): number {
  return Math.max(m.menuButtonH, measureText(label, scale) + 2 * BUTTON_PAD);
}

/**
 * "Startbildschirm" on pause and game over: a small button in the top-left
 * corner, where the stats plate is during a run (pause: under the plate at
 * its tallest), as tall as a menu button (a 44 CSS px tap area on phones),
 * with the small label font everywhere, away from where a thumb taps to go on.
 * This is its tap area; toTitlePlate is what is drawn.
 */
export function toTitleButton(input: MenuInput, m: UiMetrics, screen: 'pause' | 'gameOver'): Rect {
  const w = buttonWidth(toTitleLabel(input.touch, screen === 'gameOver'), m, 1);
  const y = screen === 'pause' ? TALLEST_PLATE.y + TALLEST_PLATE.h + CORNER_GAP : TALLEST_PLATE.y;
  return { x: TALLEST_PLATE.x, y, w, h: m.menuButtonH };
}

/** The visible "Startbildschirm" plate: its tap area, at most CORNER_PLATE_H high and vertically centred in it. */
export function toTitlePlate(tap: Rect): Rect {
  const h = Math.min(tap.h, CORNER_PLATE_H);
  return { ...tap, y: tap.y + Math.floor((tap.h - h) / 2), h };
}

const IOS_STEPS_W = measureText(MENU_TEXT.iosShare) + SHARE_ICON.width + ARROW_RIGHT.width + measureText(MENU_TEXT.iosHome) + 3 * STEP_GAP;

function reloadCardSize(m: UiMetrics, touch: boolean): { w: number; h: number } {
  return { w: measureText(MENU_TEXT.reload) + CARD_GAP + buttonWidth(reloadLabel(touch), m), h: m.menuButtonH };
}

function installCardSize(kind: InstallCard, m: UiMetrics): { w: number; h: number } {
  const dismiss = m.menuButtonH;
  if (kind === 'compact') return { w: buttonWidth(MENU_TEXT.installApp, m) + CARD_GAP + dismiss, h: m.menuButtonH };
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

/**
 * The install card: reason (and iOS steps) at the left, "Installieren"
 * (prompt only) and "×" at the right; compact: "App installieren" fills the
 * card left of the "×" and there is no text.
 */
export function installParts(
  card: Rect,
  kind: InstallCard,
  m: UiMetrics,
): { textX: number; textY: number; button: Rect | null; dismiss: Rect } {
  const h = m.menuButtonH;
  const dismiss: Rect = { x: card.x + card.w - h, y: card.y + Math.floor((card.h - h) / 2), w: h, h };
  if (kind === 'compact') return { textX: card.x, textY: card.y, button: { x: card.x, y: card.y, w: dismiss.x - CARD_GAP - card.x, h }, dismiss };
  const lines = kind === 'prompt' ? 1 : 2;
  const textY = card.y + Math.floor((card.h - (lines * LINE - 4)) / 2);
  if (kind === 'ios') return { textX: card.x, textY, button: null, dismiss };
  const w = buttonWidth(MENU_TEXT.install, m);
  return { textX: card.x, textY, button: { x: dismiss.x - CARD_GAP - w, y: card.y, w, h }, dismiss };
}

function noButtons(): MenuButtons {
  return { reload: null, install: null, dismiss: null, toTitle: null, next: null, logo: null };
}

/** The install card for the input: compacted where asked (only the prompt kind has a short form). */
function installCard(input: MenuInput, compact: boolean): InstallCard | null {
  return compact && input.install === 'prompt' ? 'compact' : input.install;
}

/** The notice cards a screen offers, as column blocks (the install card droppable from `installDrop` on). */
function noticeBlocks(input: MenuInput, m: UiMetrics, install: InstallCard | null, installDrop?: number): Block[] {
  const blocks: Block[] = [];
  if (input.reload) blocks.push({ id: 'reload', ...reloadCardSize(m, input.touch), gap: 4 });
  if (install) blocks.push({ id: 'install', ...installCardSize(install, m), gap: 3, drop: installDrop });
  return blocks;
}

/** The screen's layout from the placed blocks: buttons filled from the cards, `install` = the card kind if it was placed. */
function withCards(input: MenuInput, m: UiMetrics, placed: Map<string, Rect>, install: InstallCard | null, panel: Rect | null = null): MenuLayout {
  const buttons = noButtons();
  const reload = placed.get('reload');
  if (reload) buttons.reload = reloadParts(reload, m, input.touch).button;
  const card = placed.get('install');
  const shown = card && install ? install : null;
  if (card && shown) {
    const parts = installParts(card, shown, m);
    buttons.install = parts.button;
    buttons.dismiss = parts.dismiss;
  }
  return { blocks: placed, buttons, install: shown, panel, textScale: 1 };
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

/**
 * The headline beside the corner button: between it and the HUD buttons, as
 * centred as that allows; where it does not fit there (portrait), centred
 * under both.
 */
function headlineBeside(text: string, input: MenuInput, hud: { bottom: number; left: number }, corner: Rect): Rect {
  const r = headline(text, input, hud.left);
  const left = corner.x + corner.w + CORNER_GAP;
  const right = hud.left - 2;
  if (right - left >= r.w) return { ...r, x: Math.min(Math.max(r.x, left), right - r.w) };
  return { ...r, x: centreX(input.viewWidth) - Math.ceil(r.w / 2), y: Math.max(hud.bottom, corner.y + corner.h) + 2 };
}

function bounds(input: MenuInput, top: number): ColumnBounds {
  return { top, bottom: BOTTOM, centre: centreX(input.viewWidth), maxWidth: input.viewWidth - 8 };
}

/** Pause and game over: like bounds, keeping the corner button and (outside portrait) the skater clear. */
function skaterBounds(input: MenuInput, top: number, corner: Rect): ColumnBounds {
  return { ...bounds(input, top), clear: input.portrait ? [corner] : [corner, SKATER_CLEAR] };
}

/**
 * The column of a pause or game-over screen, its body text in the big font
 * in portrait where that keeps every block the small font keeps, within the
 * bounds; returns the placed blocks and the text scale used.
 */
function fitBody(input: MenuInput, blocks: (scale: number) => Block[], column: ColumnBounds): { placed: Map<string, Rect>; scale: number } {
  const small = fitColumn(blocks(1), column);
  if (!input.portrait) return { placed: small, scale: 1 };
  const big = fitColumn(blocks(2), column);
  const bottom = Math.max(...[...big.values()].map((r) => r.y + r.h));
  const fits = bottom <= column.bottom && [...small.keys()].every((id) => big.has(id));
  return fits ? { placed: big, scale: 2 } : { placed: small, scale: 1 };
}

/** The title under the logo: tagline, start prompt, controls help, notices, records. */
export function titleLayout(input: MenuInput): MenuLayout {
  const m = uiMetrics(input);
  const row = (id: string, gap: number, drop?: number, lines = 1): Block => ({ id, w: TITLE_PANEL_W - 8, h: lines * LINE, gap, drop });
  // Every first row (the tagline, or the prompt once the tagline gave way) has a gap of 2. The tagline gives way first.
  const tagline = row('tagline', 2, 6);
  const prompt: Block = { id: 'prompt', w: measureText(startPrompt(input.touch)), h: LINE, gap: 2 };
  const install = installCard(input, false);
  const tail = [...noticeBlocks(input, m, install), row('records', 3, 3)];
  const column = { ...bounds(input, TITLE_PANEL_Y + PANEL_PAD - 2), bottom: VIEW_H - 2 - PANEL_PAD, maxWidth: input.viewWidth - 2 * PANEL_PAD - 4 };
  const help = [row('help', 3, 4, titleHelp(input.touch).length), ...(input.touch ? [] : [row('keys', 1, 5)])];
  let placed = fitColumn([tagline, prompt, ...help, ...tail], column);
  if (!placed.has('help')) placed = condensedTitle([tagline, prompt], tail, input, column);
  return withCards(input, m, placed, install, titlePanel(input.viewWidth, [...placed.values()]));
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

/** The opaque plate behind the title's rows: centred, PANEL_PAD around them, its top at TITLE_PANEL_Y. */
function titlePanel(viewWidth: number, rows: Rect[]): Rect {
  const cx = centreX(viewWidth);
  const half = Math.max(TITLE_PANEL_W / 2, ...rows.map((r) => Math.max(cx - r.x, r.x + r.w - cx) + PANEL_PAD));
  const bottom = Math.max(...rows.map((r) => r.y + r.h)) + PANEL_PAD;
  return { x: cx - half, y: TITLE_PANEL_Y, w: 2 * half, h: bottom - TITLE_PANEL_Y };
}

/** The reload card as a column block. */
function reloadBlock(input: MenuInput, m: UiMetrics): Block[] {
  return input.reload ? [{ id: 'reload', ...reloadCardSize(m, input.touch), gap: 4 }] : [];
}

/**
 * The pause logo (long press = settings): at the top, centred left of the
 * HUD buttons and right of the stats plate; where that leaves no room
 * (portrait) under the HUD buttons, right of the "Startbildschirm" button.
 */
function pauseLogo(input: MenuInput, hud: { bottom: number; left: number }, corner: Rect): Rect {
  const logo = logoRect(input.viewWidth);
  const plate = input.plate;
  const left = plate ? plate.x + plate.w + CORNER_GAP : 2;
  const right = hud.left - 2;
  const centred = fitCentred(logo.w, input.viewWidth, hud.left) - Math.floor(logo.w / 2);
  if (right - left >= logo.w) return { ...logo, x: Math.min(Math.max(centred, left), right - logo.w), y: LOGO_Y };
  const y = hud.bottom + 2;
  const besidePlate = plate && plate.y + plate.h > y ? plate.x + plate.w + CORNER_GAP : 0;
  const x = Math.max(centreX(input.viewWidth) - Math.floor(logo.w / 2), corner.x + corner.w + CORNER_GAP, besidePlate);
  return { ...logo, x: Math.min(x, input.viewWidth - 2 - logo.w), y };
}

/** Pause: the logo (long press = settings), "Pause", the resume prompt, hints, reload; "Startbildschirm" in the corner. */
export function pauseLayout(input: MenuInput): MenuLayout {
  const m = uiMetrics(input);
  const hud = hudBand(input, m, true);
  const corner = toTitleButton(input, m, 'pause');
  const logo = pauseLogo(input, hud, corner);
  const text = (id: string, s: string, gap: number, scale: number, drop?: number): Block => ({
    id,
    w: measureText(s, scale),
    h: textRowH(scale),
    gap,
    drop,
  });
  const blocks = (scale: number): Block[] => [
    { id: 'pause', w: measureText(MENU_TEXT.pause, 2), h: 14, gap: 2, drop: 1 },
    { id: 'prompt', w: measureText(pausePrompt(input.touch), scale) + 16, h: promptRibbonH(scale), gap: 4 },
    ...(input.touch ? [] : [text('keys', PAUSE_KEYS, 3, scale, 2)]),
    text('trick', trickKeysHint(input.touch), input.touch ? 3 : 0, scale, 2),
    ...reloadBlock(input, m),
  ];
  // Portrait: the column starts under the corner button, so the body text has the width for the big font.
  const top = Math.max(logo.y + logo.h, hud.bottom, input.portrait ? corner.y + corner.h : 0);
  const { placed, scale } = fitBody(input, blocks, skaterBounds(input, top, corner));
  const layout = withCards(input, m, placed, null);
  layout.buttons.logo = logo;
  layout.buttons.toTitle = corner;
  layout.textScale = scale;
  return layout;
}

/** Game over: headline, new record, results, prompt, install hint, reload; "Startbildschirm" in the corner. */
export function gameOverLayout(input: MenuInput & { newRecord: boolean }): MenuLayout {
  const m = uiMetrics(input);
  const hud = hudBand(input, m, false);
  const corner = toTitleButton(input, m, 'gameOver');
  const title = headlineBeside(MENU_TEXT.gameOver, input, hud, corner);
  const install = installCard(input, true);
  const blocks = (scale: number): Block[] => {
    const list: Block[] = [];
    if (input.newRecord) list.push({ id: 'record', w: measureText(MENU_TEXT.newRecord, 2), h: 14, gap: 4, drop: 1 });
    RESULT_ROWS.forEach((_, i) => {
      list.push({ id: `row${i}`, w: TABLE_W, h: LINE, gap: i === 0 ? 8 : 0, drop: RESULT_ROW_DROP[i] });
    });
    list.push({ id: 'prompt', w: measureText(gameOverPrompt(input.touch), scale), h: textRowH(scale), gap: 6 });
    list.push(...noticeBlocks({ ...input, reload: false }, m, install, INSTALL_DROP_GAMEOVER), ...reloadBlock(input, m));
    return list;
  };
  const { placed, scale } = fitBody(input, blocks, skaterBounds(input, Math.max(title.y + title.h, hud.bottom), corner));
  placed.set('title', title);
  const layout = withCards(input, m, placed, install);
  layout.buttons.toTitle = corner;
  layout.textScale = scale;
  return layout;
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
  return { blocks: placed, buttons, install: null, panel, textScale: 1 };
}

/** Bullet square and space before each "Neu in dieser Version" line. */
export const BULLET_W = 6;
