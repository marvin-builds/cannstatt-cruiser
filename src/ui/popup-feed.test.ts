import { describe, expect, it } from 'vitest';
import { PopupFeed } from './popup-feed';

const texts = (feed: PopupFeed, kidMode = false) => feed.flush(kidMode).map((p) => p.text);

describe('PopupFeed', () => {
  it('a stomp shows one merged popup "Stomp! +N" instead of "+N" and "Stomp!"', () => {
    const feed = new PopupFeed();
    feed.cleared(7, 150);
    feed.stomp(7);
    expect(texts(feed)).toEqual(['Stomp! +150']);
  });

  it('merges in any order and keeps other clears apart', () => {
    const feed = new PopupFeed();
    feed.stomp(7);
    feed.cleared(3, 1250);
    feed.cleared(7, 150);
    expect(texts(feed).sort()).toEqual(['+1.250', 'Stomp! +150']);
  });

  it('a plain clear shows its points, a stomp without points just "Stomp!"', () => {
    const feed = new PopupFeed();
    feed.cleared(1, 50);
    expect(texts(feed)).toEqual(['+50']);
    feed.stomp(2);
    expect(texts(feed)).toEqual(['Stomp!']);
  });

  it('is empty after a flush and returns the same empty list without events', () => {
    const feed = new PopupFeed();
    feed.cleared(1, 50);
    feed.flush(false);
    expect(feed.flush(false)).toBe(feed.flush(false));
    expect(feed.flush(false)).toHaveLength(0);
  });

  it('drinking: "Prost! Gluck gluck gluck"', () => {
    const feed = new PopupFeed();
    feed.itemUsed('drink');
    expect(texts(feed)).toEqual(['Prost! Gluck gluck gluck']);
  });

  it('kid mode never cheers with beer', () => {
    const feed = new PopupFeed();
    feed.itemUsed('drink');
    const [text] = texts(feed, true);
    expect(text).not.toMatch(/prost|gluck|bier|maß/i);
  });

  it('eating with a health gain: "Lecker! +1" with a heart', () => {
    const feed = new PopupFeed();
    feed.itemUsed('eat');
    feed.healthGained();
    const [p] = feed.flush(false);
    expect(p).toMatchObject({ text: 'Lecker! +1', icon: 'heart' });
  });

  it('eating at full health shows the bonus points instead', () => {
    const feed = new PopupFeed();
    feed.scoreChanged(250);
    feed.itemUsed('eat');
    const [p] = feed.flush(false);
    expect(p).toMatchObject({ text: 'Lecker! +250', icon: null });
    feed.itemUsed('eat');
    expect(texts(feed)).toEqual(['Lecker! +Punkte']);
  });

  it('throwing: "Wurf!"; a hit: "Treffer!" merged with its points; a ricochet warns', () => {
    const feed = new PopupFeed();
    feed.itemUsed('throw');
    expect(texts(feed)).toEqual(['Wurf!']);
    feed.cleared(9, 200);
    feed.ballHit(9);
    expect(texts(feed)).toEqual(['Treffer! +200']);
    feed.ballHit(9);
    expect(texts(feed)).toEqual(['Treffer!']);
    feed.ballBack();
    expect(texts(feed)).toEqual(['Achtung, der Ball!']);
  });

  it('a crash says "Autsch!", also when the ball knocked the skater off', () => {
    const feed = new PopupFeed();
    feed.crash();
    expect(texts(feed)).toEqual(['Autsch!']);
  });

  it('a grind trick: "Grind-Trick! +N"', () => {
    const feed = new PopupFeed();
    feed.grindTrick(1500);
    expect(texts(feed)).toEqual(['Grind-Trick! +1.500']);
  });

  it('every popup has a colour', () => {
    const feed = new PopupFeed();
    feed.itemUsed('drink');
    feed.ballBack();
    feed.grindTrick(10);
    for (const p of feed.flush(false)) expect(p.color).toMatch(/^#/);
  });
});
