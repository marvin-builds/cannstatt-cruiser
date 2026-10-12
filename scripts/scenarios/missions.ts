/**
 * Missions in the ui (ROADMAP 52 point 11): the HUD mission line under the
 * stats plate, the "Neue Mission!" / "Mission geschafft! +N" popups and the
 * missions row on game over, in German and English. The mission is set and
 * finished through the ui test hook (`window.__ui.startMission`,
 * `missionProgress`, `finishMission`), which sets state.mission and emits the
 * events like gameplay; the street is cleared so the HUD shows plainly. The
 * online list is a Playwright route (nothing reaches the live worker).
 *
 * Per language: a stomp mission just started (popup), its progress, the
 * widest goal (stunt lines) under a plate grown by the drunk timer row while
 * carrying an item (in portrait the line steps right of the item button),
 * the mission done popup, and the game over with "Missionen: 1".
 * Checks: the line's plate overlaps no HUD button or the item button, stays
 * in the view, and is gone on pause and after the mission is done (it also
 * waits while the zone banner shows: unit tests).
 *   npm run playtest -- --scenario scripts/scenarios/missions.ts --viewports desktop,phone-landscape,phone-portrait --name missions
 */
import { SCORES_URL } from '../../src/net/api';
import type { Rect } from '../../src/types';
import { dismissRotateHint, type PlaytestContext } from '../playtest-lib';

/** Ticks ridden after the run starts: the zone banner (2.4 s) is gone. */
const BANNER_GONE_TICKS = 160;
/** Ticks after an event for the popup shot (the popup has risen a little). */
const POPUP_TICKS = 12;

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const layout = (t: PlaytestContext) => t.page.evaluate(() => window.__ui!.layout());

async function freshRun(t: PlaytestContext, lang: 'de' | 'en'): Promise<void> {
  await t.page.evaluate((l) => localStorage.setItem('cannstatt-cruiser:language', JSON.stringify(l)), lang);
  await t.page.reload();
  await t.page.waitForFunction(() => Boolean(window.__game));
  await t.game.pause();
  await t.game.step(2);
  await dismissRotateHint(t);
  await t.game.seed(7);
  await t.game.startRun();
  await t.page.evaluate(() => window.__player!.kidMode(false));
  await t.game.step(BANNER_GONE_TICKS);
  await t.page.evaluate(() => window.__gameplay!.clear());
  await t.game.step(1);
}

/** The mission plate keeps clear of the HUD buttons and the item button (while shown). */
async function checkClear(t: PlaytestContext, label: string, carrying: boolean): Promise<void> {
  const l = await layout(t);
  const view = await t.game.display();
  const plate = l.mission;
  t.check(`${label}: mission line shows`, plate !== null, l);
  if (!plate) return;
  const blocked: Rect[] = [l.hud.pause, l.hud.mute, ...(l.hud.fullscreen ? [l.hud.fullscreen] : [])];
  if (carrying && view.touch) blocked.push(l.itemButton);
  for (const b of blocked) t.check(`${label}: line clear of ${JSON.stringify(b)}`, !overlaps(plate, b), plate);
  t.check(`${label}: line inside the view`, plate.x >= 0 && plate.x + plate.w <= view.viewWidth, plate);
}

export default async function missions(t: PlaytestContext): Promise<void> {
  await t.page.route(`${SCORES_URL}/**`, (route) => {
    const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' };
    return route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers }) : route.fulfill({ headers, json: { entries: [] } });
  });
  for (const lang of ['de', 'en'] as const) {
    await freshRun(t, lang);
    await t.page.evaluate(() => window.__ui!.startMission('stomp', 3));
    await t.game.step(POPUP_TICKS);
    await t.canvasShot(`${lang} new mission`);
    await checkClear(t, `${lang} stomp`, false);

    await t.page.evaluate(() => window.__ui!.missionProgress(1));
    await t.game.step(60);
    await t.canvasShot(`${lang} stomp 1 of 3`);

    // The widest goal under a taller plate (drunk timer row), carrying an item.
    await t.page.evaluate(() => {
      window.__ui!.startMission('stuntLine', 3);
      window.__ui!.missionProgress(2);
      window.__ui!.carry('pretzel');
    });
    await t.page.evaluate((s) => window.__game!.setDrunk(s), 6);
    await t.game.step(60);
    await t.canvasShot(`${lang} stunt lines tall plate carrying`);
    await checkClear(t, `${lang} stunt lines`, true);
    await t.page.evaluate((s) => window.__game!.setDrunk(s), 0);
    await t.page.evaluate(() => window.__ui!.carry(null));

    await t.page.evaluate(() => {
      window.__ui!.startMission('grind', 4);
      window.__ui!.missionProgress(2);
    });
    await t.game.step(60);
    await t.canvasShot(`${lang} grind 2 of 4`);

    await t.game.pauseGame();
    await t.game.step(2);
    t.check(`${lang}: no mission line on the pause screen`, (await layout(t)).mission === null);
    await t.game.resumeGame();
    await t.game.step(2);

    await t.page.evaluate(() => window.__ui!.finishMission(500));
    await t.game.step(POPUP_TICKS);
    await t.canvasShot(`${lang} mission done`);
    const s = await t.game.state();
    t.check(`${lang}: mission done clears the line`, s.mission === null && (await layout(t)).mission === null, s.mission);
    await t.log(`${lang} missions done`, { missionsDone: s.missionsDone });

    await t.game.endRun();
    await t.game.step(90);
    await t.canvasShot(`${lang} game over`);
  }
}
