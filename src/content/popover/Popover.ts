// Shadow-DOM popover singleton. One instance per page; open() anchors it to a
// marked element and drives the loading → ready / error / demo states.

import popoverCss from './popover.css';
import { renderCards, renderSkeleton } from './cards';
import { queryLens } from '../messaging';
import type { LensResponse } from '../../shared/types';

const CTA_URL = 'https://traderdaddy.pro';

export class Popover {
  private host: HTMLElement;
  private shadow: ShadowRoot;
  private root: HTMLElement | null = null;
  private currentSymbol: string | null = null;
  private onDismiss: () => void;

  constructor() {
    this.host = document.createElement('div');
    this.host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:0;left:0;';
    this.shadow = this.host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = popoverCss;
    this.shadow.appendChild(style);
    this.onDismiss = () => this.close();
  }

  private ensureMounted(): void {
    if (!this.host.isConnected) document.documentElement.appendChild(this.host);
  }

  private draw(inner: string): HTMLElement {
    if (this.root) this.root.remove();
    this.root = document.createElement('div');
    this.root.className = 'dl-root';
    this.root.innerHTML = inner;
    this.shadow.appendChild(this.root);
    return this.root;
  }

  private position(anchor: HTMLElement): void {
    if (!this.root) return;
    const a = anchor.getBoundingClientRect();
    const r = this.root.getBoundingClientRect();
    let top = a.bottom + 6;
    let left = a.left;
    if (left + r.width > window.innerWidth - 8) left = window.innerWidth - r.width - 8;
    if (left < 8) left = 8;
    if (top + r.height > window.innerHeight - 8) top = a.top - r.height - 6;
    this.root.style.top = `${Math.max(8, top)}px`;
    this.root.style.left = `${left}px`;
  }

  private shell(symbol: string, badge: string, body: string, foot = true): string {
    return `
      <div class="dl-head">
        <span class="dl-symbol">$${symbol}</span>
        ${badge}
      </div>
      <div class="dl-body">${body}</div>
      ${foot ? `<div class="dl-foot">
        <span class="dl-foot-brand">Powered by <b>TraderDaddy Pro</b></span>
        <a class="dl-cta" href="${CTA_URL}" target="_blank" rel="noopener">Get the full picture →</a>
      </div>` : ''}
    `;
  }

  async open(symbol: string, anchor: HTMLElement): Promise<void> {
    this.ensureMounted();
    this.currentSymbol = symbol;

    // Loading state.
    this.draw(this.shell(symbol, '', renderSkeleton()));
    this.position(anchor);
    this.attachDismiss();

    let res: LensResponse;
    try {
      res = await queryLens(symbol);
    } catch (err) {
      if (this.currentSymbol !== symbol) return;
      this.renderError(symbol, anchor, () => this.open(symbol, anchor));
      return;
    }
    if (this.currentSymbol !== symbol) return; // superseded by another click

    if (res.type === 'LENS_ERROR') {
      this.renderError(symbol, anchor, () => this.open(symbol, anchor), res.message);
      return;
    }

    const badge = res.demo
      ? '<span class="dl-demo">DEMO</span>'
      : res.cooling
        ? '<span class="dl-cooling">cooling down…</span>'
        : '';
    this.draw(this.shell(symbol, badge, renderCards(res.cards)));
    this.position(anchor);
  }

  private renderError(symbol: string, anchor: HTMLElement, retry: () => void, msg?: string): void {
    const el = this.draw(this.shell(
      symbol,
      '',
      `<div class="dl-error" style="grid-column:1/3">
        ${msg ?? 'Could not load data.'}
        <br><button class="dl-retry">Retry</button>
      </div>`,
    ));
    this.position(anchor);
    el.querySelector('.dl-retry')?.addEventListener('click', retry);
  }

  private attachDismiss(): void {
    // Defer so the opening click doesn't immediately dismiss.
    setTimeout(() => {
      document.addEventListener('pointerdown', this.outsideHandler, true);
      document.addEventListener('keydown', this.escHandler, true);
    }, 0);
  }

  private outsideHandler = (e: Event): void => {
    if (!this.host.contains(e.target as Node)) this.onDismiss();
  };

  private escHandler = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.onDismiss();
  };

  close(): void {
    this.currentSymbol = null;
    this.root?.remove();
    this.root = null;
    document.removeEventListener('pointerdown', this.outsideHandler, true);
    document.removeEventListener('keydown', this.escHandler, true);
  }
}
