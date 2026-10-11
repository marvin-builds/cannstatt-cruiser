/**
 * A realistic GET /feedback answer (newest first) for unit tests and the
 * insights playtest (scripts/scenarios/insights.ts). Never imported by the board itself.
 */
import type { TriagedFeedbackEntry } from './triage-types';

const LONG_TEXT =
  'Ich finde das Spiel super! Aber manchmal, wenn ich ganz schnell am Wasen vorbeifahre und dann springe, ' +
  'bleibt der Skater kurz in der Luft hängen und fällt dann ganz komisch runter.\nDas passiert vor allem ' +
  'abends, wenn viele Leute unterwegs sind.\n\nVielleicht könnt ihr das mal anschauen? Hier ein langer Link ' +
  'zum Nachlesen: https://example.org/ein/sehr/langer/pfad/ohne/leerzeichen/der/umbrechen/muss/damit/nichts/übersteht';

export function sampleFeedback(): TriagedFeedbackEntry[] {
  const base = {
    version: '2026-10-11.4', platform: 'android', input: 'touch', orientation: 'portrait', viewWidth: 390, status: 'open', issue: null, reply: null,
    doneVersion: null,
  } as const;
  return [
    { ...base, id: 14, day: '2026-10-11', kind: 'idea', text: 'Bitte mehr Hunde im Park!\nUnd eine Brezel als Bonus.', log: [] },
    {
      ...base,
      id: 13,
      day: '2026-10-11',
      kind: 'bug',
      text: 'Nach dem Kickflip friert das Bild ein.',
      platform: 'ios',
      orientation: 'landscape',
      viewWidth: 427,
      status: 'todo',
      issue: 12,
      log: [
        '12:01:03 TypeError: Cannot read properties of undefined (reading "x")',
        '    at stepPlayer (player/physics.ts:88)',
        '    at tick (core/loop.ts:41)',
        '12:01:04 audio: context resumed',
      ],
    },
    { ...base, id: 12, day: '2026-10-10', kind: 'bug', text: LONG_TEXT, platform: 'other', input: 'keys', orientation: 'landscape', viewWidth: 427, log: [] },
    { ...base, id: 11, day: '2026-10-08', kind: 'idea', text: '<script>alert("hi")</script> ein Level im Schlossgarten', viewWidth: 320, log: [],
      status: 'rejected', reply: 'Der Schlossgarten passt nicht zur Strecke.' },
  ];
}
