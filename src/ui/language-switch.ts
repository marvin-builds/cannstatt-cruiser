/**
 * The language switch "DE | EN" (ROADMAP 71): two halves on one plate, the
 * active language highlighted. On the title it sits in the bottom-left
 * corner (mirroring the feedback icon), in adult and kid mode alike, so
 * anyone who cannot read German finds it; in the settings menu in the
 * top-left corner of the title row. Each half is at least a HUD tap area
 * (~44 CSS px on phones). Pure layout, shared by the hotspots (index.ts) and
 * the drawing (menu-screens.ts drawLanguageSwitch).
 */
import { VIEW_H } from '../core/config';
import type { Rect } from '../types';
import { widestText } from './i18n';
import { safeSpan, type UiMetrics } from './layout';

export interface LanguageSwitch {
  /** The tap areas of the two halves. */
  de: Rect;
  en: Rect;
  /** The visible plate over both halves (a HUD plate high, centred in the tap areas). */
  plate: Rect;
  /** Font scale of the labels. */
  scale: number;
}

/** Space between a label and its half's edge (px at the label scale). */
const LABEL_PAD = 3;

/** The switch on the title (bottom-left corner) or in the settings menu (top-left corner). */
export function languageSwitch(viewWidth: number, m: UiMetrics, at: 'title' | 'settings'): LanguageSwitch {
  const scale = m.plate >= 22 ? 2 : 1;
  const labelW = Math.max(widestText((t) => t.language.de, scale), widestText((t) => t.language.en, scale));
  const half = Math.max(m.hit, labelW + 2 * LABEL_PAD * scale);
  const x = safeSpan(viewWidth, m).left + m.margin;
  const y = at === 'title' ? VIEW_H - m.margin - m.hit : m.margin;
  const de: Rect = { x, y, w: half, h: m.hit };
  const en: Rect = { x: x + half, y, w: half, h: m.hit };
  const insetX = Math.min(Math.floor((m.hit - m.plate) / 2), Math.floor((half - labelW) / 2) - 1);
  const insetY = Math.floor((m.hit - m.plate) / 2);
  return { de, en, plate: { x: x + insetX, y: y + insetY, w: 2 * half - 2 * insetX, h: m.plate }, scale };
}
