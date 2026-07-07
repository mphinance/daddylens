// Symbol validation + stopword filtering for bare-uppercase detection.
// Cashtags ($NVDA) are unambiguous and skip the stopword gate; bare words
// (NVDA in prose) run through it to keep false positives down.

/** Common all-caps English words / acronyms that are NOT the ticker you mean.
 *  These ARE valid tickers, but on a page they're almost always the English
 *  word, so we drop them from BARE detection (cashtags still resolve them). */
const STOPWORDS = new Set([
  // English words that happen to be tickers
  'A', 'ALL', 'AN', 'AND', 'ANY', 'ARE', 'AS', 'AT', 'BE', 'BIG', 'BY', 'CAN',
  'DD', 'DO', 'EOD', 'EPS', 'EV', 'FOR', 'FUN', 'GO', 'GOOD', 'HAS', 'HE', 'IF',
  'IN', 'IS', 'IT', 'ITS', 'LOVE', 'NEW', 'NO', 'NOW', 'ODD', 'OF', 'ON', 'ONE',
  'OR', 'OUT', 'PLAY', 'PM', 'REAL', 'RUN', 'SEE', 'SO', 'TO', 'TV', 'UP', 'US',
  'WELL', 'WING', 'YOLO', 'YOU',
  // Finance / trading jargon acronyms
  'AH', 'AI', 'AM', 'AMC', 'AMD', 'ATH', 'ATM', 'BTD', 'CEO', 'CFO', 'CPI',
  'DCA', 'ER', 'ETF', 'FAANG', 'FED', 'FOMC', 'FUD', 'GDP', 'IPO', 'ITM', 'IV',
  'LEAP', 'LEAPS', 'MACD', 'NASDAQ', 'NYSE', 'OI', 'OTC', 'OTM', 'PE', 'PT',
  'RSI', 'SEC', 'TA', 'USA', 'USD', 'VIX', 'YTD',
  // Days / months / misc
  'FRI', 'MON', 'SAT', 'SUN', 'THU', 'TUE', 'WED',
]);

// Cashtag: $ + 1-6 uppercase letters, optional single-letter class (e.g. BRK.A).
const CASHTAG_RE = /\$([A-Z]{1,6})(?:\.([A-Z]))?\b/g;
// Bare uppercase run: 2-6 letters. Guarded by the stopword filter below.
const BARE_RE = /\b([A-Z]{2,6})(?:\.([A-Z]))?\b/g;

export interface Match {
  symbol: string;   // normalized, e.g. "NVDA" or "BRK.A"
  index: number;    // start offset within the text
  length: number;   // matched length including the leading $ for cashtags
  cashtag: boolean;
}

function normalize(base: string, cls?: string): string {
  return cls ? `${base}.${cls}` : base;
}

/** True if a bare word should be treated as a ticker (not English). */
export function isLikelyBareSymbol(base: string): boolean {
  if (base.length < 2 || base.length > 6) return false;
  if (STOPWORDS.has(base)) return false;
  return true;
}

/**
 * Find ticker matches in a run of text.
 * @param text     the text to scan
 * @param allowBare whether bare-uppercase symbols are enabled for this domain
 */
export function findSymbols(text: string, allowBare: boolean): Match[] {
  const out: Match[] = [];
  const claimed: Array<[number, number]> = [];

  CASHTAG_RE.lastIndex = 0;
  for (let m; (m = CASHTAG_RE.exec(text)); ) {
    out.push({
      symbol: normalize(m[1], m[2]),
      index: m.index,
      length: m[0].length,
      cashtag: true,
    });
    claimed.push([m.index, m.index + m[0].length]);
  }

  if (allowBare) {
    BARE_RE.lastIndex = 0;
    for (let m; (m = BARE_RE.exec(text)); ) {
      const start = m.index;
      const end = start + m[0].length;
      // Skip if this overlaps a cashtag we already claimed, or is preceded by '$'.
      if (start > 0 && text[start - 1] === '$') continue;
      if (claimed.some(([s, e]) => start < e && end > s)) continue;
      if (!isLikelyBareSymbol(m[1])) continue;
      out.push({
        symbol: normalize(m[1], m[2]),
        index: start,
        length: m[0].length,
        cashtag: false,
      });
    }
  }

  return out.sort((a, b) => a.index - b.index);
}
