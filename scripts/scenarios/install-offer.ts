/**
 * The install offer (ROADMAP 68) end to end. The title never shows the
 * install card, also with a kept prompt; a calm game over (a run of 30 s or
 * more) does. On touch viewports (Android faked by simulateInstall) a real
 * tap on "App installieren" shows the prompt (promptsShown counts it), and a
 * synthetic `beforeinstallprompt` whose prompt() checks
 * `navigator.userActivation` proves the prompt now runs inside the user
 * gesture: the tap is the first activation of a freshly loaded page, the
 * press itself carries none on a touch, only its release. Without a kept
 * prompt the card opens the manual steps (Android, iOS, desktop), "×"
 * snoozes the card (store key installSnooze), and the settings menu has
 * "App installieren" in both cases. Nothing reaches the live worker.
 *   npm run playtest -- --scenario scripts/scenarios/install-offer.ts --viewports desktop,phone-landscape,phone-portrait --name install-offer
 */
import type { InstallPlatform, Rect } from '../../src/types';
import type { UiDebugHook } from '../../src/ui/debug';
import { dismissRotateHint, type PlaytestContext } from '../playtest-lib';

type UiWindow = Window & {
  __ui?: UiDebugHook;
  /** The synthetic prompt's calls: whether the page had transient user activation at each. */
  __promptCalls?: boolean[];
  /** Activation seen at each pointerdown (capture phase, before the game's own listener). */
  __downActivation?: boolean[];
};

const SNOOZE_KEY = 'cannstatt-cruiser:installSnooze';
/** Chromium's transient activation lasts ~5 s: wait it out so the next tap is the only gesture. */
const ACTIVATION_WINDOW_MS = 5500;

const centre = (r: Rect) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)] as const;
const ui = (t: PlaytestContext) => ({
  layout: () => t.page.evaluate(() => (window as UiWindow).__ui!.layout()),
  install: () => t.page.evaluate(() => (window as UiWindow).__ui!.install()),
  settings: () => t.page.evaluate(() => (window as UiWindow).__ui!.settings()),
});

async function tap(t: PlaytestContext, r: Rect): Promise<void> {
  await t.realTapView(...centre(r));
  await t.game.step(2);
}

/** A fresh title on `platform` (not installed, never snoozed), the clock frozen. */
async function freshTitle(t: PlaytestContext, platform: InstallPlatform, canPrompt: boolean): Promise<void> {
  await t.page.evaluate((k) => localStorage.removeItem(k), SNOOZE_KEY);
  await t.page.reload();
  await t.page.waitForFunction(() => Boolean(window.__game));
  await t.game.pause();
  await dismissRotateHint(t);
  await t.game.simulateInstall({ platform, visits: 2, canPrompt });
  await t.game.step(3);
}

/** A run of over 30 s (health kept up), then game over with its buttons live. */
async function calmGameOver(t: PlaytestContext): Promise<void> {
  await t.game.startRun();
  for (let i = 0; i < 10; i++) {
    await t.game.setHealth(99);
    await t.game.step(190);
  }
  await t.game.endRun();
  await t.game.step(60);
}

/** A beforeinstallprompt as Chromium sends it; its prompt() records whether the page had user activation. */
async function dispatchActivationCheckedPrompt(t: PlaytestContext): Promise<void> {
  await t.page.evaluate(() => {
    const w = window as UiWindow;
    w.__promptCalls = [];
    w.__downActivation = [];
    window.addEventListener('pointerdown', () => w.__downActivation!.push(navigator.userActivation.isActive), { capture: true });
    const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt(): Promise<void> };
    e.prompt = () => {
      w.__promptCalls!.push(navigator.userActivation.isActive);
      return navigator.userActivation.isActive ? Promise.resolve() : Promise.reject(new DOMException('needs a user gesture', 'NotAllowedError'));
    };
    window.dispatchEvent(e);
  });
}

async function titleHasNoCard(t: PlaytestContext, label: string): Promise<void> {
  const screen = (await ui(t).layout()).screen;
  t.check(`${label}: no install card on the title`, !!screen && screen.install === null && screen.dismiss === null, screen);
  await t.canvasShot(label);
}

/** Touch: the card on a calm game over, a real tap prompts (promptsShown), the next opens the steps, × snoozes. */
async function gameOverCard(t: PlaytestContext): Promise<void> {
  await freshTitle(t, 'android', true);
  await titleHasNoCard(t, 'title with a kept prompt');
  await t.game.startRun();
  await t.game.step(60);
  await t.game.endRun();
  await t.game.step(60);
  t.check('short run: no card', (await ui(t).layout()).screen?.install === null);
  await calmGameOver(t);
  const card = (await ui(t).layout()).screen!;
  t.check('calm game over: the card shows', card.install !== null && card.dismiss !== null, card);
  await t.canvasShot('game over with the install card');
  if (!card.install || !card.dismiss) return;
  await tap(t, card.install);
  t.check('a real tap on the card shows the prompt', (await t.game.promptsShown()) === 1, await t.game.promptsShown());
  t.check('still game over after the tap', (await t.game.state()).mode === 'gameover');
  await tap(t, card.install);
  t.check('no prompt left: the tap opens the manual steps', (await ui(t).install()).guideOpen);
  await t.canvasShot('manual steps android');
  await tap(t, (await ui(t).install()).guide.ok);
  t.check('OK closes the steps, game over again', !(await ui(t).install()).guideOpen && (await t.game.state()).mode === 'gameover');
  await tap(t, card.dismiss);
  const snooze = await t.page.evaluate((k) => localStorage.getItem(k), SNOOZE_KEY);
  t.check('× snoozes the card', (await ui(t).layout()).screen?.install === null && /"count":1/.test(snooze ?? ''), snooze);
  await t.canvasShot('game over after the snooze');
}

/** Touch: the first gesture of a fresh page is the tap on the card; the prompt runs with user activation. */
async function promptInsideGesture(t: PlaytestContext): Promise<void> {
  await freshTitle(t, 'android', false);
  await calmGameOver(t);
  await dispatchActivationCheckedPrompt(t);
  await t.game.step(1);
  t.check('the synthetic prompt is kept', (await t.game.state()).install.canPrompt);
  await t.wait(ACTIVATION_WINDOW_MS);
  const card = (await ui(t).layout()).screen!.install!;
  await tap(t, card);
  const calls = await t.page.evaluate(() => (window as UiWindow).__promptCalls!);
  const down = await t.page.evaluate(() => (window as UiWindow).__downActivation!);
  t.check('prompt() was called once, with user activation', calls.length === 1 && calls[0] === true, { calls, pointerdownActivation: down });
  await t.log('prompt inside the gesture', { calls, pointerdownActivation: down });
}

/** The settings entry: the manual steps per platform (prompt-less), a screenshot of the menu and of each guide. */
async function settingsEntry(t: PlaytestContext, platform: InstallPlatform): Promise<void> {
  await freshTitle(t, platform, false);
  const gear = (await ui(t).layout()).screen?.settings;
  t.check(`${platform}: the gear shows`, !!gear);
  if (!gear) return;
  await tap(t, gear);
  const menu = (await ui(t).layout()).menu;
  t.check(`${platform}: settings offer "App installieren"`, menu.install !== null, menu);
  await t.canvasShot(`settings ${platform}`);
  if (!menu.install) return;
  await tap(t, menu.install);
  t.check(`${platform}: the entry opens the manual steps`, (await ui(t).install()).guideOpen);
  await t.canvasShot(`manual steps from settings ${platform}`);
  await tap(t, (await ui(t).install()).guide.ok);
  t.check(`${platform}: OK goes back to the settings`, !(await ui(t).install()).guideOpen && (await ui(t).settings()).screen === 'menu');
}

export default async function installOffer(t: PlaytestContext): Promise<void> {
  if (t.viewport.touch) {
    await gameOverCard(t);
    await promptInsideGesture(t);
    await settingsEntry(t, 'android');
    await settingsEntry(t, 'ios');
  } else {
    await freshTitle(t, 'other', true);
    await titleHasNoCard(t, 'desktop title');
    await calmGameOver(t);
    t.check('desktop: no card on game over', (await ui(t).layout()).screen?.install === null);
    await settingsEntry(t, 'other');
  }
}
