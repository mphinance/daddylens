// Pure render helpers: turn Cards data into HTML strings for the popover body.

import type { Cards, UnusualCard, GexCard, PutCallCard, IvRankCard } from '../../shared/types';

const fmtMoney = (n: number | null): string => {
  if (n == null) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

const sentimentClass = (s: string | null): string =>
  s === 'Bullish' ? 'dl-bull' : s === 'Bearish' ? 'dl-bear' : 'dl-neutral';

function card(label: string, valueHtml: string, subHtml = ''): string {
  return `<div class="dl-card">
    <div class="dl-card-label">${label}</div>
    <div class="dl-card-value">${valueHtml}</div>
    ${subHtml ? `<div class="dl-card-sub">${subHtml}</div>` : ''}
  </div>`;
}

function unusualCard(c: UnusualCard | null): string {
  if (!c) return card('Unusual', '<span class="dl-muted">n/a</span>');
  if (!c.found) return card('Unusual', '<span class="dl-muted">no flow</span>');
  const cls = sentimentClass(c.topSentiment);
  const dir = c.topType ? ` ${c.topType}` : '';
  return card(
    'Unusual',
    `<span class="${cls}">${c.topSentiment ?? '—'}${dir}</span>`,
    `${fmtMoney(c.topPremium)} · ${c.count} alert${c.count === 1 ? '' : 's'}`,
  );
}

function gexCard(c: GexCard | null): string {
  if (!c || c.bias == null) return card('Gamma', '<span class="dl-muted">n/a</span>');
  const long = c.bias.includes('LONG');
  const label = c.bias.replace('_', ' ').toLowerCase();
  const sub = c.flipPoint != null ? `flip ${c.flipPoint}` : '';
  return card('Gamma', `<span class="${long ? 'dl-bull' : 'dl-bear'}">${label}</span>`, sub);
}

function putCallCard(c: PutCallCard | null): string {
  if (!c || c.ratio == null) return card('Put/Call', '<span class="dl-muted">n/a</span>');
  const cls = c.ratio < 0.9 ? 'dl-bull' : c.ratio > 1.1 ? 'dl-bear' : 'dl-neutral';
  return card('Put/Call', `<span class="${cls}">${c.ratio.toFixed(2)}</span>`, c.sentiment ?? '');
}

function ivCard(c: IvRankCard | null): string {
  if (!c || c.ivRank == null) return card('IV Rank', '<span class="dl-muted">n/a</span>');
  const cls = c.ivRank > 60 ? 'dl-bear' : c.ivRank < 30 ? 'dl-bull' : 'dl-neutral';
  return card('IV Rank', `<span class="${cls}">${c.ivRank}</span>`, c.interpretation ?? '');
}

export function renderCards(cards: Cards): string {
  return unusualCard(cards.unusual) + gexCard(cards.gex) + putCallCard(cards.putCall) + ivCard(cards.ivRank);
}

export function renderSkeleton(): string {
  const s = `<div class="dl-card">
    <div class="dl-card-label">&nbsp;</div>
    <div class="dl-skeleton" style="width:70%"></div>
    <div class="dl-skeleton" style="width:45%;margin-top:6px"></div>
  </div>`;
  return s.repeat(4);
}
