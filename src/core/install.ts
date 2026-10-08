import type { GameState } from '../types';
import type { Store } from './storage';

/** Where the install hint applies: Android / Chromium has a prompt API, iOS needs "Teilen -> Zum Home-Bildschirm". */
export type InstallPlatform = 'android' | 'ios' | 'other';

/** What the browser tells about the page at startup (Platform.installEnvironment). */
export interface InstallEnvironment {
  /** Running as the installed app (display-mode standalone, or navigator.standalone on iOS). */
  standalone: boolean;
  platform: InstallPlatform;
}

/** `state.install`: everything the ui needs for the install hint. Written by core only. */
export interface InstallState extends InstallEnvironment {
  /** A captured `beforeinstallprompt` is waiting; `commands.promptInstall()` shows it. */
  canPrompt: boolean;
  /** The browser reported `appinstalled` during this visit. */
  installed: boolean;
  /** Page loads so far, this one included (persisted, see VISITS_KEY). */
  visits: number;
  /** The player closed the hint with "×" (persisted, see INSTALL_HINT_DISMISSED_KEY). */
  dismissed: boolean;
}

/** The part of the `beforeinstallprompt` event core uses. */
export interface InstallPromptEvent {
  preventDefault(): void;
  prompt(): Promise<unknown> | unknown;
}

/** The browser facts detectInstallEnvironment reads (app.ts collects them). */
export interface BrowserFacts {
  userAgent: string;
  maxTouchPoints: number;
  /** matchMedia('(display-mode: standalone)').matches */
  displayModeStandalone: boolean;
  /** navigator.standalone (iOS Safari only) */
  navigatorStandalone: boolean | undefined;
}

export const VISITS_KEY = 'visits';
export const INSTALL_HINT_DISMISSED_KEY = 'installHintDismissed';

export function createInstallState(): InstallState {
  return { standalone: false, platform: 'other', canPrompt: false, installed: false, visits: 0, dismissed: false };
}

/** iPadOS reports a Mac desktop user agent; touch points tell it apart from a real Mac. */
export function detectInstallEnvironment(b: BrowserFacts): InstallEnvironment {
  const ios = /iPhone|iPad|iPod/.test(b.userAgent) || (/Macintosh/.test(b.userAgent) && b.maxTouchPoints > 1);
  const platform: InstallPlatform = ios ? 'ios' : /Android/i.test(b.userAgent) ? 'android' : 'other';
  return { standalone: b.displayModeStandalone || b.navigatorStandalone === true, platform };
}

/** Keeps `state.install` and the captured browser prompt; DOM-free (app.ts forwards the window events). */
export class InstallController {
  private promptEvent: InstallPromptEvent | null = null;

  constructor(
    private readonly state: GameState,
    private readonly store: Store,
  ) {}

  /** Once per page load: environment, visit count (incremented and saved), dismissed flag. */
  start(env: InstallEnvironment): void {
    const stored = this.store.get<unknown>(VISITS_KEY, 0);
    const visits = (typeof stored === 'number' && Number.isFinite(stored) ? stored : 0) + 1;
    this.store.set(VISITS_KEY, visits);
    Object.assign(this.state.install, env, {
      visits,
      dismissed: this.store.get<unknown>(INSTALL_HINT_DISMISSED_KEY, false) === true,
    });
  }

  /** `beforeinstallprompt`: keep the event for a later button press instead of the browser's own banner. */
  capturePrompt(e: InstallPromptEvent): void {
    e.preventDefault();
    this.promptEvent = e;
    this.state.install.canPrompt = true;
  }

  /** Withdraws a kept prompt without showing it. */
  dropPrompt(): void {
    this.promptEvent = null;
    this.state.install.canPrompt = false;
  }

  /** Shows the kept prompt (call inside a user gesture); a prompt can only be shown once. */
  promptInstall(): void {
    const e = this.promptEvent;
    if (!e) return;
    this.dropPrompt();
    const refused = () => {
      // The browser refused (e.g. no user gesture); the hint just stays without a button.
    };
    try {
      // Called synchronously, so it still runs inside the tap's user gesture.
      Promise.resolve(e.prompt()).catch(refused);
    } catch {
      refused();
    }
  }

  /** `appinstalled`: the app is on the home screen now. */
  appInstalled(): void {
    this.dropPrompt();
    this.state.install.installed = true;
  }

  /** "×" on the hint: never show it again. */
  dismiss(): void {
    this.state.install.dismissed = true;
    this.store.set(INSTALL_HINT_DISMISSED_KEY, true);
  }
}
