/**
 * The game's language (ROADMAP 71): German by default, English as a full second language. One
 * active language for the whole ui: every text is read from `texts()` when it is laid out or
 * drawn, so a switch (setLanguage) changes every canvas text at once; the DOM sheets rebuild in
 * the new words when they show next (they cover the screen, so none shows during a switch), and
 * the page's `lang` follows. The choice is kept on the device (store key LANGUAGE_KEY); before
 * any choice the browser language picks it (read only for that, never stored or sent).
 */
import { measureText } from '../../core/font';
import type { Store } from '../../core/storage';
import { de, type Texts } from './de';
import { en } from './en';

export type { Texts } from './de';
export type Lang = 'de' | 'en';

const CATALOGUES: Record<Lang, Texts> = { de, en };

/** Store key of the language chosen on this device. */
export const LANGUAGE_KEY = 'language';

/** The language for a first visit: English for an English browser, German for any other. */
export function firstVisitLanguage(browserLanguage: string | undefined): Lang {
  return browserLanguage?.toLowerCase().startsWith('en') ? 'en' : 'de';
}

/** The language chosen on this device, else the first-visit language of `browserLanguage`. */
export function loadLanguage(store: Store, browserLanguage: string | undefined): Lang {
  const stored = store.get<unknown>(LANGUAGE_KEY, null);
  return stored === 'de' || stored === 'en' ? stored : firstVisitLanguage(browserLanguage);
}

export function saveLanguage(store: Store, lang: Lang): void {
  store.set(LANGUAGE_KEY, lang);
}

let current: Lang = 'de';

/** The active language. */
export function language(): Lang {
  return current;
}

/** The texts of the active language. */
export function texts(): Texts {
  return CATALOGUES[current];
}

/** `build`'s value for the active language, built once per language: for values used every frame (no allocation per tick). */
export function perLanguage<T>(build: (t: Texts) => T): () => T {
  const built = new Map<Lang, T>();
  return () => {
    let value = built.get(current);
    if (value === undefined) built.set(current, (value = build(texts())));
    return value;
  };
}

/** The widest of `pick`'s text over every language at font `scale` (view px). */
export function widestText(pick: (t: Texts) => string, scale = 1): number {
  return Math.max(...Object.values(CATALOGUES).map((t) => measureText(pick(t), scale)));
}

/** Makes `lang` the active language, also as the page's `lang`. */
export function setLanguage(lang: Lang): void {
  current = lang;
  if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = lang;
}
