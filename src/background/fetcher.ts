// Builds a TraderDaddy client from settings and distils the four per-symbol tool
// responses into the compact Cards the popover renders. The SDK owns caching
// (per-tool TTLs) and 429 backoff, so this layer stays thin.

import { TraderDaddy, RateLimitError, MissingApiKeyError } from '@traderdaddy/sdk';
import type { Settings, Cards, UnusualCard } from '../shared/types';
import { isLive } from '../shared/settings';

export interface FetchOutcome {
  cards: Cards;
  demo: boolean;
  cooling: boolean;
}

let client: TraderDaddy | null = null;
let clientKey = '';

/** (Re)build the client when the relevant settings change. */
function clientFor(settings: Settings): TraderDaddy {
  const live = isLive(settings);
  const key = live ? `live:${settings.apiKey}:${settings.baseUrl}` : 'mock';
  if (client && key === clientKey) return client;
  clientKey = key;
  client = live
    ? new TraderDaddy({ apiKey: settings.apiKey!, baseUrl: settings.baseUrl, cache: true })
    : new TraderDaddy({ mock: true });
  return client;
}

function unusualFromRows(symbol: string, rows: import('@traderdaddy/sdk').UnusualActivityRow[]): UnusualCard {
  const mine = rows.filter((r) => r.ticker.toUpperCase() === symbol.toUpperCase());
  if (mine.length === 0) {
    return { found: false, topSentiment: null, topType: null, topPremium: null, topScore: null, tier: null, count: 0 };
  }
  const top = [...mine].sort((a, b) => (b.score - a.score) || (b.premium - a.premium))[0];
  return {
    found: true,
    topSentiment: top.sentiment as UnusualCard['topSentiment'],
    topType: top.type as UnusualCard['topType'],
    topPremium: top.premium,
    topScore: top.score,
    tier: (top as { tier?: string }).tier ?? null,
    count: mine.length,
  };
}

export async function fetchCards(symbol: string, settings: Settings): Promise<FetchOutcome> {
  const td = clientFor(settings);
  let cooling = false;

  const [ua, gex, pc, iv] = await Promise.allSettled([
    td.unusualActivity({ ticker: symbol, limit: 25 }),
    td.gexTicker(symbol),
    td.putCallRatios(symbol),
    td.ivRank(symbol),
  ]);

  const noteCooling = (r: PromiseSettledResult<unknown>) => {
    if (r.status === 'rejected' && r.reason instanceof RateLimitError) cooling = true;
  };
  [ua, gex, pc, iv].forEach(noteCooling);

  const cards: Cards = {
    unusual: ua.status === 'fulfilled' ? unusualFromRows(symbol, ua.value.data) : null,
    gex: gex.status === 'fulfilled'
      ? { bias: gex.value.bias, netGex: gex.value.netGex, flipPoint: gex.value.flipPoint }
      : null,
    putCall: pc.status === 'fulfilled'
      ? { ratio: pc.value.putCallRatio, sentiment: pc.value.sentiment }
      : null,
    ivRank: iv.status === 'fulfilled'
      ? { ivRank: iv.value.ivRank, interpretation: iv.value.interpretation }
      : null,
  };

  // Live mode: if every call failed for a non-rate-limit reason, it's almost
  // always a bad/expired key. Surface that instead of four silent "n/a" cards.
  const allFailed = [ua, gex, pc, iv].every((r) => r.status === 'rejected');
  if (!td.mock && allFailed && !cooling) {
    throw new AuthLikelyError();
  }

  return { cards, demo: td.mock, cooling };
}

/** Raised when every live call fails — surfaced as a "check your key" prompt. */
export class AuthLikelyError extends Error {
  constructor() {
    super('Requests failed — check that your API key is valid in DaddyLens settings.');
    this.name = 'AuthLikelyError';
  }
}

export { RateLimitError, MissingApiKeyError };
