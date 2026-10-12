/**
 * The manual install steps ("App installieren", ROADMAP 68): shown when the
 * install button is pressed without a kept browser prompt (iOS has none, and
 * Chrome's can be used up, refused or not offered yet). One short way per
 * platform: Android Chrome's menu, iOS Safari's share sheet, a desktop
 * browser's address bar. Texts and layout; the open state is
 * InstallOffer.guideOpen (install-offer.ts), hotspots in index.ts, drawing in
 * screens.ts.
 */
import { measureText } from '../core/font';
import type { InstallPlatform, Rect } from '../types';
import { MENU_DOTS_ICON, SHARE_ICON } from './art';
import { centreX, uiMetrics } from './layout';
import { texts } from './i18n';

/** A piece of a step line: text, or an icon drawn at the text's scale. */
export type GuidePart = string | { icon: keyof typeof ICONS };

const ICONS = { menu: MENU_DOTS_ICON, share: SHARE_ICON } as const;
const MENU: GuidePart = { icon: 'menu' };
const SHARE: GuidePart = { icon: 'share' };

/** Space around an icon inside a line (at scale 1). */
export const ICON_GAP = 3;

/** The steps of the platform in the active language, one line each; the first line of Android and iOS shows its icon. */
export function guideLines(platform: InstallPlatform): GuidePart[][] {
  const t = texts().install;
  if (platform === 'other') return t.other.map((line) => [line]);
  const { first, rest } = t[platform];
  return [[first[0]!, platform === 'android' ? MENU : SHARE, first[1]!], ...rest.map((line) => [line])];
}

/** Width of one part at `scale` (an icon with its gaps). */
export function partWidth(part: GuidePart, scale: number): number {
  return typeof part === 'string' ? measureText(part, scale) : (ICONS[part.icon].width + 2 * ICON_GAP) * scale;
}

/** Width of a step line: its parts side by side (an icon brings its own gaps). */
export function guideLineWidth(line: GuidePart[], scale: number): number {
  return line.reduce((w, part) => w + partWidth(part, scale), 0);
}

/** The icon of an icon part (null for text). */
export function partIcon(part: GuidePart) {
  return typeof part === 'string' ? null : ICONS[part.icon];
}

export interface InstallGuideLayout {
  /** Top of the scale-2 headline. */
  title: number;
  /** Top of the reason line. */
  reason: number;
  /** Top of the first step line. */
  lines: number;
  lineH: number;
  /** Font scale of the reason and the steps: 2 in portrait, where a view pixel is only ~1 CSS px. */
  scale: number;
  ok: Rect;
}

const OK_W = 80;
const GAP = 8;

/** The guide on this display: headline, reason, the platform's steps, OK centred under them. */
export function installGuideLayout(display: { viewWidth: number; touch: boolean; portrait: boolean }, platform: InstallPlatform): InstallGuideLayout {
  const m = uiMetrics(display);
  const scale = display.touch && display.portrait ? 2 : 1;
  const lineH = scale === 2 ? 17 : 11;
  const title = scale === 2 ? 8 : 24;
  const reason = title + 14 + GAP;
  const lines = reason + lineH + GAP;
  const w = Math.max(OK_W, m.menuButtonH);
  const ok: Rect = { x: centreX(display.viewWidth) - Math.floor(w / 2), y: lines + guideLines(platform).length * lineH + GAP, w, h: m.menuButtonH };
  return { title, reason, lines, lineH, scale, ok };
}
