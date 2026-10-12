import { describe, expect, it } from 'vitest';
import { pageLanguage } from './language';

describe('pageLanguage', () => {
  it('shows English only for #en', () => {
    expect(pageLanguage('#en')).toBe('en');
  });

  it('shows German for an empty hash, #de and anything else', () => {
    for (const hash of ['', '#', '#de', '#EN', '#english', '#en-US', 'en']) expect(pageLanguage(hash), hash).toBe('de');
  });
});
