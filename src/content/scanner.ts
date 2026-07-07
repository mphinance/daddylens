// DOM scanner: walks text nodes, wraps detected tickers in marker spans, and
// keeps up with dynamic pages via a debounced MutationObserver. Marking is
// cheap and does NO network — a fetch only happens when a marker is triggered.

import { detectInText } from './detect';
import type { Settings } from '../shared/types';

const MARK_CLASS = 'daddylens-mark';
const MARK_ATTR = 'data-dl-symbol';
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE', 'SVG']);

export interface ScannerOptions {
  settings: Settings;
  host: string;
  onTrigger: (symbol: string, anchor: HTMLElement) => void;
}

export class Scanner {
  private opts: ScannerOptions;
  private observer: MutationObserver | null = null;
  private pending = new Set<Node>();
  private debounceTimer: number | null = null;

  constructor(opts: ScannerOptions) {
    this.opts = opts;
  }

  start(): void {
    this.scanNode(document.body);
    this.observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => this.pending.add(n));
      }
      this.scheduleFlush();
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
    if (this.opts.settings.trigger === 'hover') {
      document.addEventListener('mouseover', this.hoverHandler, true);
    } else {
      document.addEventListener('click', this.clickHandler, true);
    }
  }

  stop(): void {
    this.observer?.disconnect();
    document.removeEventListener('click', this.clickHandler, true);
    document.removeEventListener('mouseover', this.hoverHandler, true);
    if (this.hoverTimer != null) clearTimeout(this.hoverTimer);
  }

  private scheduleFlush(): void {
    if (this.debounceTimer != null) return;
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      const nodes = [...this.pending];
      this.pending.clear();
      for (const n of nodes) {
        if (n.nodeType === Node.ELEMENT_NODE) this.scanNode(n as Element);
        else if (n.nodeType === Node.TEXT_NODE) this.processTextNode(n as Text);
      }
    }, 250);
  }

  private shouldSkip(el: Element | null): boolean {
    while (el) {
      if (SKIP_TAGS.has(el.tagName)) return true;
      if ((el as HTMLElement).isContentEditable) return true;
      if (el.classList?.contains(MARK_CLASS)) return true;
      if ((el as HTMLElement).dataset?.dlSkip != null) return true;
      el = el.parentElement;
    }
    return false;
  }

  private scanNode(root: Node): void {
    if (root.nodeType === Node.TEXT_NODE) {
      this.processTextNode(root as Text);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE) return;
    if (this.shouldSkip(root as Element)) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = (node as Text).parentElement;
        if (!parent || this.shouldSkip(parent)) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue || node.nodeValue.length < 2) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const texts: Text[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
    for (const t of texts) this.processTextNode(t);
  }

  private processTextNode(node: Text): void {
    const parent = node.parentElement;
    if (!parent || this.shouldSkip(parent)) return;
    const text = node.nodeValue ?? '';
    const matches = detectInText(text, this.opts.host, this.opts.settings);
    if (matches.length === 0) return;

    const frag = document.createDocumentFragment();
    let cursor = 0;
    for (const m of matches) {
      if (m.index < cursor) continue; // overlap guard
      if (m.index > cursor) frag.appendChild(document.createTextNode(text.slice(cursor, m.index)));
      const span = document.createElement('span');
      span.className = MARK_CLASS;
      span.setAttribute(MARK_ATTR, m.symbol);
      span.textContent = text.slice(m.index, m.index + m.length);
      span.style.cssText =
        'cursor:pointer;border-bottom:1px dotted rgba(125,211,252,0.7);text-decoration:none;';
      frag.appendChild(span);
      cursor = m.index + m.length;
    }
    if (cursor < text.length) frag.appendChild(document.createTextNode(text.slice(cursor)));
    parent.replaceChild(frag, node);
  }

  private clickHandler = (e: MouseEvent): void => {
    const target = (e.target as Element)?.closest?.(`.${MARK_CLASS}`);
    if (!target) return;
    const symbol = target.getAttribute(MARK_ATTR);
    if (!symbol) return;
    e.preventDefault();
    e.stopPropagation();
    this.opts.onTrigger(symbol, target as HTMLElement);
  };

  private hoverTimer: number | null = null;

  private hoverHandler = (e: MouseEvent): void => {
    const target = (e.target as Element)?.closest?.(`.${MARK_CLASS}`) as HTMLElement | null;
    if (!target) return;
    const symbol = target.getAttribute(MARK_ATTR);
    if (!symbol) return;
    if (this.hoverTimer != null) clearTimeout(this.hoverTimer);
    this.hoverTimer = window.setTimeout(() => this.opts.onTrigger(symbol, target), 180);
  };
}
