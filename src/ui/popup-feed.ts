/**
 * Turns one tick's gameplay events into popups. Events that belong together
 * arrive in the same tick (gameplay emits them back to back), so the feed
 * collects them and the ui flushes once per tick: a stomp and the points of
 * the same person become one "Stomp! +150", a ball hit and its points one
 * "Treffer! +200". Texts come from the catalogue (i18n/) in the active language; kid mode never mentions beer.
 * A full kickflip gets the big stunt callout instead (stunt-callout.ts); a
 * reduced one (ROADMAP 41) only a plain popup here. A star (ROADMAP 65)
 * shows "Stern!" with the points of the score change gameplay emits right
 * after it, and a whole arc (`starArc`) its own "Sternenbogen! +points"
 * (gameplay/star-arcs.ts); the pool sums star points of quick repeats.
 * A fan crowd coming on screen (ROADMAP 76) shows "VfB-Fans!" or "Wasen!".
 * Missions (ROADMAP 52 point 11): "Neue Mission!" on missionStart and
 * "Mission geschafft! +points" on missionDone (its scoreChanged shows nothing).
 */
import type { CrowdTheme } from '../gameplay/crowd-tag';
import type { GameBus, GameState, ItemAction } from '../types';
import { UI } from './art';
import { plusPoints } from './layout';
import { texts } from './i18n';

export interface PopupSpec {
  text: string;
  color: string;
  /** Small icon drawn after the text. */
  icon: 'heart' | null;
  /** Points drawn after the text, summed when it merges with a live repeat (PopupPool); absent: none. */
  points?: number;
}

/**
 * What a kickflip bail (crash kind 'bail') is blamed on: a plain late flip (ROADMAP 41), or the
 * drunk or chill effect that made it more likely (ROADMAP 42). Kid-safe words either way.
 */
export type BailCause = 'late' | 'wobbly' | 'relaxed';


/** The cause of a bail from the state at the moment it happens: drunk before chilled before late. */
export function bailCause(state: Pick<GameState, 'drunkTimer' | 'chillTimer'>): BailCause {
  if (state.drunkTimer > 0) return 'wobbly';
  return state.chillTimer > 0 ? 'relaxed' : 'late';
}

type Entry =
  | { kind: 'cleared'; entityId: number; points: number }
  | { kind: 'stomp' | 'ballHit'; entityId: number }
  | { kind: 'used'; action: ItemAction }
  | { kind: 'score'; delta: number; multiplier: number }
  | { kind: 'star' }
  | { kind: 'starArc'; points: number }
  | { kind: 'healthGained' | 'ballBack' }
  | { kind: 'crash'; bail: BailCause | null }
  | { kind: 'grindTrick' | 'highFive' | 'reducedKickflip'; points: number }
  | { kind: 'crowd'; theme: CrowdTheme }
  | { kind: 'missionStart' }
  | { kind: 'missionDone'; points: number };

/** Events that take the points of a clear of the same entity into their own popup: their colour (texts in i18n/ popups.stomp, popups.ballHit). */
const MERGED_COLOR = { stomp: UI.orange, ballHit: UI.yellow } as const;

const NONE: readonly PopupSpec[] = [];

export class PopupFeed {
  private entries: Entry[] = [];

  /**
   * Collects the events that only feed popups. Events with more to them (crash, item use, tricks,
   * high fives) are wired by the ui system, which calls the methods below.
   */
  listen(bus: GameBus): void {
    bus.on('obstacleCleared', (e) => this.cleared(e.entityId, e.points));
    bus.on('stomp', (e) => this.stomp(e.entityId));
    bus.on('scoreChanged', (e) => this.scoreChanged(e.delta, e.multiplier));
    bus.on('healthGained', () => this.healthGained());
    bus.on('ballHit', (e) => this.ballHit(e.entityId));
    bus.on('ballBack', () => this.ballBack());
    bus.on('starCollected', () => this.star());
    bus.on('starArc', (e) => this.starArc(e.points));
    bus.on('crowdAhead', (e) => this.crowdAhead(e.theme));
    bus.on('missionStart', () => this.missionStart());
    bus.on('missionDone', (e) => this.missionDone(e.points));
  }

  /** Drops everything collected (a new run starts). */
  clear(): void {
    this.entries = [];
  }

  cleared(entityId: number, points: number): void {
    this.entries.push({ kind: 'cleared', entityId, points });
  }

  stomp(entityId: number): void {
    this.entries.push({ kind: 'stomp', entityId });
  }

  ballHit(entityId: number): void {
    this.entries.push({ kind: 'ballHit', entityId });
  }

  itemUsed(action: ItemAction): void {
    this.entries.push({ kind: 'used', action });
  }

  healthGained(): void {
    this.entries.push({ kind: 'healthGained' });
  }

  scoreChanged(delta: number, multiplier: number): void {
    this.entries.push({ kind: 'score', delta, multiplier });
  }

  star(): void {
    this.entries.push({ kind: 'star' });
  }

  /** Every star of an arc taken in one flight; `points` is the bonus gameplay added. */
  starArc(points: number): void {
    this.entries.push({ kind: 'starArc', points });
  }

  ballBack(): void {
    this.entries.push({ kind: 'ballBack' });
  }

  /** The skater crashed; `bail` names the cause when a kickflip was still turning on the landing (ROADMAP 41/42). */
  crash(bail: BailCause | null = null): void {
    this.entries.push({ kind: 'crash', bail });
  }

  /** A kickflip whose points were cut (airTrick with full false). */
  reducedKickflip(points: number): void {
    this.entries.push({ kind: 'reducedKickflip', points });
  }

  grindTrick(points: number): void {
    this.entries.push({ kind: 'grindTrick', points });
  }

  highFive(points: number): void {
    this.entries.push({ kind: 'highFive', points });
  }

  /** A fan crowd came on screen (crowdAhead). */
  crowdAhead(theme: CrowdTheme): void {
    this.entries.push({ kind: 'crowd', theme });
  }

  /** A new mission began (its goal shows in the HUD mission line). */
  missionStart(): void {
    this.entries.push({ kind: 'missionStart' });
  }

  /** The mission reached its goal; `points` is what gameplay paid for it. */
  missionDone(points: number): void {
    this.entries.push({ kind: 'missionDone', points });
  }

  /** The popups for everything since the last flush, in event order; then starts over. */
  flush(kidMode: boolean): readonly PopupSpec[] {
    const entries = this.entries;
    if (entries.length === 0) return NONE;
    this.entries = [];
    const out: PopupSpec[] = [];
    const t = texts().popups;
    const add = (text: string, color: string, icon: PopupSpec['icon'] = null) => out.push({ text, color, icon });
    entries.forEach((e, i) => {
      switch (e.kind) {
        case 'cleared': {
          const merge = entries.find((m) => (m.kind === 'stomp' || m.kind === 'ballHit') && m.entityId === e.entityId);
          if (merge) {
            const kind = merge.kind as keyof typeof MERGED_COLOR;
            add(`${t[kind]} ${plusPoints(e.points)}`, MERGED_COLOR[kind]);
          } else add(plusPoints(e.points), UI.white);
          break;
        }
        case 'stomp':
        case 'ballHit':
          if (!entries.some((c) => c.kind === 'cleared' && c.entityId === e.entityId)) add(t[e.kind], MERGED_COLOR[e.kind]);
          break;
        case 'used':
          if (e.action === 'throw') add(t.throw, UI.white);
          else if (e.action === 'drink' && !kidMode) add(t.drink, UI.yellow);
          else if (entries.some((h) => h.kind === 'healthGained')) add(`${t.eat} +1`, UI.pink, 'heart');
          // Gameplay scores the bonus right after itemUsed; the score before it may belong to a clear.
          else add(`${t.eat} ${bonus(entries[i + 1]) ?? bonus(entries[i - 1]) ?? t.eatPoints}`, UI.pink);
          break;
        case 'ballBack':
          add(t.ballBack, UI.red);
          break;
        case 'crash':
          add(e.bail ? t.bail[e.bail] : t.crash, UI.red);
          break;
        case 'grindTrick':
          add(`${t.boardslide} ${plusPoints(e.points)}`, UI.teal);
          break;
        case 'highFive':
          add(`${t.highFive} ${plusPoints(e.points)}`, UI.yellow);
          break;
        case 'reducedKickflip':
          add(`${t.kickflip} ${plusPoints(e.points)}`, UI.palePink);
          break;
        case 'star': {
          const own = entries[i + 1];
          const points = own?.kind === 'score' ? own.delta : 0;
          out.push(points > 0 ? { text: t.star, color: UI.yellow, icon: null, points } : { text: t.star, color: UI.yellow, icon: null });
          break;
        }
        case 'starArc':
          out.push({ text: t.starArc, color: UI.orange, icon: null, points: e.points });
          break;
        case 'crowd':
          add(t.crowd[e.theme], e.theme === 'vfb' ? UI.white : UI.orange);
          break;
        case 'missionStart':
          add(texts().missions.start, UI.teal);
          break;
        case 'missionDone':
          out.push({ text: texts().missions.done, color: UI.green, icon: null, points: e.points });
          break;
      }
    });
    return out;
  }
}

/** The bonus points of a score change right next to an eat (full health). */
function bonus(e: Entry | undefined): string | null {
  return e?.kind === 'score' && e.delta > 0 ? plusPoints(e.delta) : null;
}
