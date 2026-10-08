/**
 * Item use in the UI: the key hints on the title and pause screens, the item
 * control while carrying (desktop: the "E" chip next to the stats plate;
 * touch: the big item button, whose real tap must not jump), every carried
 * item, the merged item popups ("Prost! Gluck gluck gluck", "Lecker! +1",
 * "Stomp! +150", "Treffer! +200", "Achtung, der Ball!", "Grind-Trick!"), the
 * drunk look from easing in to easing out, and kid mode, which never shows it.
 * On touch it also shows the first-catch hint once the zone banner is gone.
 *   npm run playtest -- --scenario scripts/scenarios/items-ui.ts --viewports desktop,phone-landscape,phone-portrait --name items-ui
 */
import type {} from '../../src/player/debug'; // window.__player
import type {} from '../../src/gameplay/debug'; // window.__gameplay
import type {} from '../../src/ui/debug'; // window.__ui
import { TICK_DT } from '../../src/core/config';
import { BANNER_TIME } from '../../src/ui/banner';
import { itemButtonRect } from '../../src/ui/item-button';
import { dismissRotateHint, type PlaytestContext } from '../playtest-lib';

/** Drunk timer values (of DRUNK_DURATION 6 s) and what they show. */
const DRUNK_STAGES = [
  [5.75, 'drunk easing in'],
  [4, 'drunk 1'],
  [3.6, 'drunk 2'],
  [0.4, 'drunk ending'],
] as const;

export default async function itemsUi(t: PlaytestContext): Promise<void> {
  const { game, page } = t;
  await game.pause();
  await dismissRotateHint(t);
  const display = await game.display();
  await game.step(2);
  await t.canvasShot('title hints');
  await game.seed(3);
  await game.startRun();
  await game.step(30);
  // An empty street, so no crash takes the item out of the hands before the tap.
  await page.evaluate(() => window.__gameplay!.clear());
  await page.evaluate(() => window.__ui!.carry('beer'));
  await game.step(2);
  await t.canvasShot('carrying beer');
  await t.screenshot('carrying beer page');

  if (display.touch) {
    // The first-catch hint waits while the zone banner shows, then appears next to the button.
    await game.step(Math.ceil(BANNER_TIME / TICK_DT));
    await t.screenshot('first catch hint page');
    const r = itemButtonRect(display.viewWidth, display);
    const since = (await game.state()).frame;
    await game.resume();
    await t.realTapView(r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2));
    await t.wait(150);
    await game.pause();
    const jumps = await game.eventsSince(since, 'jump');
    const used = await game.eventsSince(since, 'itemUsed');
    t.check('item button tap uses the item and does not jump', jumps.length === 0 && used.length === 1, { jumps, used });
  }

  for (const item of ['football', 'pretzel', 'gingerbread'] as const) {
    await page.evaluate((i) => window.__ui!.carry(i), item);
    await game.step(1);
    await t.canvasShot(`carrying ${item}`);
  }
  await page.evaluate(() => window.__ui!.carry(null));

  const popups = [['drink'], ['eat', 'stomp'], ['hit', 'back', 'trick']] as const;
  for (const kinds of popups) {
    await page.evaluate((k) => window.__ui!.itemPopups(...k), kinds);
    await game.step(8);
    await t.canvasShot(`popup ${kinds.join(' ')}`);
    await game.step(60);
  }

  for (const [timer, label] of DRUNK_STAGES) {
    await page.evaluate((x) => window.__game!.setDrunk(x), timer);
    await game.step(17);
    await t.canvasShot(label);
  }
  await page.evaluate(() => window.__game!.setDrunk(0));

  if (!display.touch) {
    await game.pauseGame();
    await game.step(2);
    await t.canvasShot('pause hints');
    await game.resumeGame();
  }

  await page.evaluate(() => window.__player!.kidMode(true));
  await page.evaluate(() => window.__game!.setDrunk(3));
  await game.step(45);
  const s = await game.state();
  await t.canvasShot('kid mode with drunk timer (no drunk look)');
  t.check('kid mode is on', s.kidMode, { kidMode: s.kidMode });
  await page.evaluate(() => {
    window.__game!.setDrunk(0);
    window.__player!.kidMode(false);
  });
}
