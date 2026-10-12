import { afterEach, describe, expect, it } from 'vitest';
import { measureText } from '../core/font';
import type { MissionKind, Rect } from '../types';
import { setLanguage } from './i18n';
import { MISSION_ICON_W, MissionLine, missionGoal } from './mission-line';

afterEach(() => setLanguage('de'));

const KINDS: MissionKind[] = ['stomp', 'grind', 'stuntLine', 'kickflip', 'stars', 'highFive'];
const PLATE: Rect = { x: 2, y: 2, w: 60, h: 41 };

describe('mission goal texts (ROADMAP 52 point 11)', () => {
  it('names every kind in German with the right singular and plural', () => {
    expect(KINDS.map((k) => missionGoal(k, 1))).toEqual([
      '1 Person stompen',
      '1 s grinden',
      '1 Stunt-Linie fahren',
      '1 Kickflip landen',
      '1 Stern sammeln',
      '1 High Five geben',
    ]);
    expect(KINDS.map((k) => missionGoal(k, 3))).toEqual([
      '3 Leute stompen',
      '3 s grinden',
      '3 Stunt-Linien fahren',
      '3 Kickflips landen',
      '3 Sterne sammeln',
      '3 High Fives geben',
    ]);
  });

  it('names every kind in English with the right singular and plural', () => {
    setLanguage('en');
    expect(KINDS.map((k) => missionGoal(k, 1))).toEqual([
      'Stomp 1 person',
      'Grind for 1 s',
      'Ride 1 stunt line',
      'Land 1 kickflip',
      'Collect 1 star',
      'Give 1 high five',
    ]);
    expect(KINDS.map((k) => missionGoal(k, 3))).toEqual([
      'Stomp 3 people',
      'Grind for 3 s',
      'Ride 3 stunt lines',
      'Land 3 kickflips',
      'Collect 3 stars',
      'Give 3 high fives',
    ]);
  });
});

describe('MissionLine (the HUD strip under the stats plate)', () => {
  it('hides without a mission', () => {
    const line = new MissionLine();
    line.update(null, PLATE);
    expect(line.plate).toBeNull();
  });

  it('shows goal and progress in a plate right under the stats plate, wide enough for icon and text', () => {
    const line = new MissionLine();
    line.update({ kind: 'stomp', goal: 3, progress: 1 }, PLATE);
    expect(line.goal).toBe('3 Leute stompen');
    expect(line.progress).toBe('1/3');
    const p = line.plate!;
    expect(p.x).toBe(PLATE.x);
    expect(p.y).toBeGreaterThan(PLATE.y + PLATE.h);
    expect(line.textX).toBeGreaterThanOrEqual(p.x + MISSION_ICON_W);
    expect(line.progressX).toBeGreaterThan(line.textX + measureText(line.goal));
    expect(line.progressX + measureText(line.progress)).toBeLessThan(p.x + p.w);
    expect(line.y).toBeGreaterThan(p.y);
    expect(line.y + 8).toBeLessThanOrEqual(p.y + p.h);
  });

  it('keeps its texts and plate while nothing changes, and follows progress, plate and language', () => {
    const line = new MissionLine();
    const mission = { kind: 'grind' as const, goal: 4, progress: 2 };
    line.update(mission, PLATE);
    const plate = line.plate;
    const top = plate!.y;
    const goal = line.goal;
    line.update(mission, PLATE);
    expect(line.plate).toBe(plate);
    expect(line.goal).toBe(goal);
    mission.progress = 3;
    line.update(mission, PLATE);
    expect(line.progress).toBe('3/4');
    line.update(mission, { ...PLATE, h: PLATE.h + 10 });
    expect(line.plate!.y).toBe(top + 10);
    setLanguage('en');
    line.update(mission, PLATE);
    expect(line.goal).toBe('Grind for 4 s');
  });

  it('steps right of a box it would cover (the portrait item button under a tall plate), and back once it is gone', () => {
    const line = new MissionLine();
    const mission = { kind: 'stomp' as const, goal: 3, progress: 0 };
    const tall: Rect = { x: 2, y: 2, w: 66, h: 60 };
    const button: Rect = { x: 2, y: 66, w: 46, h: 46 };
    line.update(mission, tall, button);
    const p = line.plate!;
    expect(p.x).toBeGreaterThan(button.x + button.w);
    expect(p.y).toBeGreaterThan(tall.y + tall.h);
    expect(line.textX).toBeGreaterThan(p.x);
    line.update(mission, tall, null);
    expect(line.plate!.x).toBe(tall.x);
    // A box it does not reach changes nothing.
    line.update(mission, PLATE, button);
    expect(line.plate!.x).toBe(PLATE.x);
  });

  it('never shows more progress than the goal', () => {
    const line = new MissionLine();
    line.update({ kind: 'stars', goal: 5, progress: 7 }, PLATE);
    expect(line.progress).toBe('5/5');
  });
});
