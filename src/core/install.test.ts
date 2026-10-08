import { describe, expect, it, vi } from 'vitest';
import {
  detectInstallEnvironment,
  INSTALL_HINT_DISMISSED_KEY,
  InstallController,
  type InstallPromptEvent,
  VISITS_KEY,
} from './install';
import { createInitialState } from './state';
import { createMemoryStore } from './storage';

const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
  ipadDesktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
  android: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36',
};

const browser = (userAgent: string, maxTouchPoints = 0) => ({
  userAgent,
  maxTouchPoints,
  displayModeStandalone: false,
  navigatorStandalone: undefined,
});

function fakePrompt() {
  return {
    preventDefault: vi.fn<() => void>(),
    prompt: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  } satisfies InstallPromptEvent;
}

function setup(store = createMemoryStore()) {
  const state = createInitialState();
  const install = new InstallController(state, store);
  install.start({ standalone: false, platform: 'android' });
  return { state, store, install };
}

describe('detectInstallEnvironment', () => {
  it('detects iPhone and iPad (also with the desktop user agent of iPadOS)', () => {
    expect(detectInstallEnvironment(browser(UA.iphone, 5)).platform).toBe('ios');
    expect(detectInstallEnvironment(browser(UA.ipadDesktop, 5)).platform).toBe('ios');
  });

  it('keeps a real Mac (no touch points) as other', () => {
    expect(detectInstallEnvironment(browser(UA.ipadDesktop, 0)).platform).toBe('other');
  });

  it('detects Android and treats desktops as other', () => {
    expect(detectInstallEnvironment(browser(UA.android, 5)).platform).toBe('android');
    expect(detectInstallEnvironment(browser(UA.desktop)).platform).toBe('other');
  });

  it('is standalone in display-mode standalone or with navigator.standalone (iOS)', () => {
    expect(detectInstallEnvironment(browser(UA.android)).standalone).toBe(false);
    expect(detectInstallEnvironment({ ...browser(UA.android), displayModeStandalone: true }).standalone).toBe(true);
    expect(detectInstallEnvironment({ ...browser(UA.iphone, 5), navigatorStandalone: true }).standalone).toBe(true);
  });
});

describe('InstallController', () => {
  it('fills state.install from the environment at start', () => {
    const { state } = setup();
    expect(state.install).toEqual({
      standalone: false,
      platform: 'android',
      canPrompt: false,
      installed: false,
      visits: 1,
      dismissed: false,
    });
  });

  it('counts one visit per start and persists the count', () => {
    const store = createMemoryStore();
    setup(store);
    setup(store);
    const { state } = setup(store);
    expect(state.install.visits).toBe(3);
    expect(store.get(VISITS_KEY, 0)).toBe(3);
  });

  it('treats a junk visit count as no visits', () => {
    const store = createMemoryStore();
    store.set(VISITS_KEY, 'lots');
    expect(setup(store).state.install.visits).toBe(1);
  });

  it('keeps the browser install prompt and offers it', () => {
    const { state, install } = setup();
    const e = fakePrompt();
    install.capturePrompt(e);
    expect(e.preventDefault).toHaveBeenCalledOnce();
    expect(state.install.canPrompt).toBe(true);
  });

  it('shows the kept prompt once and clears canPrompt', () => {
    const { state, install } = setup();
    const e = fakePrompt();
    install.capturePrompt(e);
    install.promptInstall();
    install.promptInstall();
    expect(e.prompt).toHaveBeenCalledOnce();
    expect(state.install.canPrompt).toBe(false);
  });

  it('ignores promptInstall without a kept prompt', () => {
    const { install } = setup();
    expect(() => install.promptInstall()).not.toThrow();
  });

  it('swallows a failing prompt', async () => {
    const { install } = setup();
    const e = fakePrompt();
    e.prompt.mockImplementation(() => Promise.reject(new Error('already shown')));
    install.capturePrompt(e);
    install.promptInstall();
    await Promise.resolve();
  });

  it('marks the app as installed and drops the prompt on appinstalled', () => {
    const { state, install } = setup();
    const e = fakePrompt();
    install.capturePrompt(e);
    install.appInstalled();
    expect(state.install).toMatchObject({ installed: true, canPrompt: false });
    install.promptInstall();
    expect(e.prompt).not.toHaveBeenCalled();
  });

  it('dismisses the hint for good', () => {
    const store = createMemoryStore();
    const { state, install } = setup(store);
    install.dismiss();
    expect(state.install.dismissed).toBe(true);
    expect(store.get(INSTALL_HINT_DISMISSED_KEY, false)).toBe(true);
    expect(setup(store).state.install.dismissed).toBe(true);
  });
});
