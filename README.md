# DaddyLens

> A browser extension that annotates **`$TICKERS` on any website** with live
> TraderDaddy Pro options-flow, gamma bias, put/call, and IV rank — a lens over
> the whole web.

**Status:** 🚧 Spec only — not built yet. This README is the build brief.

Part of the [TraderDaddy Pro](https://traderdaddy.pro) open-source family, alongside
[DaddyBoard](https://github.com/mphinance/daddyboard). **Build order: right after
[traderdaddy-sdk](https://github.com/mphinance/traderdaddy-sdk).**

---

## Why this exists

This is the **viral top-of-funnel** play. Traders argue about tickers on X,
Reddit, and StockTwits all day. DaddyLens injects a small TraderDaddy Pro popover
onto any `$NVDA` it finds on any page — putting your data (and brand) directly in
the rooms where the audience already lives, with a "powered by TraderDaddy Pro"
footer and an upgrade CTA. Demo mode spreads it keyless; live data needs a key.

## What it does

- Scans page text for `$TICKER` cashtags (and optionally bare uppercase symbols
  on allowlisted domains).
- On hover/click, shows a compact popover: today's unusual-activity summary,
  gamma bias, put/call, IV rank for that symbol.
- Footer: **Powered by TraderDaddy Pro** + "Get the full picture →" CTA.
- Works on X/Twitter, Reddit, StockTwits, and generic sites (content script).

## Architecture

- **Manifest V3** browser extension (Chrome + Firefox via `webextension-polyfill`).
- **Content script** — DOM scan + cashtag detection + popover injection (Shadow
  DOM so host-page CSS can't leak in).
- **Background service worker** — calls the API through
  [`@traderdaddy/sdk`](https://github.com/mphinance/traderdaddy-sdk) (isomorphic,
  so the same client runs here), with the SDK's cache + 429 backoff.
- **Options page** — user pastes their own `td_live_` key (stored in
  `browser.storage.local`); a "Demo mode" toggle uses `@traderdaddy/sdk/mock`.

## MCP tools used

`get_unusual_activity`, `get_gex_ticker`, `get_put_call_ratios`, `get_iv_rank`
(all per-ticker, keyed off the detected symbol).

## ⚠️ Key-safety model

DaddyLens uses the **personal-use pattern**: each user installs the extension and
supplies *their own* key in the options page. The key never ships in the bundle
and only goes to `api.traderdaddy.pro`. (See the SDK README's key-safety note.)
No-key users get demo mode so the extension is still useful/installable pre-purchase.

## Build milestones

1. Depend on `@traderdaddy/sdk`; confirm it bundles cleanly for MV3.
2. Cashtag detector + Shadow-DOM popover component (demo data first).
3. Options page: key entry + demo toggle + per-domain enable list.
4. Background worker wiring SDK calls + caching (respect rate limits — one fetch
   per symbol per N minutes, dedupe visible symbols).
5. Brand the popover to match DaddyBoard's dark/glass look; add CTA.
6. Package for Chrome Web Store + Firefox AMO; screenshots for the listing.

## Picking this up in a new session

Prereq: [`traderdaddy-sdk`](https://github.com/mphinance/traderdaddy-sdk) published
(or linked locally). Start with the content-script cashtag scanner against demo
data, then wire the SDK in the background worker last. Rate-limit discipline
matters here — a busy Twitter feed can surface dozens of symbols; batch/dedupe and
lean on the SDK cache.
