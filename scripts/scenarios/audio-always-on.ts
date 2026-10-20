/**
 * Sound stays on while the speaker button says so (ROADMAP 63): the first real
 * input starts the run and the AudioContext ends 'running' with a non-zero
 * master gain; muting silences, unmuting restores; a context the browser
 * suspends comes back on its own or with the next gesture, without toggling
 * mute. The first input is a key on `desktop`, a mouse click on `laptop` and a
 * touch on the phone viewports (read from `window.__audio`, no real sound).
 *
 * On `desktop` it also starts the game in Playwright Firefox with Web Audio
 * autoplay blocked (ROADMAP 91), once per first gesture: a key that grants no
 * user activation (like Shift or Esc in Firefox) and then Space, a click, and
 * Enter. Each must end with the context running and the gain from the speaker
 * button, without toggling mute. Firefox: `npx playwright install firefox`.
 *
 *   npm run playtest -- --scenario scripts/scenarios/audio-always-on.ts --name audio-always-on
 */
import { firefox, type Page } from 'playwright';
import type { AudioDebug } from '../../src/audio/debug';
import { MASTER_GAIN } from '../../src/audio/sounds';
import { blockLiveWorkerEverywhere, dismissRotateHint, join, type PlaytestContext } from '../playtest-lib';

type AudioWindow = Window & { __audio?: AudioDebug; __contexts?: AudioContext[] };

const audio = (t: PlaytestContext) =>
  t.page.evaluate(() => {
    const a = (window as AudioWindow).__audio;
    return { status: a?.status() ?? 'missing', gain: a?.gain() ?? null };
  });

/** Keeps every AudioContext the game creates, so the scenario can suspend it like a browser would. */
const recordContexts = (t: PlaytestContext) =>
  // A string, so the bundler's name helpers stay out of the page.
  t.page.evaluate(`(() => {
    const Base = window.AudioContext;
    window.__contexts = [];
    window.AudioContext = class extends Base {
      constructor(options) {
        super(options);
        window.__contexts.push(this);
      }
    };
  })()`);

async function firstInput(t: PlaytestContext): Promise<string> {
  if (t.viewport.touch) {
    await t.realPress(80);
    return 'touch';
  }
  if (t.viewport.name === 'laptop') {
    const d = await t.game.display();
    await t.realTapView(Math.floor(d.viewWidth / 2), 90, 80);
    return 'click';
  }
  await t.realPress(80);
  return 'key';
}

const on = (s: { status: string; gain: number | null }) => s.status === 'running' && (s.gain ?? 0) > 0;

export default async function audioAlwaysOn(t: PlaytestContext): Promise<void> {
  await recordContexts(t);
  t.check('audio locked before the first input', (await audio(t)).status === 'locked', await audio(t));
  await dismissRotateHint(t); // a tap on phone portrait: that touch is the first gesture there

  const input = await firstInput(t);
  await t.wait(300);
  const started = await audio(t);
  t.check(`${input} start: context running, gain on`, on(started), started);
  await t.log(`${input} start`, started);
  await t.canvasShot(`started-by-${input}`);

  await t.page.keyboard.press('m');
  await t.wait(300);
  const muted = await audio(t);
  t.check('mute silences (gain 0)', muted.status === 'running' && muted.gain === 0, muted);
  await t.page.keyboard.press('m');
  await t.wait(300);
  const unmuted = await audio(t);
  t.check('unmute restores the gain', on(unmuted), unmuted);

  // The browser stops the context (device change, interruption): it comes back without a mute toggle.
  await t.page.evaluate(() => (window as AudioWindow).__contexts?.[0]?.suspend());
  await t.wait(300);
  let back = await audio(t);
  t.check('suspended context resumes by itself (statechange)', on(back), back);
  if (!on(back)) {
    await t.realPress(40);
    await t.wait(300);
    back = await audio(t);
  }
  t.check('suspended context runs again with sound on', on(back), back);

  // Hidden and shown again: still running with the gain from the button.
  await t.page.evaluate(`(() => {
    const show = (state) => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      document.dispatchEvent(new Event('visibilitychange'));
    };
    show('hidden');
    show('visible');
  })()`);
  await t.wait(300);
  const visible = await audio(t);
  t.check('visibility return keeps sound on', on(visible), visible);
  await t.log('end', { back, visible });
  await t.canvasShot('end');

  if (t.viewport.name === 'desktop') await firefoxStarts(t);
}

/** Firefox prefs of a strict autoplay policy: Web Audio waits for (sticky) user activation. */
const FIREFOX_AUTOPLAY_BLOCKED = { 'media.autoplay.default': 1, 'media.autoplay.block-webaudio': true, 'media.autoplay.blocking_policy': 0 };

interface FirstGesture {
  name: string;
  /** A key the page dispatches itself first: an untrusted event grants no user activation, like Shift or Esc in Firefox. */
  inactiveKey?: string;
  /** The real input after it. */
  press(page: Page): Promise<void>;
}

const FIREFOX_STARTS: FirstGesture[] = [
  { name: 'shift-then-space', inactiveKey: 'ShiftLeft', press: (page) => page.keyboard.press('Space') },
  { name: 'escape-then-space', inactiveKey: 'Escape', press: (page) => page.keyboard.press('Space') },
  { name: 'click', press: (page) => page.mouse.click(640, 360) },
  { name: 'enter', press: (page) => page.keyboard.press('Enter') },
];

/**
 * Runs in the page before the game (a string, so the bundler's name helpers stay out of the page):
 * dispatches the inactive key once the game is up and notes the audio status long after the
 * timed resume retries. No page.evaluate may run before the real input, since Playwright's
 * evaluate gives the page user activation.
 */
const firefoxProbe = (inactiveKey: string | null) => `(() => {
  window.__probe = [];
  const key = ${JSON.stringify(inactiveKey)};
  if (!key) return;
  const fire = () => {
    if (!window.__game) return void setTimeout(fire, 50);
    for (const type of ['keydown', 'keyup']) window.dispatchEvent(new KeyboardEvent(type, { code: key, key }));
    setTimeout(() => window.__probe.push(window.__audio.status() + ' hasBeenActive=' + navigator.userActivation.hasBeenActive), 1500);
  };
  setTimeout(fire, 300);
})()`;

async function firefoxStarts(t: PlaytestContext): Promise<void> {
  const browser = await firefox.launch({ firefoxUserPrefs: FIREFOX_AUTOPLAY_BLOCKED });
  blockLiveWorkerEverywhere(browser);
  try {
    for (const start of FIREFOX_STARTS) {
      const context = await browser.newContext({ locale: 'de-DE', viewport: { width: 1280, height: 720 } });
      const page = await context.newPage();
      await page.addInitScript(firefoxProbe(start.inactiveKey ?? null));
      await page.goto(t.page.url());
      await page.waitForTimeout(3000);
      await start.press(page);
      await page.waitForTimeout(600);
      const after = await firefoxAudio(page);
      // The inactive key created the context, but Firefox kept it suspended (its resume never settled).
      const blocked = start.inactiveKey ? after.probe[0] : null;
      if (start.inactiveKey) t.check(`firefox ${start.name}: blocked before the real input`, blocked === 'suspended hasBeenActive=false', after.probe);
      const ok = after.status === 'running' && !after.muted && Math.abs((after.gain ?? 0) - MASTER_GAIN) < 0.01;
      t.check(`firefox ${start.name}: context running, gain matches the speaker button`, ok, after);
      await t.log(`firefox ${start.name}`, { blocked, after });
      await page.screenshot({ path: join(t.outDir, `firefox-${start.name}.png`) });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

const firefoxAudio = (page: Page) =>
  page.evaluate(() => {
    const w = window as AudioWindow & { __probe?: string[] };
    const a = w.__audio;
    return {
      status: a?.status() ?? 'missing',
      gain: a?.gain() ?? null,
      muted: window.__game?.state().muted ?? null,
      probe: w.__probe ?? [],
    };
  });
