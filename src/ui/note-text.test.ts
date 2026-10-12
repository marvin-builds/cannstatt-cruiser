import { describe, expect, it } from 'vitest';
import { measureText } from '../core/font';


import { fittingNote, PORTRAIT_NOTE_W } from './note-text';
import { de } from './i18n/de';


describe('fittingNote', () => {
  it('keeps the long text at the scale where it fits', () => {
    expect(fittingNote(['Kurz', 'K'], 2, 200)).toEqual({ text: 'Kurz', scale: 2 });
  });

  it('takes the first shorter variant that fits at the scale', () => {
    const long = 'Ein ziemlich langer Hinweis unter dem Knopf';
    const short = 'Kurzer Hinweis';
    const maxW = measureText(short, 2) + 1;
    expect(fittingNote([long, short], 2, maxW)).toEqual({ text: short, scale: 2 });
  });

  it('falls back to the first text at scale 1 when no variant fits', () => {
    expect(fittingNote(['Viel zu lang für hier', 'Auch zu lang'], 2, 10)).toEqual({ text: 'Viel zu lang für hier', scale: 1 });
  });

  it('every note shown in portrait has a variant that fits the narrowest view at scale 2', () => {
    const notes = [
      [de.score.privacy, de.score.privacyShort],
      [de.stats.listNote, de.stats.listNoteShort],
      [de.stats.offNote],
      [de.stats.note, de.stats.noteShort],
      de.settings.kidNoteOff,
      de.settings.kidNoteOn,
      [de.feedback.hint],
    ];
    for (const texts of notes) expect(fittingNote(texts, 2, PORTRAIT_NOTE_W).scale, texts[0]).toBe(2);
  });
});
