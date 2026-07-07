// Shared type contracts used across content script, worker, and options page.

/** Card payloads returned to the popover. Kept intentionally small — the
 *  worker distills the raw MCP tool responses down to what the popover renders. */
export interface UnusualCard {
  found: boolean;
  topSentiment: 'Bullish' | 'Bearish' | 'Neutral' | null;
  topType: 'CALL' | 'PUT' | null;
  topPremium: number | null;
  topScore: number | null;
  tier: string | null;
  count: number;
}

export interface GexCard {
  bias: string | null;        // e.g. LONG_GAMMA / SHORT_GAMMA
  netGex: number | null;
  flipPoint: number | null;
}

export interface PutCallCard {
  ratio: number | null;
  sentiment: string | null;
}

export interface IvRankCard {
  ivRank: number | null;
  interpretation: string | null;   // rich / neutral / cheap
}

export interface Cards {
  unusual: UnusualCard | null;
  gex: GexCard | null;
  putCall: PutCallCard | null;
  ivRank: IvRankCard | null;
}

export type LensQuery = { type: 'LENS_QUERY'; symbol: string };

export type LensResponse =
  | { type: 'LENS_RESULT'; symbol: string; demo: boolean; cards: Cards; cooling?: boolean }
  | { type: 'LENS_ERROR'; symbol: string; code: 'RATE_LIMIT' | 'NO_KEY' | 'FETCH'; message: string };

export type LensMessage = LensQuery;

export type Trigger = 'click' | 'hover';

export interface Settings {
  apiKey: string | null;        // td_live_… ; null → demo mode
  demoMode: boolean;            // force demo even with a key
  trigger: Trigger;
  bareSymbolDomains: string[];  // domains where bare UPPERCASE symbols resolve
  disabledDomains: string[];    // per-domain kill switch
  baseUrl: string;
}
