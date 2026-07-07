# DaddyLens — Technical Spec

> Manifest V3 browser extension that annotates `$TICKERS` on any website with live
> TraderDaddy Pro options-flow, gamma bias, put/call, and IV rank.

**Status:** Spec. Depends on [`@traderdaddy/sdk`](https://github.com/mphinance/traderdaddy-sdk)
for the API client, cache, and mock fixtures. This document is the contract the
build follows; reconcile exact SDK import names/types once the SDK is published.

---

## 1. Decisions (locked)

| # | Decision | Value |
|---|----------|-------|
| 1 | Detection | `$TICKER` cashtags on **all** sites; **bare uppercase** symbols opt-in per-domain, allowlist ships with X, Reddit, StockTwits, Substack |
| 2 | Trigger | **Click/tap** opens popover; hover is an opt-in toggle |
| 3 | No-key UX | **Demo mode** using `@traderdaddy/sdk/mock`, with a persistent **DEMO** watermark on every popover |
| 4 | Fetching | **Lazy** — fetch only when a symbol's popover is opened. Caching + 429 backoff come from the SDK (`cache: true`); worker adds only in-flight dedupe. UA ticker-filtered per symbol |
| 5 | Target | **Chrome MV3 first**; Firefox via `webextension-polyfill`, kept clean from line one so Firefox is a packaging step |

---

## 2. Interface contract with `@traderdaddy/sdk`

Uses the **published `@traderdaddy/sdk` v0.1** (`TraderDaddy` class). The SDK
wraps a `Transport` (live `HttpTransport` / keyless `MockTransport`) with the two
behaviours DaddyBoard proved out — **per-tool TTL cache** and **429 backoff** —
so DaddyLens does NOT hand-roll either. Isomorphic; bundles clean for MV3.
Consumed only in the background worker.

```ts
import { TraderDaddy, RateLimitError, MissingApiKeyError } from "@traderdaddy/sdk";

// Live: user's own key (from storage.local); cache on = per-tool TTLs.
const td = new TraderDaddy({ apiKey, baseUrl, cache: true });
// Keyless demo: identical types, MockTransport serves fixtures.
const demo = new TraderDaddy({ mock: true });   // td.mock === true
```

### Typed methods DaddyLens calls (one per card)

| Method | Signature | DaddyLens use |
|--------|-----------|---------------|
| `unusualActivity({ ticker, limit })` | ticker-filterable | Unusual card — worker still `filter`s rows by ticker (mock returns all) |
| `gexTicker(symbol)` | per-ticker | Gamma bias card |
| `putCallRatios(symbol)` | per-ticker (arg named `ticker` internally) | Put/Call card |
| `ivRank(symbol)` | per-ticker | IV Rank card |

Key points:

- **SDK owns cache + backoff.** `cache: true` gives per-tool TTLs; 429 →
  `RateLimitError` is retried by the SDK's `withBackoff`. The worker only adds a
  tiny in-flight dedupe so two popovers on the same symbol share one fetch.
- **`unusualActivity` is ticker-filterable**, but the mock fixture is a static
  list, so the worker filters `rows.filter(r => r.ticker === symbol)` to stay
  correct in demo mode (and defensive in live).
- **Demo = `mock: true`.** MockTransport serves the SDK's own typed fixtures — no
  bundled fixtures in DaddyLens. `td.mock` flags the DEMO watermark.
- The `td_live_` key **never** leaves the background worker; content scripts get
  only rendered card data, never the key.

---

## 3. Component architecture

```
┌─ Content script (per tab, all_urls) ──────────────────┐
│  • DOM scan → cashtag/bare-symbol detection            │
│  • Wrap matches in Shadow-DOM marker spans             │
│  • On click → request { symbol } to worker             │
│  • Render popover (Shadow DOM) from worker response    │
└───────────────────────────────────────────────────────┘
            │  runtime.sendMessage({type:"LENS_QUERY", symbol})
            ▼
┌─ Background service worker (MV3, one per browser) ─────┐
│  • Owns the SDK client (live or mock)                  │
│  • Reads key + settings from browser.storage.local     │
│  • Dedupe in-flight requests per symbol                │
│  • Returns { symbol, cards, demo } to the tab          │
└───────────────────────────────────────────────────────┘
            ▲
            │  storage.local (key, mode, per-domain settings)
┌─ Options page ────────────────────────────────────────┐
│  • Paste td_live_ key (masked)                         │
│  • Demo-mode toggle                                    │
│  • Per-domain enable + bare-symbol allowlist editor    │
│  • Hover-vs-click toggle                               │
└───────────────────────────────────────────────────────┘
```

Content scripts **never** import the SDK — keeps the key out of page context and
keeps the content bundle tiny. All API access is worker-only.

---

## 4. File tree

```
daddylens/
├─ manifest.json            # MV3; permissions: storage, activeTab; host: api.traderdaddy.pro
├─ src/
│  ├─ content/
│  │  ├─ index.ts           # entry: scan + observe + wire clicks
│  │  ├─ detect.ts          # cashtag + bare-symbol matcher (pure, unit-tested)
│  │  ├─ scanner.ts         # DOM walk + MutationObserver + debounce
│  │  ├─ popover/
│  │  │  ├─ Popover.ts       # Shadow-DOM component, state machine
│  │  │  ├─ popover.css      # scoped styles (dark/glass, DaddyBoard-matched)
│  │  │  └─ cards.ts         # UA / GEX / P-C / IV card renderers
│  │  └─ messaging.ts       # typed sendMessage wrappers
│  ├─ background/
│  │  ├─ index.ts           # worker entry; message router + in-flight dedupe
│  │  └─ fetcher.ts         # TraderDaddy client (live/mock) + card distillation
│  │                        #   (cache + backoff come from the SDK)
│  ├─ options/
│  │  ├─ options.html
│  │  ├─ options.ts         # key entry, toggles, allowlist CRUD
│  │  └─ options.css
│  ├─ shared/
│  │  ├─ settings.ts        # storage schema + get/set + defaults
│  │  ├─ symbols.ts         # symbol validation + stopword filter
│  │  └─ types.ts           # LensQuery, LensResponse, Settings, CardData
│  └─ assets/               # icons, DEMO badge
├─ tests/
│  ├─ detect.test.ts
│  └─ symbols.test.ts
├─ scripts/build.ts          # esbuild → dist/ (Chrome + Firefox targets)
└─ dist/                     # unpacked build output (gitignored)
```

---

## 5. Detection (`detect.ts` + `symbols.ts`)

- **Cashtag regex:** `/\$([A-Z]{1,6})(?:\.[A-Z])?\b/g` — always on, all domains.
- **Bare uppercase:** `/\b[A-Z]{2,6}\b/g` — only when the current domain is in the
  bare-symbol allowlist. Passed through:
  - **Stopword filter** — drop common all-caps English/acronyms (`ALL`, `ARE`,
    `FOR`, `CEO`, `USA`, `IPO`, `NYSE`, `ETF`, …). Curated list in `symbols.ts`.
  - **Length + shape** guard (2–6 chars, letters only, `.` suffix allowed).
- **Optional validity gate:** if a symbol universe list is bundled, unknowns are
  skipped. (Ship without first; add later if noise is a problem.)
- Never re-wrap already-wrapped nodes; skip `<script>`, `<style>`, `<textarea>`,
  `contenteditable`, and inputs.

Default bare-symbol allowlist (editable in options):
`x.com`, `twitter.com`, `reddit.com`, `stocktwits.com`, `substack.com`
(+ custom-domain `*.substack.com` publications).

---

## 6. Scanner (`scanner.ts`)

- Initial pass: `TreeWalker` over visible text nodes.
- Live pages: `MutationObserver` on `document.body`, **debounced 250ms**,
  processing only added nodes (X/Reddit/Substack infinite-scroll).
- Batching: **no bulk prefetch.** Scanner only *marks* symbols; a fetch happens
  solely when a marked symbol's popover is opened. This is the core rate-limit
  discipline — a feed with 50 symbols costs 0 API calls until a user clicks one.

---

## 7. Popover state machine (`Popover.ts`)

Shadow DOM (closed) so host-page CSS can't leak in or out.

```
idle ──click──▶ loading ──ok───▶ ready
                   │              │
                   └──error──▶ error (retry)
                   └──no-key─▶ demo (mock data + DEMO watermark + CTA)
```

- **loading:** skeleton cards.
- **ready:** four compact cards — Unusual Activity summary, Gamma bias (GEX),
  Put/Call, IV Rank — + footer **"Powered by TraderDaddy Pro · Get the full
  picture →"** linking to traderdaddy.pro.
- **demo:** identical layout from mock fixtures, persistent **DEMO** badge,
  stronger upgrade CTA.
- **error:** message + retry; 429 surfaces as "cooling down" (SDK already backed off).
- One popover at a time; click-away / Esc dismisses.

---

## 8. Messaging protocol (`shared/types.ts`)

```ts
type LensQuery = { type: "LENS_QUERY"; symbol: string };
type LensResponse = {
  type: "LENS_RESULT";
  symbol: string;
  demo: boolean;
  cards: {
    unusual: UnusualCard;
    gex: GexCard;
    putCall: PutCallCard;
    ivRank: IvRankCard;
  };
} | { type: "LENS_ERROR"; symbol: string; code: "RATE_LIMIT" | "NO_KEY" | "FETCH" };
```

On a `LENS_QUERY`, the worker:
1. Coalesces with any in-flight fetch for the same symbol (one-line dedupe map).
2. Fans out **four** SDK calls with `Promise.allSettled` — `unusualActivity`,
   `gexTicker`, `putCallRatios`, `ivRank`. The SDK serves cached results (per-tool
   TTL) and retries 429s via its own backoff.
3. Distils each response into its compact card; a partial failure renders the
   cards that succeeded and leaves the rest `null` ("n/a") rather than failing
   the whole popover.
4. If any call surfaces `RateLimitError` (backoff exhausted), the response is
   flagged `cooling: true` and the popover shows "cooling down…".

---

## 9. Settings schema (`shared/settings.ts`)

```ts
type Settings = {
  apiKey: string | null;          // td_live_… ; null → demo mode
  demoMode: boolean;              // force demo even with a key
  trigger: "click" | "hover";     // default "click"
  bareSymbolDomains: string[];    // default allowlist above
  disabledDomains: string[];      // per-domain kill switch
};
```

Stored in `browser.storage.local`. Defaults applied on first run.

---

## 10. Key-safety model

- Personal-use pattern: each user supplies **their own** `td_live_` key in the
  options page. The key is **never** bundled and only ever travels worker →
  `api.traderdaddy.pro`.
- Content scripts (page context) never receive the key — only rendered card data.
- No-key install → demo mode, so the extension is useful/installable pre-purchase.
- Matches the SDK README's browser key-safety note.

---

## 11. Build & packaging (`scripts/build.ts`)

- **esbuild** bundles content/background/options as separate entry points.
- Two manifest variants (Chrome MV3 native worker; Firefox MV3 via polyfill).
- `dist/` gitignored; CI zips `dist/chrome` and `dist/firefox` for store uploads.
- Store assets (screenshots, listing copy) live in `store/` (added at milestone 6).

---

## 12. Milestones

1. **SDK dependency + MV3 sanity** — add `@traderdaddy/sdk`, confirm it bundles for
   MV3 (worker + content) with no Node built-ins leaking. Stub worker echoes mock.
2. **Detector + scanner** — `detect.ts`/`symbols.ts` unit-tested; scanner marks
   symbols on X/Reddit/StockTwits/Substack + a generic page. No network.
3. **Popover (demo data)** — Shadow-DOM component, four cards, state machine,
   DaddyBoard dark/glass styling, DEMO watermark + CTA.
4. **Options page** — key entry (masked), demo toggle, trigger toggle, per-domain +
   bare-symbol allowlist editor. Settings round-trip through storage.
5. **Background worker (live)** — `TraderDaddy` client (live vs `mock:true`),
   SDK cache + backoff, worker-side in-flight dedupe, `Promise.allSettled` fan-out
   of the four per-symbol calls with UA row-filtered by ticker, 429 → "cooling
   down." Live key path end-to-end.
6. **Package + list** — Chrome Web Store + Firefox AMO builds, screenshots,
   listing copy, privacy note (key stays local).

---

## 13. SDK integration status

Reconciled against the **published `@traderdaddy/sdk` v0.1** (commit `e649fe7`):

- **Client** — `new TraderDaddy({ apiKey, baseUrl, cache })` live /
  `{ mock: true }` demo. Typed method per tool. ✅ resolved.
- **Cache + backoff** — provided by the SDK (`cache: true` → per-tool TTLs;
  `withBackoff` on 429). DaddyLens no longer hand-rolls these. ✅ resolved.
- **UA filtering** — rows carry `ticker`; `unusualActivity({ ticker })` filters
  server-side, worker re-filters for demo-mode correctness. ✅ resolved.
- **MV3 bundling** — SDK is isomorphic (native `fetch`, injectable). Bundled via
  esbuild from the sibling checkout for now (`file:../traderdaddy-sdk`); switch to
  the npm package once published. Verified by `npm run build`.
- **Remaining** — pin the npm version + drop the esbuild alias when
  `@traderdaddy/sdk` is on the registry.
