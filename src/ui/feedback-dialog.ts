/**
 * The feedback dialog's wiring (ROADMAP 50, 58, 70): the flow
 * (feedback-flow.ts) on the canvas with the native textarea
 * (feedback-field.ts), or in portrait on the full-screen sheet
 * (feedback-sheet.ts), its hotspots and keys, the scrolling of its pages
 * (drag and wheel through list-scroll.ts, keys here) and the status check of
 * the own reports when the title shows (adult mode only). index.ts creates it
 * when there is a feedback sender and calls it every tick.
 *
 * Keys on the canvas: Esc goes back a page (from "Wirklich löschen?" to the
 * report) or closes; on the form other keys type into the field; on the list
 * and the text pages the arrow keys (and W / S), Page Up / Down, Home and End
 * scroll. M always mutes.
 */
import type { InputHotspot } from '../core/game';
import type { FeedbackContext } from '../net/feedback';
import type { FeedbackInboxLike } from '../net/feedback-status';
import type { GameContext, Rect } from '../types';
import type { FeedbackField } from './feedback-field';
import { FeedbackFlow, type FeedbackTab } from './feedback-flow';
import { type FeedbackLayout, feedbackLayout } from './feedback-layout';
import { listRowRect, type PageLayout, pageLayout, pageMaxScroll } from './feedback-page-layout';
import { feedbackPlaceholder } from './feedback-screen';
import type { FeedbackSheet, FeedbackSheetHandlers } from './feedback-sheet';
import type { FeedbackSenderLike } from '../net/feedback';
import { FormSurface } from './form-surface';
import { EVERYWHERE } from './layout';
import { bindListScroll } from './list-scroll';
import { feedbackSheetModel, sheetShown } from './portrait-sheets';
import type { SheetFactory } from './sheet-dom';
import { MAX_STATUS_ITEMS } from '../net/feedback-types';
import { pageScroll, scrollDirection } from './whats-new';

/** Held arrow keys scroll this many text rows per second. */
const KEY_ROWS_PER_SECOND = 10;
/** A press on a list row opens it unless the list was dragged at least this far (view px) meanwhile. */
const DRAG_SLOP = 3;

export interface FeedbackDialogOptions {
  sender: FeedbackSenderLike;
  /** The reports sent from this device ("Mein Feedback"); null = an empty list and no checks. */
  inbox: FeedbackInboxLike | null;
  /** The canvas form's native textarea; null = none (typing then goes nowhere). */
  field: (handlers: { onInput(v: string): void; onCancel(): void }) => FeedbackField | null;
  /** The portrait sheet; null = the canvas form in portrait too. */
  sheet: SheetFactory<FeedbackSheetHandlers, FeedbackSheet> | null;
  /** Drag and wheel scrolling of the canvas pages (a browser). */
  bindScroll: boolean;
  /** The rotate hint covers everything now (the dialog then hides). */
  covered: () => boolean;
}

export class FeedbackDialog {
  readonly flow: FeedbackFlow;
  private readonly field: FeedbackField | null;
  private readonly sheet: FeedbackSheet | null;
  private readonly surface: FormSurface;
  private ctx: GameContext | null = null;
  /** Focus the textarea on the next tick (desktop): focusing inside the opening key press would type its letter. */
  private focusPending = false;
  /** The mode the dialog was opened in (title or paused): it never outlives that screen. */
  private openedIn: string | null = null;
  /** The mode of the last tick: the status check runs when the title shows (again). */
  private lastMode: string | null = null;
  /** The arrow keys held on a scrolling page: -1 up, 1 down, 0 none. */
  private keyScroll: -1 | 0 | 1 = 0;
  /** The scroll offset when a list row was pressed (a drag in between opens nothing). */
  private pressScroll = 0;

  constructor(private readonly options: FeedbackDialogOptions) {
    const flow = (this.flow = new FeedbackFlow(options.sender, options.inbox));
    this.field = options.field({ onInput: (v) => flow.setText(v), onCancel: () => this.back() });
    this.sheet =
      options.sheet?.({
        onInput: (v) => flow.setText(v),
        onKind: (k) => flow.setKind(k),
        onToggleLog: () => flow.toggleLog(),
        onSend: () => void (this.ctx && flow.send(this.context(this.ctx))),
        onPreview: () => void (this.ctx && flow.openPreview(this.context(this.ctx))),
        onTab: (tab) => this.showTab(tab),
        onOpenReport: (id) => flow.openReport(id),
        onSentLog: () => flow.openSentLog(),
        onDelete: () => flow.askDelete(),
        onConfirmDelete: () => void flow.confirmDelete(),
        onBack: () => this.back(),
        onClose: () => flow.close(),
      }) ?? null;
    this.surface = new FormSurface({ field: this.field, sheet: this.sheet });
  }

  init(ctx: GameContext): void {
    this.ctx = ctx;
    this.addHotspots(ctx);
    if (!this.options.bindScroll) return;
    bindListScroll(
      {
        active: () => this.canvasPage(ctx) !== null,
        scrollBy: (dy) => this.flow.scrollBy(dy),
        lineHeight: () => 9 * (this.canvasPage(ctx)?.scale ?? 1),
      },
      () => document.getElementById('game'),
    );
  }

  /**
   * The title's speech-bubble icon or the pause menu's "Feedback": the dialog on "Neu". Desktop types
   * into it from the next tick on (update focuses it then, outside the opening key press).
   */
  open(ctx: GameContext): void {
    this.flow.openForm();
    this.openedIn = ctx.state.mode;
    this.focusPending = !ctx.display.touch;
  }

  /** The screen it was opened on is gone (a run started, game over). */
  dismiss(): void {
    this.flow.dismiss();
  }

  /** The text field has the focus (on a phone: the keyboard is up). */
  isFocused(): boolean {
    return this.surface.isFocused();
  }

  /** Drops the text field's focus (the phone keyboard goes down). */
  blur(): void {
    this.surface.blur();
  }

  /**
   * Portrait stays free while the dialog is open, on every page (ticket #6): each page has its
   * portrait sheet, so a turn on "Mein Feedback" or a report goes there and back like on "Neu".
   */
  typing(): boolean {
    return this.flow.open;
  }

  /** Every tick, first: the dialog closes as soon as the screen it was opened on is gone (any path out of title or pause), so all ui comes back. */
  keepOnItsScreen(ctx: GameContext): void {
    if (!this.flow.open) return;
    const { mode } = ctx.state;
    const menu = mode === 'title' || mode === 'paused';
    if (!menu || (this.openedIn !== null && mode !== this.openedIn)) this.flow.dismiss();
  }

  /** Every tick, after the orientation: places the field or the sheet, scrolls, and checks the status on the title. */
  update(ctx: GameContext, dt: number): void {
    this.place(ctx);
    // Off the form (sent, a list or text page) nothing takes text: the keyboard goes down.
    if (this.flow.page !== 'form' && this.surface.isFocused()) this.surface.blur();
    const page = this.canvasPage(ctx);
    if (page) {
      if (this.keyScroll !== 0) this.flow.scrollBy(this.keyScroll * KEY_ROWS_PER_SECOND * 9 * page.scale * dt);
      this.flow.clampScroll(pageMaxScroll(this.flow, page));
    } else this.keyScroll = 0;
    const { mode, kidMode } = ctx.state;
    // Kid mode has no feedback: no checks, no dot.
    if (mode === 'title' && this.lastMode !== 'title' && !kidMode) void this.options.inbox?.checkIfDue();
    this.lastMode = mode;
  }

  /** What the sender adds to the report. */
  private context(ctx: GameContext): FeedbackContext {
    const { state, display } = ctx;
    return { platform: state.install.platform, touch: display.touch, portrait: display.portrait, viewWidth: display.viewWidth, mode: state.mode };
  }

  private shown(): boolean {
    return this.flow.open && !this.options.covered();
  }

  /** It shows as its portrait sheet (portrait-sheets.ts) rather than on the canvas. */
  private onSheet(ctx: GameContext): boolean {
    return !!this.sheet && sheetShown(ctx.display, true);
  }

  /** The canvas form's layout while it shows, else null. */
  private canvasForm(ctx: GameContext): FeedbackLayout | null {
    return this.shown() && !this.onSheet(ctx) && this.flow.page === 'form' ? feedbackLayout(ctx.display) : null;
  }

  /** The canvas list or text page's layout while it shows, else null. */
  private canvasPage(ctx: GameContext): PageLayout | null {
    const { page, listNote } = this.flow;
    return this.shown() && !this.onSheet(ctx) && page !== 'form' ? pageLayout(ctx.display, page, listNote) : null;
  }

  /** The native textarea over the canvas form's field, or the portrait sheet, else both hidden; a pending desktop focus goes to the one shown. */
  private place(ctx: GameContext): void {
    const { flow } = this;
    const where = !this.shown() ? null : this.onSheet(ctx) ? 'sheet' : this.canvasForm(ctx) ? 'field' : null;
    this.surface.update(where, (surface) => {
      this.field?.place(surface === 'field' ? feedbackLayout(ctx.display).field : null, flow.text, feedbackPlaceholder(flow));
      this.sheet?.show(surface === 'sheet' ? feedbackSheetModel(flow) : null);
    });
    if (!flow.open) this.focusPending = false;
    if (where && this.focusPending) {
      this.focusPending = false;
      this.surface.focus();
    }
  }

  private showTab(tab: FeedbackTab): void {
    this.flow.showTab(tab);
    this.focusAfterNav();
  }

  /** "Zurück", Esc and Android back (back-nav.ts): the page before, else closes. */
  back(): void {
    if (this.flow.back()) this.focusAfterNav();
    else this.flow.close();
  }

  /** Back on the form, desktop types on at once (focused on the next tick). */
  private focusAfterNav(): void {
    if (this.flow.page === 'form' && this.ctx && !this.ctx.display.touch) this.focusPending = true;
  }

  /** Keys while the canvas dialog shows: it takes every key but M, so nothing starts or resumes behind it. */
  private key(ctx: GameContext, code: string): boolean {
    const { flow } = this;
    if (code === 'KeyM') return false;
    if (code === 'Escape') this.back();
    else if (flow.page === 'form') this.surface.focus();
    else if (this.onSheet(ctx)) this.sheet!.scrollKey(code);
    else {
      const page = this.canvasPage(ctx) ?? pageLayout(ctx.display, flow.page, flow.listNote);
      this.keyScroll = scrollDirection(code);
      const jump = pageScroll(code, { rect: page.content });
      if (this.keyScroll !== 0) flow.scrollBy(this.keyScroll * 9 * page.scale);
      else if (jump !== null) flow.scrollBy(jump === -Infinity ? -flow.scroll : jump === Infinity ? pageMaxScroll(flow, page) : jump);
      flow.clampScroll(pageMaxScroll(flow, page));
    }
    return true;
  }

  /**
   * The dialog is modal over the title or pause screen: every tap anywhere (also outside the canvas)
   * and every key but M stays there; a tap beside the form blurs the field. Then each page's buttons.
   */
  private addHotspots(ctx: GameContext): void {
    const { flow } = this;
    const add = (rect: () => Rect | null, onPress: () => void) => ctx.addHotspot({ rect, onPress });
    const form = (pick: (l: FeedbackLayout) => Rect | null) => () => {
      const l = this.canvasForm(ctx);
      return l ? pick(l) : null;
    };
    const page = (pick: (l: PageLayout) => Rect | null) => () => {
      const l = this.canvasPage(ctx);
      return l ? pick(l) : null;
    };
    const modal: InputHotspot = {
      rect: () => (this.shown() ? EVERYWHERE : null),
      onPress: () => this.surface.blur(),
      onKeyDown: (code) => this.key(ctx, code),
      onKeyUp: () => void (this.keyScroll = 0),
    };
    ctx.addHotspot(modal);
    add(form((l) => l.field), () => this.field?.focus());
    add(form((l) => l.newTab), () => this.showTab('new'));
    add(form((l) => l.mineTab), () => this.showTab('mine'));
    add(form((l) => l.close), () => flow.close());
    add(form((l) => l.bug), () => flow.setKind('bug'));
    add(form((l) => l.idea), () => flow.setKind('idea'));
    add(form((l) => (flow.logShown ? l.log : null)), () => flow.toggleLog());
    add(form((l) => l.view), () => flow.openPreview(this.context(ctx)));
    add(form((l) => l.send), () => void flow.send(this.context(ctx)));
    add(page((l) => l.newTab), () => this.showTab('new'));
    add(page((l) => l.mineTab), () => this.showTab('mine'));
    add(page((l) => l.close), () => flow.close());
    add(page((l) => l.back), () => this.back());
    add(page((l) => l.view), () => flow.openSentLog());
    add(page((l) => l.del), () => flow.askDelete());
    add(page((l) => l.no), () => this.back());
    add(page((l) => l.yes), () => void flow.confirmDelete());
    // A list row opens its report when let go, unless the list was dragged meanwhile.
    for (let i = 0; i < MAX_STATUS_ITEMS; i++) {
      const rect = page((l) => (flow.page === 'list' && i < flow.rows.length ? listRowRect(l, i, flow.scroll) : null));
      const row: InputHotspot = {
        rect,
        onPress: () => void (this.pressScroll = flow.scroll),
        onRelease: () => {
          const pressed = flow.rows[i];
          if (pressed && rect() && Math.abs(flow.scroll - this.pressScroll) < DRAG_SLOP) flow.openReport(pressed.id);
        },
      };
      ctx.addHotspot(row);
    }
  }
}
