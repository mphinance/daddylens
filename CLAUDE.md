# CLAUDE.md — agent ground-truth for DaddyLens

> Read this first. The short, factual map for working in this repo. Tool-agnostic
> — copy to `AGENTS.md` if you use Cursor/other.
>
> **Want to customize it by talking to your AI?** See [`PROMPTS.md`](PROMPTS.md).
> Full design rationale lives in [`SPEC.md`](SPEC.md).

## What this is

A **Manifest V3 browser extension** (Chrome + Firefox) that detects `$TICKER`
symbols on any webpage and shows a popover with live TraderDaddy Pro flow, gamma
bias, put/call, and IV rank. It's **[`@traderdaddy/sdk`](https://github.com/mphinance/traderdaddy-sdk)
+ a thin extension shell** — the SDK owns transport, cache, and 429 backoff.
Isomorphic, so the same client runs in the background service worker unchanged.

## The one rule

`src/background/fetcher.ts` is the **only** place the SDK is instantiated (the
`clientFor()` helper, rebuilt when key/mode changes). The content script and
options page never touch `@traderdaddy/sdk` directly — they message the
background worker. Don't scatter `new TraderDaddy(...)`.

## Repo map

| Path | What |
|---|---|
| `src/background/fetcher.ts` | The one SDK instance; distils 4 per-symbol tools into popover `Cards`. |
| `src/background/index.ts` | Service-worker message router. |
| `src/content/detect.ts` | Cashtag / bare-symbol detection (unit-tested). |
| `src/content/scanner.ts` | DOM scan + marking. **Marks only — zero API calls until a popover opens.** |
| `src/content/messaging.ts` | Content ↔ background bridge. |
| `src/content/popover/` | `Popover.ts` + `cards.ts` + styles — the Shadow-DOM UI. |
| `src/options/` | Options page: paste your `td_live_` key, toggle Demo mode. |
| `src/shared/` | `settings.ts` (key storage + `isLive`), `symbols.ts`, `types.ts`. |
| `src/manifest.base.json` | MV3 manifest; `scripts/build.mjs` merges per target. |
| `scripts/build.mjs` | esbuild bundle → `dist/chrome` (or `dist/firefox`). |
| `tests/detect.test.ts` | Detector unit tests. |

## Commands

```bash
npm install
npm run build          # → dist/chrome/    (build:firefox → dist/firefox/)
npm run watch          # rebuild on change (Chrome)
npm run package        # build + zip → dist/daddylens-chrome-<version>.zip
npm run icons          # regenerate assets/icon-*.png (needs Python + Pillow)
npm run typecheck      # tsc --noEmit
npm test               # node --test --import tsx — detector tests
```

Load the unpacked `dist/chrome` folder via `chrome://extensions` (Developer mode
→ Load unpacked). It runs in **demo mode immediately, no key**.

## Conventions (match these)

- **Rate-limit discipline is a feature, not an accident.** The scanner only
  *marks* symbols on scan; an API call happens **only when a popover opens**. A
  busy feed costs zero calls. Don't add eager prefetching.
- **Each popover = four per-symbol tools**: `unusualActivity`, `gexTicker`,
  `putCallRatios`, `ivRank`, fetched with `Promise.allSettled` so one failure
  doesn't blank the card. Keep that resilience.
- **Shadow DOM for the popover** so host-page CSS can't leak in. Keep styles scoped.
- **`RateLimitError` → "cooling" state, not an error.** Live-mode total failure →
  `AuthLikelyError` ("check your key"). Preserve that distinction.

## Gotchas

- **Key safety: personal-use.** The user pastes *their own* key in the options
  page; it lives in `browser.storage.local`, only goes to `api.traderdaddy.pro`,
  and is **never bundled**. No-key users get demo mode. Never hard-code a key.
- **SDK dep is `file:../traderdaddy-sdk`** + an esbuild alias — the SDK repo must
  be checked out next to this one and its `dist/` built. Swap both for the npm
  `@traderdaddy/sdk` package once published (see "Remaining before store submission"
  in the README).
- **MV3 service workers are ephemeral** — don't rely on long-lived in-memory
  state beyond the SDK's cache; the client is rebuilt on demand.

## Where to look when unsure

- Design rationale → [`SPEC.md`](SPEC.md)
- The SDK's methods + shapes → [SDK README](https://github.com/mphinance/traderdaddy-sdk#methods)
- Prompts to customize this extension → [`PROMPTS.md`](PROMPTS.md)
