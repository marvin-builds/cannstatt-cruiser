/**
 * The rotate screen as a full-screen DOM overlay (ROADMAP 73), like the
 * portrait sheets (sheet-dom.ts): the logo at the top, a large pixel-art phone
 * that turns from upright to sideways in a short loop (still when the player
 * prefers reduced motion) under a turn arrow as wide as the turning phone, so
 * both stay centred on one line, "Bitte Gerät drehen" in
 * large type, the reason, and "Trotzdem weiter". A tap anywhere on it (or Esc)
 * dismisses it too. The pixel art is drawn at an integer scale and shown with
 * `image-rendering: pixelated`, so it stays crisp. When it shows is
 * rotate-screen.ts's rule; index.ts uses the RotateSheet interface, tests pass
 * a fake. DOM-only, checked by playtest.
 */
import type { Sprite } from '../core/sprite';
import { ROTATE_ARROW, ROTATE_PHONE, UI } from './art';
import { drawLogo, logoRect } from './logo';
import { SHEET_STYLE } from './portrait-sheets';
import { createSheet, line, sheetButton, styled } from './sheet-dom';

export interface RotateSheet {
  /** Shows or hides the overlay. Called every tick. */
  show(shown: boolean): void;
}

export interface RotateSheetHandlers {
  /** "Trotzdem weiter", a tap anywhere, Esc. */
  onDismiss(): void;
}

export const ROTATE_TEXT = {
  title: 'Bitte Gerät drehen',
  reason: 'Im Querformat fährt es sich besser.',
  dismiss: 'Trotzdem weiter',
} as const;

/** One turn: upright, a quarter turn clockwise, sideways, and back (ms). */
const TURN_MS = 2600;
const TURN: Keyframe[] = [
  { transform: 'rotate(0deg)', offset: 0 },
  { transform: 'rotate(0deg)', offset: 0.2 },
  { transform: 'rotate(90deg)', offset: 0.45 },
  { transform: 'rotate(90deg)', offset: 0.8 },
  { transform: 'rotate(0deg)', offset: 1 },
];

/** A canvas of `w` x `h` art px, drawn by `paint`, shown crisp (sized per screen by `scaleTo`). */
function pixelCanvas(w: number, h: number, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const canvas = styled(document.createElement('canvas'), { imageRendering: 'pixelated', display: 'block', flex: 'none' });
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext('2d')!);
  return canvas;
}

function spriteCanvas(s: Sprite): HTMLCanvasElement {
  return pixelCanvas(s.width, s.height, (g) => s.draw(g, 0, 0, 0));
}

/** Sets a pixel canvas's CSS size to `scale` CSS px per art px. */
function scaleTo(canvas: HTMLCanvasElement, scale: number): void {
  const w = `${canvas.width * scale}px`;
  if (canvas.style.width !== w) styled(canvas, { width: w, height: `${canvas.height * scale}px` });
}

/** Integer art scales that fit the screen: the arrow and the phone take about a third of the height, the logo most of the width. */
export function rotateScales(width: number, height: number): { phone: number; logo: number } {
  const logo = logoRect(0);
  const art = ROTATE_ARROW.height + ROTATE_PHONE.height;
  const phone = Math.max(3, Math.min(Math.floor((height * 0.36) / art), Math.floor((width * 0.55) / ROTATE_PHONE.height), 14));
  return { phone, logo: Math.max(1, Math.min(Math.floor((width * 0.85) / logo.w), Math.floor((height * 0.16) / logo.h), 5)) };
}

/** Tallest "Trotzdem weiter" (CSS px), on a big tablet. */
const MAX_BUTTON_PX = 88;

/** The button's height for a screen `height` CSS px tall: the sheets' button on phones, taller on tablets. */
export function rotateButtonPx(height: number): number {
  return Math.min(MAX_BUTTON_PX, Math.max(SHEET_STYLE.buttonPx, Math.round((height - 300) * 0.085)));
}

export function createDomRotateSheet(handlers: RotateSheetHandlers): RotateSheet {
  let parts: ReturnType<typeof build> | null = null;
  let shown = false;

  function build() {
    const sheet = createSheet(ROTATE_TEXT.title, () => handlers.onDismiss());
    styled(sheet.root, { alignItems: 'center', justifyContent: 'space-evenly', textAlign: 'center', touchAction: 'manipulation', zIndex: '4' });
    const { w, h } = logoRect(0);
    const logo = pixelCanvas(w, h, (g) => drawLogo(g, 0, 0));
    logo.setAttribute('aria-hidden', 'true');
    // The phone turns inside a square box, so sideways it still fits; the arrow sits above it, centred on the same line.
    const phone = spriteCanvas(ROTATE_PHONE);
    const box = styled(document.createElement('div'), { display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' });
    box.append(phone);
    const arrow = spriteCanvas(ROTATE_ARROW);
    const art = styled(document.createElement('div'), { display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none' });
    art.setAttribute('aria-hidden', 'true');
    art.append(arrow, box);
    const heading = styled(document.createElement('h2'), {
      margin: '0',
      fontSize: 'clamp(28px, 8vw, 56px)',
      lineHeight: '1.15',
      color: UI.yellow,
    });
    heading.textContent = ROTATE_TEXT.title;
    const reason = styled(line(SHEET_STYLE.textPx, UI.white), { fontSize: `max(${SHEET_STYLE.textPx}px, 3vw)` });
    reason.textContent = ROTATE_TEXT.reason;
    const button = sheetButton(ROTATE_TEXT.dismiss, () => handlers.onDismiss());
    styled(button, { flex: 'none', width: 'min(100%, 420px)', color: UI.yellow });
    const words = styled(document.createElement('div'), { display: 'flex', flexDirection: 'column', gap: `${SHEET_STYLE.gapPx}px` });
    words.append(heading, reason);
    sheet.root.append(logo, art, words, button);
    // A tap anywhere dismisses too (in the click, so the whole tap stays on the overlay and starts nothing behind it).
    sheet.root.addEventListener('click', (e) => {
      if (!button.contains(e.target as Node)) handlers.onDismiss();
    });
    return { sheet, logo, phone, box, arrow, button, turn: null as Animation | null };
  }

  /** Sizes the art for the screen now, and turns the phone unless reduced motion is wanted. */
  function layout(p: NonNullable<typeof parts>): void {
    const s = rotateScales(window.innerWidth, window.innerHeight);
    scaleTo(p.logo, s.logo);
    scaleTo(p.phone, s.phone);
    scaleTo(p.arrow, s.phone);
    const side = `${ROTATE_PHONE.height * s.phone}px`;
    // One art px of air between the arrow's head and the phone.
    if (p.box.style.width !== side) styled(p.box, { width: side, height: side, marginTop: `${s.phone}px` });
    const buttonPx = rotateButtonPx(window.innerHeight);
    if (p.button.style.minHeight !== `${buttonPx}px`) {
      styled(p.button, { minHeight: `${buttonPx}px`, fontSize: `${Math.max(SHEET_STYLE.textPx, Math.round(buttonPx * 0.36))}px` });
    }
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (still) {
      p.turn?.cancel();
      p.turn = null;
    } else if (!p.turn && typeof p.phone.animate === 'function') {
      p.turn = p.phone.animate(TURN, { duration: TURN_MS, iterations: Infinity, easing: 'ease-in-out' });
    }
  }

  return {
    show(next) {
      if (!next) {
        if (shown) {
          parts?.turn?.cancel();
          if (parts) parts.turn = null;
          parts?.sheet.setShown(false);
        }
        shown = false;
        return;
      }
      parts ??= build();
      parts.sheet.setShown(true);
      layout(parts);
      shown = true;
    },
  };
}
