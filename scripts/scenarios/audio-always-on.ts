/**
 * Sound stays on while the speaker button says so (ROADMAP 63): the first real
 * input starts the run and the AudioContext ends 'running' with a non-zero
 * master gain; muting silences, unmuting restores; a context the browser
 * suspends comes back on its own or with the next gesture, without toggling
 * mute. The first input is a key on `desktop`, a mouse click on `laptop` and a
 * touch on the phone viewports (read from `window.__audio`, no real sound).
 *
 *   npm run playtest -- --scenario scripts/scenarios/audio-always-on.ts --name audio-always-on
 */
import type { AudioDebug } from '../../src/audio/debug';
import { dismissRotateHint, type PlaytestContext } from '../playtest-lib';

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
}
