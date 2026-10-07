/**
 * PLACEHOLDER owned by the ui slice: German title, HUD, pause and game-over
 * text with the pixel font, plus a pause hotspot. Replace freely, keeping the factory name.
 */
import { VIEW_H, VIEW_W } from '../core/config';
import { drawText } from '../core/font';
import type { Rect, RenderContext, System } from '../types';

const PAUSE_BUTTON: Rect = { x: VIEW_W - 18, y: 4, w: 14, h: 14 };
const SHADOW = '#1b1f2e';

function centred(r: RenderContext, text: string, y: number, scale = 1, color = '#ffffff'): void {
  drawText(r.g, text, VIEW_W / 2, y, { align: 'center', scale, color, shadow: SHADOW });
}

function dim(r: RenderContext): void {
  r.g.fillStyle = 'rgba(16, 18, 30, 0.6)';
  r.g.fillRect(0, 0, VIEW_W, VIEW_H);
}

export function createUiSystem(): System {
  return {
    name: 'ui',

    init(ctx) {
      ctx.addHotspot({
        rect: () => (ctx.state.mode === 'playing' ? PAUSE_BUTTON : null),
        onPress: () => ctx.commands.pause(),
      });
      ctx.addHotspot({
        rect: () => (ctx.state.mode === 'paused' ? { x: 0, y: 0, w: VIEW_W, h: VIEW_H } : null),
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
            g.fillStyle = 'rgba(0,0,0,0.35)';
            g.fillRect(PAUSE_BUTTON.x, PAUSE_BUTTON.y, PAUSE_BUTTON.w, PAUSE_BUTTON.h);
            g.fillStyle = '#ffffff';
            g.fillRect(PAUSE_BUTTON.x + 4, PAUSE_BUTTON.y + 3, 2, 8);
            g.fillRect(PAUSE_BUTTON.x + 8, PAUSE_BUTTON.y + 3, 2, 8);
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
          g.fillRect(0, VIEW_H / 2 - 14, VIEW_W, 28);
          centred(r, 'Bitte Gerät drehen', VIEW_H / 2 - 4, 1, '#ffd23f');
        }
      },
    },
  };
}
