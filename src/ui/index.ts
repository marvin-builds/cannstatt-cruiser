/**
 * PLACEHOLDER owned by the ui slice: German title, HUD, pause and game-over
 * text with the pixel font, plus a pause hotspot. Replace freely, keeping the factory name.
 */
import { drawText } from '../core/font';
import type { DisplayInfo, Rect, RenderContext, System } from '../types';

const SHADOW = '#1b1f2e';

/** Anchored to the right edge of the (adaptive-width) view. */
function pauseButton(display: DisplayInfo): Rect {
  return { x: display.viewWidth - 18, y: 4, w: 14, h: 14 };
}

function fullView(display: DisplayInfo): Rect {
  return { x: 0, y: 0, w: display.viewWidth, h: display.viewHeight };
}

function centred(r: RenderContext, text: string, y: number, scale = 1, color = '#ffffff'): void {
  drawText(r.g, text, Math.floor(r.display.viewWidth / 2), y, { align: 'center', scale, color, shadow: SHADOW });
}

function dim(r: RenderContext): void {
  const v = fullView(r.display);
  r.g.fillStyle = 'rgba(16, 18, 30, 0.6)';
  r.g.fillRect(v.x, v.y, v.w, v.h);
}

export function createUiSystem(): System {
  return {
    name: 'ui',

    init(ctx) {
      ctx.addHotspot({
        rect: () => (ctx.state.mode === 'playing' ? pauseButton(ctx.display) : null),
        onPress: () => ctx.commands.pause(),
      });
      ctx.addHotspot({
        rect: () => (ctx.state.mode === 'paused' ? fullView(ctx.display) : null),
        onPress: () => ctx.commands.resume(),
      });
    },

    render: {
      ui(r) {
        const { g, state, display } = r;
        const hint = display.touch ? 'Tippen' : 'Tippen oder Leertaste';
        switch (state.mode) {
          case 'title':
            centred(r, 'Cannstatt Cruiser', 40, 2, '#ffd23f');
            centred(r, `${hint} zum Starten`, 80);
            centred(r, 'Grüße aus Stuttgart – viel Spaß!', 96, 1, '#dfe8ff');
            break;
          case 'playing': {
            drawText(g, `Punkte ${state.score}`, 4, 4, { shadow: SHADOW });
            drawText(g, `Sterne ${state.stars}`, 4, 14, { shadow: SHADOW });
            for (let i = 0; i < state.maxHealth; i++) {
              g.fillStyle = i < state.health ? '#e84855' : '#4a4a55';
              g.fillRect(4 + i * 7, 26, 6, 4);
            }
            const button = pauseButton(display);
            g.fillStyle = 'rgba(0,0,0,0.35)';
            g.fillRect(button.x, button.y, button.w, button.h);
            g.fillStyle = '#ffffff';
            g.fillRect(button.x + 4, button.y + 3, 2, 8);
            g.fillRect(button.x + 8, button.y + 3, 2, 8);
            break;
          }
          case 'paused':
            dim(r);
            centred(r, 'Pause', 60, 2);
            centred(r, display.touch ? 'Tippen zum Weiterfahren' : 'P drücken zum Weiterfahren', 90);
            break;
          case 'gameover':
            dim(r);
            centred(r, 'Spiel vorbei', 50, 2, '#e84855');
            centred(r, `Punkte: ${state.score}   Sterne: ${state.stars}`, 80);
            centred(r, `${hint} für eine neue Runde`, 96);
            break;
        }
        if (display.portrait) {
          g.fillStyle = 'rgba(16, 18, 30, 0.85)';
          const mid = Math.floor(display.viewHeight / 2);
          g.fillRect(0, mid - 14, display.viewWidth, 28);
          centred(r, 'Bitte Gerät drehen', mid - 4, 1, '#ffd23f');
        }
      },
    },
  };
}
