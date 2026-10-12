/**
 * Every canvas text fits the narrowest view (320 px, landscape and portrait) in
 * both languages (ROADMAP 71): each catalogue entry the canvas draws is
 * measured with the game font against the width its layout gives it, and the
 * menu screens keep in English every row they keep in German.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { VIEW_W } from '../../core/config';
import { measureText } from '../../core/font';
import type { Rect } from '../../types';
import { STAR } from '../art';
import { feedbackLayout } from '../feedback-layout';
import { pageLayout, pageTitle } from '../feedback-page-layout';
import { guideLines, guideLineWidth, installGuideLayout } from '../install-guide';
import { itemHintRect } from '../item-button';
import { kidNoticeLayout, kidNoticeLines } from '../kid-notice';
import { centredWidth, POPUP_MARGIN, popupScale, settingsLayout, uiMetrics } from '../layout';
import { gameOverLayout, type MenuInput, pauseLayout, titleLayout } from '../menu-layout';
import { PORTRAIT_NOTE_W } from '../note-text';
import { scoreEntryLayout, scoreListLayout } from '../score-layout';
import { fitCallout } from '../stunt-callout';
import { airTrickHintPlate } from '../air-trick-hint';
import { highFiveHintPlate } from '../high-five';
import { kickerHintPlate } from '../kicker-hint';
import { trickHintPlate } from '../trick-hint';
import { whatsNewLayout } from '../whats-new';
import { de } from './de';
import { en } from './en';
import { type Lang, setLanguage, type Texts, texts } from './index';

afterEach(() => setLanguage('de'));

const LANGS: [Lang, Texts][] = [
  ['de', de],
  ['en', en],
];

const DISPLAYS = [
  { name: 'desktop', viewWidth: VIEW_W, touch: false, portrait: false },
  { name: 'phone landscape', viewWidth: VIEW_W, touch: true, portrait: false },
  { name: 'phone portrait', viewWidth: VIEW_W, touch: true, portrait: true },
];

/** The widest centred line in a 320 px view (4 px each side). */
const LINE_W = VIEW_W - 8;
const inView = (r: Rect) => r.x >= 0 && r.x + r.w <= VIEW_W;

/** `s` at `scale` is at most `maxW` wide. */
function fits(label: string, s: string, scale: number, maxW: number): void {
  expect(measureText(s, scale), `${label}: "${s}" at scale ${scale}`).toBeLessThanOrEqual(maxW);
}

describe.each(LANGS)('canvas texts in %s fit a 320 px view', (lang, t) => {
  it('title: tagline, prompt, controls, help, keys and the records row', () => {
    setLanguage(lang);
    for (const touch of [false, true]) {
      fits('tagline', t.title.tagline, 1, LINE_W);
      fits('start', t.title.start(touch), 1, LINE_W);
      fits('controls', t.title.controls(touch), 1, LINE_W);
      for (const line of t.title.help(touch)) fits('help', line, 1, LINE_W);
    }
    fits('keys', [t.title.keys, t.title.feedbackKey, t.title.settingsKey].join(', '), 1, LINE_W);
    const records = measureText(t.title.highscore('1.234.567')) + 14 + STAR.width + 3 + measureText(t.title.starsTotal('12.345'));
    expect(records, 'records row').toBeLessThanOrEqual(LINE_W);
  });

  it('menu screens keep every row and card in English that they keep in German', () => {
    for (const d of DISPLAYS) {
      for (const reload of [false, true]) {
        const input: MenuInput = { ...d, fullscreenAvailable: true, reload, install: d.touch, settingsButton: true, feedback: true };
        const ids = () => [
          [...titleLayout(input).blocks.keys()],
          [...pauseLayout(input).blocks.keys()],
          [...gameOverLayout({ ...input, newRecord: true, submit: true }).blocks.keys()],
        ];
        setLanguage(lang);
        const news = whatsNewLayout(input, []);
        for (const [id, r] of news.blocks) expect(inView(r), `${d.name} what's new ${id}`).toBe(true);
        setLanguage('de');
        const german = ids();
        setLanguage(lang);
        const shown = ids();
        german.forEach((screen, i) => expect(shown[i], `${d.name} reload=${reload} screen ${i}`).toEqual(expect.arrayContaining(screen)));
      }
    }
  });

  it('menu screens: headlines, prompts, buttons and the results table', () => {
    for (const touch of [false, true]) {
      fits('pause prompt', t.menu.pausePrompt(touch), 1, LINE_W - 16);
      fits('trick', t.menu.trick(touch, false), 1, LINE_W);
      fits('trick short', t.menu.trick(touch, true), 2, LINE_W);
      fits('game over prompt', t.menu.gameOverPrompt(touch), 1, LINE_W);
      fits('to title', t.menu.toTitle(touch, true), 1, LINE_W / 2);
      fits('feedback', t.menu.feedback(touch), 2, LINE_W);
      fits('submit', t.menu.submit(touch), 2, LINE_W);
      fits('reload card', `${t.menu.reload} ${t.menu.reloadButton(touch)}`, 2, LINE_W);
    }
    fits('pause keys', t.menu.pauseKeys, 1, LINE_W);
    for (const s of [t.menu.pause, t.menu.gameOver, t.menu.newRecord, t.menu.whatsNew, t.menu.next, t.menu.installApp]) fits('headline', s, 2, LINE_W);
    // The table's labels end 4 px left of its centre line (140 px wide table).
    for (const label of t.menu.results) fits('results', label, 1, 70 - 4);
    fits('version heading', t.menu.version(t.day('2026', '12', '28'), '12'), 1, 280 - 30);
  });

  it('settings menu, kid notice and install steps', () => {
    setLanguage(lang);
    for (const d of DISPLAYS) {
      const m = uiMetrics(d);
      const l = settingsLayout(VIEW_W, m, true);
      const labelScale = m.menuButtonH >= 24 ? 2 : 1;
      fits(`${d.name} settings title`, t.settings.title, 2, LINE_W);
      for (const on of [false, true]) fits(`${d.name} kid mode`, t.settings.kidMode(on), labelScale, l.toggle.w - 8);
      fits(`${d.name} stats switch`, t.stats.label(false), 1, l.stats.w - 8);
      fits(`${d.name} privacy`, t.privacy.label, 1, l.privacyLink.w - 8);
      fits(`${d.name} back`, t.settings.back, labelScale, l.back.w - 8);
      fits(`${d.name} install`, t.settings.installApp, labelScale, l.install!.w - 8);
      const k = kidNoticeLayout(d, true);
      for (const line of kidNoticeLines(d.touch, true)) fits(`${d.name} kid notice`, line, k.scale, LINE_W);
      fits(`${d.name} kid notice title`, t.kidNotice.title, 2, LINE_W);
      for (const platform of ['android', 'ios', 'other'] as const) {
        const g = installGuideLayout(d, platform);
        for (const line of guideLines(platform)) expect(guideLineWidth(line, g.scale), `${d.name} ${platform}`).toBeLessThanOrEqual(LINE_W);
        fits(`${d.name} install reason`, t.install.reason, g.scale, LINE_W);
      }
    }
    fits('settings keys', t.settings.keys, 1, LINE_W);
    // The notes: the short form at portrait's scale 2, the long one at scale 1.
    for (const note of [t.settings.kidNoteOff, t.settings.kidNoteOn, [t.stats.note, t.stats.noteShort], [t.stats.listNote, t.stats.listNoteShort], [t.score.privacy, t.score.privacyShort]]) {
      fits('note', note[0]!, 1, LINE_W);
      fits('short note', note[note.length - 1]!, 2, PORTRAIT_NOTE_W);
    }
    fits('stats off', t.stats.offNote, 2, PORTRAIT_NOTE_W);
  });

  it('riding: popups, catches, callouts, the zone ribbon, the HUD and the hints', () => {
    setLanguage(lang);
    const popupW = VIEW_W - 2 * POPUP_MARGIN - 20;
    const p = t.popups;
    const popups = [
      ...Object.values(p.bail),
      ...Object.values(p.crowd),
      `${p.stomp} +1.250`,
      `${p.ballHit} +1.250`,
      p.throw,
      p.drink,
      `${p.eat} ${p.eatPoints}`,
      p.ballBack,
      p.crash,
      `${p.boardslide} +1.250`,
      `${p.highFive} +1.250`,
      `${p.kickflip} +1.250`,
      `${p.star} +125`,
      `${p.starArc} +1.250`,
      p.grind,
      t.chill.adult,
      t.chill.kid,
    ];
    for (const s of popups) fits('popup', s, popupScale({ portrait: true }, false), popupW);
    for (const s of Object.values(t.items)) fits('catch', s, popupScale({ portrait: false }, true), popupW);
    for (const lines of [[t.callout.line('9')], [`${t.callout.kickflip} +1.250`, t.callout.line('9')], [t.callout.stuntLine, '+12.500'], [t.callout.session, '+12.500']]) {
      expect(fitCallout(lines, true, VIEW_W, []), lines.join(' / ')).not.toBeNull();
    }
    for (const zone of t.zones) expect(measureText(zone, 2) + 16, zone).toBeLessThanOrEqual(LINE_W);
    fits('hud', t.hud.combo('99'), 1, 80);
    for (const d of DISPLAYS) {
      const plates: Rect[] = [trickHintPlate(d).rect, airTrickHintPlate(d).rect, kickerHintPlate(d, VIEW_W / 2).rect, highFiveHintPlate(d).rect];
      if (d.touch) plates.push(itemHintRect(VIEW_W, d, popupScale(d, false)));
      for (const r of plates) expect(inView(r), `${d.name} hint ${JSON.stringify(r)}`).toBe(true);
    }
  });

  it('Bestenliste and the name entry', () => {
    setLanguage(lang);
    for (const d of DISPLAYS) {
      const list = scoreListLayout(d, 20, true);
      const entry = scoreEntryLayout(d);
      fits(`${d.name} list title`, t.score.title, 2, list.close.x - 4);
      fits(`${d.name} entry title`, t.score.entryTitle, 2, entry.close.x - 4);
      for (const s of [t.score.loading, t.score.offline, t.score.empty]) fits(`${d.name} list state`, s, 1, list.list.w - 8);
      for (const s of [t.score.sending, t.score.queued, t.score.queuedLater, t.score.badName, t.score.rate, t.score.failed, t.score.short, t.score.outside, t.score.kept('1.234.567')]) {
        fits(`${d.name} message`, s, 1, LINE_W);
      }
      fits(`${d.name} submit`, t.score.submitAs('Lilli-Marlene'), 1, entry.submit.w - 12);
      fits(`${d.name} points`, t.score.points('1.234.567'), entry.textScale, LINE_W);
      fits(`${d.name} name prompt`, t.score.namePrompt, 1, entry.field.w);
    }
    fits('list keys', t.score.listKeys, 1, LINE_W);
    fits('entry keys', t.score.entryKeys, 1, LINE_W);
  });

  it('feedback dialog: tabs, kinds, buttons, the status line and the page buttons', () => {
    setLanguage(lang);
    for (const d of DISPLAYS.filter((x) => !x.portrait)) {
      const l = feedbackLayout(d);
      const rects = [l.newTab, l.mineTab, l.close, l.bug, l.idea, l.field, l.log, l.view, l.send];
      for (const r of rects) expect(inView(r) && r.x >= (VIEW_W - centredWidth(VIEW_W, uiMetrics(d))) / 2, `${d.name} ${JSON.stringify(r)}`).toBe(true);
      fits(`${d.name} new tab`, t.feedbackPages.newTab, l.labelScale, l.newTab.w - 4);
      fits(`${d.name} bug`, t.feedback.bug, l.labelScale, l.bug.w - 4);
      fits(`${d.name} idea`, t.feedback.idea, l.labelScale, l.idea.w - 4);
      fits(`${d.name} send`, t.feedback.send, l.labelScale, l.send.w - 4);
      fits(`${d.name} view`, t.feedbackPages.view, l.labelScale, l.view.w - 4);
      for (const s of [t.feedback.hint, t.feedback.sending, t.feedback.offline, t.feedback.rate, t.feedback.invalid, t.feedback.short('3')]) fits(`${d.name} status`, s, l.lineScale, l.line.w);
      for (const s of [t.feedback.bugPlaceholder, t.feedback.ideaPlaceholder]) fits(`${d.name} placeholder`, s, 1, l.field.w - 8);
      for (const page of ['detail', 'confirm', 'preview', 'sent'] as const) {
        const p = pageLayout(d, page);
        for (const r of [p.back, p.view, p.del, p.yes, p.no].filter((x): x is Rect => !!x)) expect(inView(r), `${d.name} ${page}`).toBe(true);
        const title = pageTitle(page);
        if (p.title && title) expect(p.title.x + measureText(title, p.title.scale), `${d.name} ${page} title`).toBeLessThanOrEqual(p.close.x);
      }
      const list = pageLayout(d, 'list', t.feedbackPages.deleted);
      expect(inView(list.mineTab!), d.name).toBe(true);
      fits(`${d.name} list empty`, t.feedbackPages.empty, 1, LINE_W);
    }
  });

  it('a texts() lookup follows the active language', () => {
    setLanguage(lang);
    expect(texts()).toBe(t);
  });
});
