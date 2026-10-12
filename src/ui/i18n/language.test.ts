import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMemoryStore } from '../../core/storage';
import { de } from './de';
import { en } from './en';
import { firstVisitLanguage, LANGUAGE_KEY, language, loadLanguage, saveLanguage, setLanguage, texts } from './index';

afterEach(() => setLanguage('de'));

describe('firstVisitLanguage', () => {
  it('picks English for an English browser language', () => {
    expect(firstVisitLanguage('en')).toBe('en');
    expect(firstVisitLanguage('en-GB')).toBe('en');
    expect(firstVisitLanguage('EN-us')).toBe('en');
  });

  it('picks German for every other or unknown browser language', () => {
    expect(firstVisitLanguage('de-DE')).toBe('de');
    expect(firstVisitLanguage('fr')).toBe('de');
    expect(firstVisitLanguage('')).toBe('de');
    expect(firstVisitLanguage(undefined)).toBe('de');
  });
});

describe('loadLanguage / saveLanguage', () => {
  it('follows the browser language while nothing is stored, and stores nothing then', () => {
    const store = createMemoryStore();
    expect(loadLanguage(store, 'en-US')).toBe('en');
    expect(loadLanguage(store, 'de')).toBe('de');
    expect(store.get(LANGUAGE_KEY, null)).toBeNull();
  });

  it('keeps the choice made on this device over the browser language', () => {
    const store = createMemoryStore();
    saveLanguage(store, 'de');
    expect(loadLanguage(store, 'en-US')).toBe('de');
    saveLanguage(store, 'en');
    expect(loadLanguage(store, 'de-DE')).toBe('en');
  });

  it('treats junk in storage as no choice', () => {
    const store = createMemoryStore();
    store.set(LANGUAGE_KEY, 'fr');
    expect(loadLanguage(store, 'de')).toBe('de');
    store.set(LANGUAGE_KEY, 42);
    expect(loadLanguage(store, 'en')).toBe('en');
  });
});

describe('the active language', () => {
  it('is German by default', () => {
    expect(language()).toBe('de');
    expect(texts()).toBe(de);
  });

  it('switches every text at once', () => {
    setLanguage('en');
    expect(language()).toBe('en');
    expect(texts()).toBe(en);
    setLanguage('de');
    expect(texts()).toBe(de);
  });

  it('sets the document language where there is a document', () => {
    const root = { lang: '' };
    vi.stubGlobal('document', { documentElement: root });
    try {
      setLanguage('en');
      expect(root.lang).toBe('en');
      setLanguage('de');
      expect(root.lang).toBe('de');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
