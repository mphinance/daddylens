# Prompt pack — make DaddyLens yours

DaddyLens is a browser extension that annotates `$TICKERS` on any page with
TraderDaddy Pro data. You don't need to be an extension expert to customize it —
pick a prompt, paste it into your AI coding tool (Claude Code, Cursor, …) inside a
clone of this repo, and let it drive. Everything works in **keyless demo mode**,
so you can build and reload without a key.

> **First, always:** tell your AI to read `CLAUDE.md` (and `SPEC.md` for design
> depth) in this repo.

---

## 1. Add a field to the popover

```
I want to show more in the ticker popover. Read CLAUDE.md first — the SDK is
instantiated only in src/background/fetcher.ts, and the popover UI is in
src/content/popover/.

What I want to add: [e.g. "the flow description text" / "the gamma flip point" /
"IV percentile alongside IV rank"].

Steps:
1. If the data isn't already fetched, add it in fetcher.ts from the existing four
   tool calls (unusualActivity / gexTicker / putCallRatios / ivRank) — don't add a
   new API call unless it's truly needed (rate-limit discipline matters here).
2. Thread it through the Cards type in src/shared/types.ts.
3. Render it in the popover cards.
Build with `npm run build`, reload the unpacked extension, and test in demo mode.
Show me the plan first.
```

---

## 2. Change which sites / symbols get detected

```
I want to change ticker detection. Read CLAUDE.md and src/content/detect.ts +
src/content/scanner.ts first (detect.ts has unit tests in tests/).

What I want: [e.g. "also detect bare symbols on finance.yahoo.com" / "stop
matching common false-positive words like CEO or USA" / "only detect $-prefixed
cashtags, never bare symbols"].

Keep the scanner's rule intact: it only MARKS symbols on scan — no API call until
a popover opens. Update the detector tests to cover my change and run `npm test`.
Show me what you'll change before editing.
```

---

## 3. Restyle the popover

```
Restyle the ticker popover. Read src/content/popover/ first (Popover.ts +
popover.css). It renders inside a Shadow DOM, so host-page CSS can't reach it —
keep all styling scoped there.

What I want: [describe the look — colors, spacing, layout]. This is presentation
only; don't change fetcher.ts or the data flow. Build, reload, and show me
before/after in demo mode.
```

---

## 4. Package it for the store

```
Help me package this extension for the Chrome Web Store (and/or Firefox AMO).
Read CLAUDE.md and the README's "Development" + "Remaining before store
submission" sections first.

Walk me through, as a beginner:
1. `npm run package` (and `package:firefox`) to produce the store zip.
2. What the README says still needs doing before submission (the SDK npm swap,
   listing screenshots/copy).
3. The key-safety model to state in the listing: users bring their OWN key, it's
   never bundled, no-key users get demo mode.
Explain each step.
```

---

## 5. Contribute your improvement back

```
I made a change others would want. Help me contribute it back as a pull request.
Read CLAUDE.md first and match its conventions (rate-limit discipline, Shadow-DOM
scoping, the one SDK instance in fetcher.ts).

Before the PR:
1. Run `npm run typecheck` and `npm test` and fix anything red.
2. Confirm no API key is committed anywhere.
3. Help me write a clear commit message and open the PR against `main` on GitHub.
Explain each step so I learn the flow.
```

---

## Tips

- **Build + reload to test.** `npm run build`, then click the reload icon on the
  extension in `chrome://extensions`. `npm run watch` rebuilds automatically.
- **It runs keyless.** Demo mode works the moment it's loaded — no key needed to
  develop. Add your own key in Options only when you want live data.
- **Respect the rate-limit discipline.** Symbols are only *marked* on scan; calls
  happen on popover open. Don't let your AI add eager prefetching.
- **Never bundle a key.** Keys live in the user's `browser.storage.local`, pasted
  in the options page — never in the source or the zip.
