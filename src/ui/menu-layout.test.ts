import { describe, expect, it } from 'vitest';
import { VIEW_H } from '../core/config';
import type { Rect } from '../types';
import { centreX, hudButtons, uiMetrics } from './layout';
import { logoRect } from './logo';
import { statsLayout } from './stats';
import {
  gameOverLayout,
  installParts,
  type MenuInput,
  type MenuLayout,
  PANEL_PAD,
  pauseLayout,
  reloadParts,
  SKATER_CLEAR,
  titleHelp,
  titleLayout,
  toTitleLabel,
  toTitlePlate,
  whatsNewLayout,
} from './menu-layout';
import type { InstallHintKind } from './notices';

interface Variant {
  name: string;
  touch: boolean;
  portrait: boolean;
  widths: number[];
}

const VARIANTS: Variant[] = [
  { name: 'desktop', touch: false, portrait: false, widths: [320, 360, 384, 427] },
  { name: 'phone landscape', touch: true, portrait: false, widths: [320, 384, 422, 427] },
  { name: 'phone portrait', touch: true, portrait: true, widths: [320, 360, 384, 390, 427] },
];

function* inputs(): Generator<MenuInput & { label: string }> {
  for (const v of VARIANTS) {
    for (const viewWidth of v.widths) {
      for (const fullscreenAvailable of [true, false]) {
        for (const reload of [false, true]) {
          const installs: (InstallHintKind | null)[] = v.touch ? [null, 'prompt', 'ios'] : [null];
          for (const install of installs) {
            const label = `${v.name} ${viewWidth} fs=${fullscreenAvailable} reload=${reload} install=${install}`;
            yield { label, viewWidth, touch: v.touch, portrait: v.portrait, fullscreenAvailable, reload, install };
          }
        }
      }
    }
  }
}

const overlap = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (r: Rect, w: number) => r.x >= 0 && r.y >= 0 && r.x + r.w <= w && r.y + r.h <= VIEW_H;

/** Every tap area of a screen: the buttons and the pause logo. */
function buttons(l: MenuLayout): Rect[] {
  const b = l.buttons;
  return [b.reload, b.install, b.dismiss, b.toTitle, b.next, b.logo, b.submit].filter((r): r is Rect => !!r);
}

function hud(input: MenuInput, riding: boolean): Rect[] {
  const h = hudButtons(input.viewWidth, input.fullscreenAvailable, uiMetrics(input), riding);
  return [...(riding ? [h.pause] : []), h.mute, ...(h.fullscreen ? [h.fullscreen] : [])];
}

function checkScreen(input: MenuInput & { label: string }, l: MenuLayout, riding: boolean, extra: Rect[] = []): void {
  const m = uiMetrics(input);
  const rects = [...l.blocks.values(), ...extra];
  for (const r of [...rects, ...buttons(l)]) expect(inside(r, input.viewWidth), `${input.label}: ${JSON.stringify(r)} inside`).toBe(true);
  for (const r of rects) {
    for (const b of hud(input, riding)) expect(overlap(r, b), `${input.label}: ${JSON.stringify(r)} clear of the HUD`).toBe(false);
  }
  const blocks = [...l.blocks.entries()];
  blocks.forEach(([id, a], i) => {
    for (const [other, b] of blocks.slice(i + 1)) expect(overlap(a, b), `${input.label}: ${id} vs ${other}`).toBe(false);
    for (const e of extra) expect(overlap(a, e), `${input.label}: ${id} vs logo`).toBe(false);
  });
  const nav = l.buttons.toTitle;
  if (nav) for (const [id, r] of [...l.blocks.entries(), ...extra.map((e) => ['logo', e] as const)]) {
    expect(overlap(nav, r), `${input.label}: Startbildschirm vs ${id}`).toBe(false);
  }
  const taps = buttons(l);
  taps.forEach((a, i) => {
    for (const b of taps.slice(i + 1)) expect(overlap(a, b), `${input.label}: buttons overlap`).toBe(false);
    for (const b of hud(input, riding)) expect(overlap(a, b), `${input.label}: button vs HUD`).toBe(false);
    if (input.touch && a !== l.buttons.logo) {
      expect(a.h, `${input.label}: tap height`).toBeGreaterThanOrEqual(m.menuButtonH);
      expect(a.w, `${input.label}: tap width`).toBeGreaterThanOrEqual(m.menuButtonH);
    }
  });
}

describe('menu screen layouts', () => {
  it('title: notices fit with the logo, clear of the HUD buttons, all variants', () => {
    for (const input of inputs()) {
      const l = titleLayout(input);
      checkScreen(input, l, false, [logoRect(input.viewWidth)]);
      expect(!!l.buttons.reload, input.label).toBe(input.reload);
      expect(!!l.buttons.dismiss, input.label).toBe(!!input.install);
      expect(!!l.buttons.install, input.label).toBe(input.install === 'prompt');
      expect(l.buttons.toTitle).toBeNull();
      expect(l.blocks.has('prompt'), input.label).toBe(true);
    }
  });

  it('title: the panel pads every row and button on all four sides', () => {
    for (const input of inputs()) {
      const l = titleLayout(input);
      const p = l.panel!;
      for (const [id, r] of [...l.blocks.entries(), ...buttons(l).map((b) => ['button', b] as const)]) {
        const at = `${input.label}: ${id} ${JSON.stringify(r)} in ${JSON.stringify(p)}`;
        expect(r.x - p.x, at).toBeGreaterThanOrEqual(PANEL_PAD);
        expect(p.x + p.w - (r.x + r.w), at).toBeGreaterThanOrEqual(PANEL_PAD);
        expect(p.y + p.h - (r.y + r.h), at).toBeGreaterThanOrEqual(PANEL_PAD);
        expect(r.y - p.y, at).toBeGreaterThanOrEqual(PANEL_PAD);
      }
      expect(inside(p, input.viewWidth), `${input.label}: panel inside`).toBe(true);
    }
  });

  it('title: the panel keeps clear of the logo and of the view bottom', () => {
    for (const input of inputs()) {
      const p = titleLayout(input).panel!;
      const logo = logoRect(input.viewWidth);
      expect(p.y, `${input.label}: below the logo`).toBeGreaterThanOrEqual(logo.y + logo.h);
      expect(VIEW_H - (p.y + p.h), `${input.label}: ${JSON.stringify(p)} off the bottom`).toBeGreaterThanOrEqual(2);
    }
  });

  it('title: notices never take all the control help, a condensed line stays', () => {
    for (const input of inputs()) {
      const l = titleLayout(input);
      const help = l.blocks.has('help');
      const controls = l.blocks.has('controls');
      expect(help !== controls, `${input.label}: full help xor the condensed line`).toBe(true);
      if (input.reload || input.install) continue;
      expect(help, `${input.label}: no notices, full help`).toBe(true);
    }
  });

  it('pause and game over keep the skater and its ground clear on desktop and phone landscape', () => {
    for (const input of inputs()) {
      if (input.portrait) continue;
      const screens = [
        ['pause', pauseLayout({ ...input, install: null })],
        ['game over', gameOverLayout({ ...input, newRecord: false })],
        ['game over record', gameOverLayout({ ...input, newRecord: true })],
      ] as const;
      for (const [name, l] of screens) {
        for (const [id, r] of l.blocks) {
          expect(overlap(r, SKATER_CLEAR), `${input.label} ${name}: ${id} ${JSON.stringify(r)} covers the skater`).toBe(false);
        }
      }
    }
  });

  it('title without notices keeps the full help', () => {
    for (const input of inputs()) {
      if (input.reload || input.install) continue;
      const l = titleLayout(input);
      expect(l.blocks.has('help'), input.label).toBe(true);
      expect(l.blocks.has('records'), input.label).toBe(true);
    }
  });

  it('pause: the logo, "Startbildschirm" and the reload button fit, all variants', () => {
    for (const input of inputs()) {
      const l = pauseLayout({ ...input, install: null });
      checkScreen(input, l, true, [l.buttons.logo!]);
      expect(l.buttons.logo, input.label).not.toBeNull();
      expect(l.buttons.toTitle, input.label).not.toBeNull();
      expect(!!l.buttons.reload, input.label).toBe(input.reload);
      expect(l.blocks.has('prompt'), input.label).toBe(true);
      expect(l.buttons.logo!.w).toBe(logoRect(input.viewWidth).w);
    }
  });

  it('game over: results, "Startbildschirm", reload and install fit, all variants', () => {
    for (const input of inputs()) {
      for (const newRecord of [false, true]) {
        const l = gameOverLayout({ ...input, newRecord });
        checkScreen({ ...input, label: `${input.label} record=${newRecord}` }, l, false);
        expect(l.buttons.toTitle, input.label).not.toBeNull();
        expect(!!l.buttons.reload, input.label).toBe(input.reload);
        expect(l.blocks.has('title') && l.blocks.has('prompt') && l.blocks.has('row0'), input.label).toBe(true);
        // Portrait (44 px buttons) leaves the install hint to the title screen.
        if (!input.portrait) expect(!!l.buttons.dismiss, `${input.label} record=${newRecord}`).toBe(!!input.install);
      }
    }
  });

  it('game over: "Eintragen" fits with the results and the prompt when offered, all variants', () => {
    for (const input of inputs()) {
      for (const newRecord of [false, true]) {
        const label = `${input.label} record=${newRecord}`;
        const l = gameOverLayout({ ...input, newRecord, submit: true });
        checkScreen({ ...input, label }, l, false);
        const submit = l.buttons.submit;
        expect(submit, label).not.toBeNull();
        expect(l.blocks.get('submit'), label).toEqual(submit);
        expect(l.blocks.has('prompt') && l.blocks.has('row0'), label).toBe(true);
        expect(submit!.y, `${label}: under the score`).toBeGreaterThan(l.blocks.get('row0')!.y);
        expect(gameOverLayout({ ...input, newRecord }).buttons.submit, label).toBeNull();
      }
    }
  });

  it('pause and game over: "Startbildschirm" is a small top-left corner button (pause: under the stats plate), away from the centre', () => {
    const tallest = statsLayout(0, true, true).plate;
    for (const input of inputs()) {
      const m = uiMetrics(input);
      const screens = [
        ['pause', pauseLayout({ ...input, install: null })],
        ['game over', gameOverLayout({ ...input, newRecord: true })],
      ] as const;
      for (const [name, l] of screens) {
        const b = l.buttons.toTitle!;
        const at = `${input.label} ${name}: ${JSON.stringify(b)}`;
        expect(b.x, at).toBeLessThanOrEqual(4);
        if (name === 'pause') expect(b.y, `${at}: under the tallest stats plate`).toBeGreaterThanOrEqual(tallest.y + tallest.h);
        else expect(b.y, `${at}: in the corner`).toBeLessThanOrEqual(4);
        expect(b.x + b.w, `${at}: left of the centre`).toBeLessThan(centreX(input.viewWidth));
        expect(b.y + b.h, `${at}: in the upper part`).toBeLessThanOrEqual(VIEW_H * 0.62);
        expect(b.h, at).toBe(m.menuButtonH);
      }
    }
  });

  it('portrait: "Startbildschirm" is a compact corner button: a 44 px tap area, a small plate, well under a third of the view wide', () => {
    const tallest = statsLayout(0, true, true).plate;
    for (const input of inputs()) {
      if (!input.portrait) continue;
      const screens = [
        ['pause', pauseLayout({ ...input, install: null, plate: tallest })],
        ['game over', gameOverLayout({ ...input, newRecord: true })],
      ] as const;
      for (const [name, l] of screens) {
        const b = l.buttons.toTitle!;
        const at = `${input.label} ${name}: ${JSON.stringify(b)}`;
        expect(b.h, at).toBeGreaterThanOrEqual(44);
        expect(b.h, at).toBeLessThanOrEqual(66);
        expect(b.w, at).toBeLessThanOrEqual(input.viewWidth / 4);
        const plate = toTitlePlate(b);
        expect(plate.h, `${at}: plate`).toBeLessThanOrEqual(24);
        expect(plate.y >= b.y && plate.y + plate.h <= b.y + b.h, `${at}: plate in the tap area`).toBe(true);
        if (name === 'pause') expect(overlap(b, tallest), `${at}: clear of the stats plate`).toBe(false);
        for (const id of ['prompt', 'title', 'pause']) {
          const r = l.blocks.get(id);
          if (r) expect(overlap(b, r), `${at}: clear of ${id}`).toBe(false);
        }
      }
    }
  });

  it('the "Startbildschirm" plate fills its tap area outside portrait', () => {
    for (const input of inputs()) {
      if (input.portrait) continue;
      const b = gameOverLayout({ ...input, newRecord: false }).buttons.toTitle!;
      expect(toTitlePlate(b), input.label).toEqual(b);
    }
  });

  it('"Startbildschirm" is one label everywhere: T on desktop, Esc too on game over (where Esc already leads there)', () => {
    expect(toTitleLabel(true)).toBe('Startbildschirm');
    expect(toTitleLabel(true, true)).toBe('Startbildschirm');
    expect(toTitleLabel(false)).toBe('Startbildschirm (T)');
    expect(toTitleLabel(false, true)).toBe('Startbildschirm (T/Esc)');
    for (const input of inputs()) expect(gameOverLayout({ ...input, newRecord: false }).blocks.has('keys'), input.label).toBe(false);
  });

  it('pause: the logo never overlaps the HUD stats plate (small and big scores, combo, timer rows), also in portrait', () => {
    const plates = [statsLayout(40, false).plate, statsLayout(110, false).plate, statsLayout(110, true, true).plate];
    for (const input of inputs()) {
      for (const plate of plates) {
        const l = pauseLayout({ ...input, install: null, plate });
        const logo = l.buttons.logo!;
        const at = `${input.label} plate ${JSON.stringify(plate)}: logo ${JSON.stringify(logo)}`;
        expect(overlap(logo, plate), at).toBe(false);
        expect(inside(logo, input.viewWidth), at).toBe(true);
        checkScreen(input, l, true, [logo, plate]);
      }
    }
  });

  it('portrait: the menu body text uses the big font where it fits', () => {
    for (const input of inputs()) {
      const pause = pauseLayout({ ...input, install: null });
      const over = gameOverLayout({ ...input, newRecord: false });
      if (!input.portrait) {
        expect(pause.textScale, input.label).toBe(1);
        expect(over.textScale, input.label).toBe(1);
        continue;
      }
      if (!input.reload) expect(pause.textScale, input.label).toBe(2);
      if (!input.reload) expect(pauseLayout({ ...input, install: null, plate: statsLayout(60, false).plate }).textScale, input.label).toBe(2);
      if (!input.reload && !input.install) expect(over.textScale, input.label).toBe(2);
      for (const l of [pause, over]) {
        const prompt = l.blocks.get('prompt')!;
        expect(prompt.h, input.label).toBeGreaterThanOrEqual(l.textScale === 2 ? 14 : 7);
      }
    }
  });

  it('title: the help has a kickflip line and says "runterwischen" and "Knopf antippen"', () => {
    expect(titleHelp(true)).toContain('In der Luft runterwischen = Kickflip');
    expect(titleHelp(false)).toContain('In der Luft Pfeil runter = Kickflip');
    expect(titleHelp(true)).toContain('Knopf antippen = Gegenstand benutzen');
    for (const touch of [true, false]) for (const line of titleHelp(touch)) expect(line).not.toMatch(/Wisch runter|nach unten wischen/i);
  });

  it('game over keeps the score and highscore rows outside portrait, notices give way first', () => {
    for (const input of inputs()) {
      if (input.portrait) continue;
      for (const newRecord of [false, true]) {
        const l = gameOverLayout({ ...input, newRecord });
        const at = `${input.label} record=${newRecord}`;
        expect(l.blocks.has('row0') && l.blocks.has('row1'), `${at}: Punkte and Highscore`).toBe(true);
        if (input.reload) expect(!!l.buttons.reload, `${at}: reload`).toBe(true);
        if (newRecord && !input.install) expect(l.blocks.has('record'), `${at}: Neuer Rekord!`).toBe(true);
        // The install hint is compacted to "App installieren" + "×" instead of costing rows.
        if (l.blocks.has('install')) expect(l.install, at).toBe(input.install === 'prompt' ? 'compact' : input.install);
      }
    }
  });

  it('the title shows the install hint in full', () => {
    for (const input of inputs()) {
      const l = titleLayout(input);
      expect(l.install, input.label).toBe(l.blocks.has('install') ? input.install : null);
    }
  });

  it("what's new: title, up to six lines and Weiter fit, all variants", () => {
    const lines = Array.from({ length: 6 }, () => 'Gefangene Sachen benutzen (E / Knopf) xx');
    for (const input of inputs()) {
      const l = whatsNewLayout(input, lines);
      checkScreen(input, l, false);
      expect(l.buttons.next, input.label).not.toBeNull();
      for (let i = 0; i < 6; i++) expect(l.blocks.has(`line${i}`), input.label).toBe(true);
      expect(l.buttons.reload).toBeNull();
    }
  });
});

describe('notice cards', () => {
  it('the reload card puts its text left of the button, inside the card', () => {
    const m = uiMetrics({ touch: true, portrait: false });
    const card = titleLayout({ viewWidth: 320, touch: true, portrait: false, fullscreenAvailable: true, reload: true, install: null })
      .blocks.get('reload')!;
    const parts = reloadParts(card, m, true);
    expect(parts.button.x + parts.button.w).toBe(card.x + card.w);
    expect(parts.textX).toBe(card.x);
    expect(parts.button.h).toBe(m.menuButtonH);
  });

  it('the install card: a button only with a prompt, always the ×', () => {
    const input = { viewWidth: 320, touch: true, portrait: false, fullscreenAvailable: true, reload: false };
    const m = uiMetrics(input);
    const prompt = installParts(titleLayout({ ...input, install: 'prompt' }).blocks.get('install')!, 'prompt', m);
    expect(prompt.button).not.toBeNull();
    expect(prompt.dismiss.x).toBeGreaterThan(prompt.button!.x);
    const ios = installParts(titleLayout({ ...input, install: 'ios' }).blocks.get('install')!, 'ios', m);
    expect(ios.button).toBeNull();
    expect(ios.dismiss.w).toBe(m.menuButtonH);
  });

  it('the compact install card is just "App installieren" and the ×, inside the card', () => {
    const input = { viewWidth: 320, touch: true, portrait: false, fullscreenAvailable: true, reload: false, install: 'prompt' as const };
    const m = uiMetrics(input);
    const card = gameOverLayout({ ...input, newRecord: false }).blocks.get('install')!;
    const parts = installParts(card, 'compact', m);
    expect(parts.button!.x).toBe(card.x);
    expect(parts.dismiss.x + parts.dismiss.w).toBe(card.x + card.w);
    expect(overlap(parts.button!, parts.dismiss)).toBe(false);
    expect(card.w).toBeLessThan(titleLayout(input).blocks.get('install')!.w);
  });
});
