import { describe, expect, it } from 'vitest';
import { VIEW_H } from '../core/config';
import type { Rect } from '../types';
import { hudButtons, uiMetrics } from './layout';
import { logoRect } from './logo';
import {
  gameOverLayout,
  installParts,
  type MenuInput,
  type MenuLayout,
  pauseLayout,
  reloadParts,
  titleLayout,
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
  { name: 'desktop', touch: false, portrait: false, widths: [320, 360, 427] },
  { name: 'phone landscape', touch: true, portrait: false, widths: [320, 422, 427] },
  { name: 'phone portrait', touch: true, portrait: true, widths: [320, 360, 390, 427] },
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
  return [b.reload, b.install, b.dismiss, b.toTitle, b.next, b.logo].filter((r): r is Rect => !!r);
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

  it('title without notices keeps the full help', () => {
    for (const input of inputs()) {
      if (input.reload || input.install) continue;
      const l = titleLayout(input);
      expect(l.blocks.has('help'), input.label).toBe(true);
      expect(l.blocks.has('records'), input.label).toBe(true);
    }
  });

  it('pause: the logo, "Zum Startbildschirm" and the reload button fit, all variants', () => {
    for (const input of inputs()) {
      const l = pauseLayout({ ...input, install: null });
      checkScreen(input, l, true);
      expect(l.buttons.logo, input.label).not.toBeNull();
      expect(l.buttons.toTitle, input.label).not.toBeNull();
      expect(!!l.buttons.reload, input.label).toBe(input.reload);
      expect(l.blocks.has('prompt'), input.label).toBe(true);
      expect(l.buttons.logo!.w).toBe(logoRect(input.viewWidth).w);
    }
  });

  it('game over: results, "Zum Startbildschirm", reload and install fit, all variants', () => {
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
});
