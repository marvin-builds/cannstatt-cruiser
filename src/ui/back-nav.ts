/**
 * Android back (ROADMAP 75): in the installed app the back button or gesture
 * would close the app. While anything but the title is open (a dialog, a
 * sheet, a menu screen, a run) the game keeps exactly one extra history entry
 * on top of the page's own; a back press pops it (popstate), the game goes one
 * level back (backStep) and pushes the entry again if something is still open.
 * When the ui closes everything by itself, the entry is removed with
 * history.back(), whose popstate is not a back press. On the title there is no
 * extra entry, so back may leave the app. The browser's history comes in as a
 * HistoryEnv (browserHistoryEnv), tests pass a fake.
 */
import { type ScreenSource, type UiScreen, uiScreen } from './rotate-screen';

export interface HistoryEnv {
  /** The current entry is the game's own extra one (a reload keeps it). */
  onOurEntry(): boolean;
  /** Adds the extra entry on top (same URL). */
  push(): void;
  /** Leaves the extra entry (history.back()); its popstate follows later. */
  back(): void;
  /** Listens to popstate. */
  onPop(listener: () => void): void;
}

/** The state object that marks the game's extra entry. */
const MARK = 'cannstatt-cruiser:back';

export function browserHistoryEnv(): HistoryEnv {
  return {
    onOurEntry: () => (history.state as { [MARK]?: boolean } | null)?.[MARK] === true,
    push: () => history.pushState({ [MARK]: true }, ''),
    back: () => history.back(),
    onPop: (listener) => window.addEventListener('popstate', listener),
  };
}

export class BackNav {
  /** none: no extra entry; pushed: it is on top; popping: the game's own history.back() is under way. */
  private entry: 'none' | 'pushed' | 'popping';

  constructor(
    private readonly env: HistoryEnv,
    private readonly onBack: () => void,
  ) {
    this.entry = env.onOurEntry() ? 'pushed' : 'none';
    env.onPop(() => this.popped());
  }

  /** Every tick, with whether back has a level to go back to in the game. */
  update(open: boolean): void {
    if (open && this.entry === 'none') {
      this.env.push();
      this.entry = 'pushed';
    } else if (!open && this.entry === 'pushed') {
      this.entry = 'popping';
      this.env.back();
    }
  }

  private popped(): void {
    if (this.entry === 'popping') this.entry = 'none';
    else if (this.entry === 'pushed') {
      this.entry = 'none';
      this.onBack();
    }
  }
}

/**
 * What a back press does on each screen (rotate-screen.ts uiScreen, the top-most one): close it (install
 * steps, settings, the feedback dialog's page, the online list or name entry, "Neu in dieser Version"),
 * pause a run, keep the pause screen (leaving a run takes "Zum Startbildschirm"), go from game over to
 * the title; null on the title.
 */
export type BackStep = 'installGuide' | 'settings' | 'feedback' | 'scores' | 'whatsNew' | 'pause' | 'stay' | 'title';

const SCREEN_STEP: Record<UiScreen, BackStep | null> = {
  title: null,
  run: 'pause',
  pause: 'stay',
  gameOver: 'title',
  scores: 'scores',
  nameEntry: 'scores',
  settings: 'settings',
  installGuide: 'installGuide',
  whatsNew: 'whatsNew',
  feedback: 'feedback',
};

export function backStep(s: ScreenSource): BackStep | null {
  return SCREEN_STEP[uiScreen(s)];
}
