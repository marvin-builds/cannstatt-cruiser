import { describe, expect, it } from 'vitest';
import { PRIVACY_PAGE, PRIVACY_PENDING_SECONDS, PrivacyLink } from './privacy-link';

function link(results: boolean[] = []) {
  const opened: string[] = [];
  const l = new PrivacyLink((url) => {
    opened.push(url);
    return results.shift() ?? true;
  });
  return { l, opened };
}

describe('privacy link', () => {
  it('a press opens the page on the next user gesture, once', () => {
    const { l, opened } = link();
    l.request();
    expect(opened).toEqual([]);
    l.gesture();
    expect(opened).toEqual([PRIVACY_PAGE]);
    l.gesture();
    expect(opened).toEqual([PRIVACY_PAGE]);
  });

  it('opens the static page next to the game', () => {
    expect(PRIVACY_PAGE).toBe('datenschutz.html');
  });

  it('gestures without a press open nothing', () => {
    const { l, opened } = link();
    l.gesture();
    expect(opened).toEqual([]);
  });

  it('a blocked open (no user activation yet) is retried on the next gesture of the same tap', () => {
    const { l, opened } = link([false, true]);
    l.request();
    l.gesture();
    l.gesture();
    l.gesture();
    expect(opened).toEqual([PRIVACY_PAGE, PRIVACY_PAGE]);
  });

  it('a press whose release never came is forgotten, so a later tap elsewhere opens nothing', () => {
    const { l, opened } = link();
    l.request();
    l.update(PRIVACY_PENDING_SECONDS + 0.1);
    l.gesture();
    expect(opened).toEqual([]);
  });

  it('an opener that throws counts as blocked and never breaks the game', () => {
    const l = new PrivacyLink(() => {
      throw new Error('blocked');
    });
    l.request();
    expect(() => l.gesture()).not.toThrow();
  });

  it('without an opener (tests, no browser) a press does nothing', () => {
    const l = new PrivacyLink(null);
    l.request();
    expect(() => l.gesture()).not.toThrow();
  });
});
