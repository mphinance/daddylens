# DaddyLens

> A browser extension that annotates **`$TICKERS` on any website** with live
> TraderDaddy Pro options-flow, gamma bias, put/call, and IV rank — a lens over
> the whole web.

**Status:** ✅ MV3 extension built (Chrome + Firefox). Runs keyless in demo mode;
add your `td_live_` key to go live. See [SPEC.md](./SPEC.md) for the design.

Part of the [TraderDaddy Pro](https://traderdaddy.pro) open-source family, alongside
[DaddyBoard](https://github.com/mphinance/daddyboard), built on
[`@traderdaddy/sdk`](https://github.com/mphinance/traderdaddy-sdk).

---

## Install

**Prereq:** Node ≥ 18, and the [`traderdaddy-sdk`](https://github.com/mphinance/traderdaddy-sdk)
repo checked out **next to** this one (`../traderdaddy-sdk`) — the build bundles
it from source until the SDK is published to npm.

```bash
git clone https://github.com/mphinance/daddylens
cd daddylens
npm install
npm run build          # → dist/chrome/   (npm run build:firefox for Firefox)
```

### Load in Chrome

1. Open `chrome://extensions`.
2. Toggle **Developer mode** (top-right) on.
3. Click **Load unpacked** and select the **`dist/chrome`** folder.
4. DaddyLens is now active. It runs in **demo mode** immediately — no key needed.

`npm run watch` rebuilds on change; click the extension's **reload** icon in
`chrome://extensions` to pick up a new build.

### Load in Firefox

`npm run build:firefox`, then `about:debugging` → **This Firefox** → **Load
Temporary Add-on** → pick any file in `dist/firefox`.

## Usage

- Browse to X, Reddit, StockTwits, a Substack post, or any page with tickers.
- `$NVDA`-style **cashtags** are detected everywhere; **bare** symbols like
  `NVDA` are detected on the allowlist domains (X / Reddit / StockTwits /
  Substack by default).
- **Click** a highlighted ticker to open the popover (unusual activity, gamma
  bias, put/call, IV rank). Switch to hover in settings.

## Go live with your key

1. Right-click the DaddyLens icon → **Options** (or `chrome://extensions` →
   DaddyLens → **Extension options**).
2. Paste your `td_live_…` key, **uncheck Demo mode**, **Save**.

Your key is stored in `browser.storage.local` and is only ever sent to
`api.traderdaddy.pro`. It is never bundled, logged, or shared. No-key users stay
in demo mode.

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

## Development

```bash
npm run build          # bundle to dist/chrome
npm run build:firefox  # bundle to dist/firefox
npm run watch          # rebuild on change (Chrome)
npm run typecheck      # tsc --noEmit
npm test               # detector unit tests
```

Source lives in `src/` (`content/`, `background/`, `options/`, `shared/`); the
build (`scripts/build.mjs`, esbuild) merges `src/manifest.base.json` per target.
Rate-limit discipline is deliberate: symbols are only *marked* on scan — a busy
feed costs **zero** API calls until you actually open a popover, and the SDK
caches per tool. Full design in [SPEC.md](./SPEC.md).

### Not done yet (milestone 6)

- Extension icons (`assets/icon-{16,48,128}.png`) + restore the manifest `icons`
  block before store packaging.
- Swap the `file:../traderdaddy-sdk` dep + esbuild alias for the published
  `@traderdaddy/sdk` npm package once it's on the registry.
