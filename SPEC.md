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
| 4 | Fetching | **Lazy** — fetch only when a symbol's popover is opened. Per-symbol cache TTL **5 min** (worker-owned; the client has no cache). UA fetched market-wide once and filtered per symbol |
| 5 | Target | **Chrome MV3 first**; Firefox via `webextension-polyfill`, kept clean from line one so Firefox is a packaging step |

---

## 2. Interface contract with `@traderdaddy/sdk`

Mirrors the **DaddyBoard** shape the SDK is extracted from (`src/mcpClient.js`).
The client is a **flat `callTool(name, args)`** function plus a `RateLimitError`
class — *not* a `client.getX()` object. Tool names are the raw snake_case MCP
tool names. DaddyLens consumes it only in the background worker.

```ts
import { callTool, RateLimitError } from "@traderdaddy/sdk";

// Config is passed in (browser-safe) — NOT loaded from a file like DaddyBoard's
// config.js (which uses node fs/path and is not MV3-safe). The worker builds it
// from browser.storage.local:
//   { apiKey: "td_live_…", baseUrl: "https://api.traderdaddy.pro" }

// One stateless POST to /api/v1/mcp per call (tools/call, no initialize).
// Returns result.content[0].text, JSON.parsed. 429 / JSON-RPC -32000 → RateLimitError.
```

### Tool calls DaddyLens makes (note the arg-name asymmetry)

| Tool | Args | Scope | DaddyLens use |
|------|------|-------|---------------|
| `get_unusual_activity` | `{ limit }` | **market-wide** | Fetch **once**, cache 5 min, **filter rows by clicked `ticker`** |
| `get_gex_ticker` | `{ symbol }` | per-ticker | Gamma bias card |
| `get_put_call_ratios` | `{ ticker }` ⚠ | per-ticker | Put/Call card (arg is `ticker`, not `symbol`) |
| `get_iv_rank` | `{ symbol }` | per-ticker | IV Rank card |

Key consequences vs. the first draft:

- **UA is market-wide.** One call serves every symbol on the page; the worker
  filters `rows.filter(r => r.ticker === symbol)`. This slashes API load — a
  50-symbol feed costs 1 UA call, not 50.
- **No SDK-side cache.** DaddyBoard's caching lives in its *poller*, not the
  client. DaddyLens must implement its **own per-symbol TTL cache + 429 backoff**
  in the worker (§4 `cache.ts`, `dedupe.ts`).
- **Mock is a mode, not a separate client.** DaddyBoard toggles `config.mockMode`
  and reads `fixtures[toolName](args)` (each fixture keyed by the snake_case tool
  name, a plain object or `fn(args)`). DaddyLens mirrors this: demo mode → read
  bundled fixtures instead of calling `callTool`. Same fixtures the SDK ships.
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
│  │  ├─ index.ts           # worker entry; message router
│  │  ├─ fetcher.ts         # live callTool vs mock fixtures (config.mockMode)
│  │  ├─ cache.ts           # per-symbol TTL store (5 min) — worker owns caching
│  │  ├─ backoff.ts         # 429/RateLimitError exp backoff (base 2s, cap 60s)
│  │  └─ dedupe.ts          # in-flight request coalescing per symbol
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
1. Serves from `cache.ts` if the symbol's cards are <5 min old.
2. Otherwise fans out **three** per-ticker calls with `Promise.allSettled` —
   `get_gex_ticker {symbol}`, `get_put_call_ratios {ticker}`, `get_iv_rank {symbol}` —
   plus reads the **shared** market-wide `get_unusual_activity` result (fetched
   once, its own 5-min cache) and filters rows to `symbol`.
3. A partial failure renders the cards that succeeded and marks the rest
   "unavailable" rather than failing the whole popover.
4. `RateLimitError` → `backoff.ts` schedules a cooldown; the card set surfaces
   "cooling down" and serves stale cache if present.

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
5. **Background worker (live)** — `callTool` wiring, live/mock switch on
   `config.mockMode`, worker-owned `cache.ts` (5 min) + `backoff.ts` + `dedupe.ts`,
   market-wide UA fetch + per-symbol filter, `Promise.allSettled` fan-out of the
   three per-ticker calls, 429 → "cooling down." Live key path end-to-end.
6. **Package + list** — Chrome Web Store + Firefox AMO builds, screenshots,
   listing copy, privacy note (key stays local).

---

## 13. Open items to reconcile on SDK publish

Locked to the DaddyBoard shape (§2); confirm on publish:

- **Export names** — does the SDK re-export `callTool` + `RateLimitError`
  as-is, or wrap them? DaddyLens imports whatever DaddyBoard's `mcpClient.js`
  exposes.
- **Config injection** — SDK must accept `{ apiKey, baseUrl }` as a param (not
  DaddyBoard's file-loading `config.js`, which is Node-only / not MV3-safe).
- **Fixtures export** — confirm the SDK ships `fixtures` keyed by snake_case tool
  name (object or `fn(args)`), the same set DaddyBoard's `src/mock/fixtures.js`
  uses, so demo mode reuses them.
- **`get_unusual_activity` filtering** — confirm rows carry a `ticker` field to
  filter on (they do in the fixture), and whether the tool *also* accepts a
  ticker arg (would let us skip client-side filtering for niche symbols).
- **MV3 bundling** — `mcpClient.js` core uses only global `fetch` /
  `AbortController` / `setTimeout` (all MV3-safe). Verify the published SDK
  carries **no** Node built-ins into the bundle. Milestone 1 confirms.
