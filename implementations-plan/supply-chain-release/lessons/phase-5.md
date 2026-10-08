# Phase 5: no fingerprintable content script

- **Step 1 did not apply.** The built content chunk (`assets/content.ts-*.js`) imports `./handlers-*.js`, which imports `./crypto-*.js`; the loader is a static IIFE that `import()`s the chunk through `chrome.runtime.getURL`. All three chunks must stay web-accessible.
- **The exposure is real and measurable.** From a page served at `https://dapp.example/` (request interception), `fetch("chrome-extension://<id>/assets/<chunk>.js")` answers `200` for each listed chunk on the current build.
- **Step 2 breaks the content script.** A post `renderCrxManifest` hook (registered after `crx()`, since crxjs's own entry generation is a post hook too) set `use_dynamic_url: true`. The page's fetches were then refused, and `chrome.runtime.getURL` in the content script's isolated world returned the dynamic URL (`chrome-extension://<uuid>/…`). But the chunk's relative `import "./handlers-*.js"` resolved against the static origin, and Chrome refused it: `Denying load of chrome-extension://<static id>/assets/handlers-*.js. Resources must be listed in the web_accessible_resources manifest key`. `cold-wake-discovery` went red on all three attempts (the discover popup never appears). Measured on Chrome 152 with a throwaway CDP probe that evaluated `import(chrome.runtime.getURL(...))` inside the content script's world. This is the known reason crxjs hard-codes `use_dynamic_url: false`. Inference I6 did not hold.
- **Stopped per the plan's step 3 (later reversed, below).** Hook, wiring and smoke check reverted; SECURITY.md and `manifest.test.ts` now state the exposure and why `use_dynamic_url` cannot close it; OWNER-ASKS.md carries the options, recommending a self-contained content-script build.
- **`git checkout <file>` to undo a temporary edit also drops uncommitted work in that file.** Back the file up instead.
- **`pkill -f '<pattern>'` matches the shell running a chain whose command line holds the pattern**, including the agent's own Bash call. It killed the background chain after Firefox discovery had passed; its last child (`pxe-host-state`, against the broken build) was then stopped by its own process group (`kill -TERM -<pgid>`), whose teardown reaped the anvil it had started. Use the pgid from the start.

## Arc 2 review, round 1

- **Codex: `approve with fixes`, 5 findings, 4 accepted in full, 1 in part** (plan § Audit verdicts). The useful one: an exemption written for a shape the lockfile does not have today (`link`) is a hole the next regeneration can walk through; exempt only what another check covers (bundled entries ride their parent's integrity).

## #22 closed by isolating the content script's module graph

- **Read what the chunk imports before choosing the heavy fix.** The content chunk needed only three enums from `handlers-*.js`; `crypto-*.js` came along because the wallet-sdk barrel re-exports the background handler from the same chunk (Opus review). A separate Vite pass was not needed.
- **An `enforce: "pre"` resolve hook that suffixes ids (`?content-script`) for the content entry and its descendants gives them their own modules,** so Rolldown builds an import-free chunk; crxjs 2.7.1 then wraps it as an IIFE with no loader, but still lists the file as web-accessible, which a post `renderCrxManifest` hook registered after `crx()` removes.
- **Measured:** both built manifests list no `web_accessible_resources`; the content chunk is 3.6 KB with no `import`/`export`; the smoke check passes on Chrome and Firefox and fails on a build without the hook (`Set{'refused',200}`); with wallet-sdk in a vendor group the build fails on `assets/content.ts-loader-*.js` (no VENDORED entry).
- **Firefox's `getManifest().web_accessible_resources` is `null` when absent, Chrome's `undefined`;** `extensionUrl` needs a leading `/` on Firefox.
- **A resolve hook's test under vitest cannot use `import.meta.url` as a file path** ("The URL must be of scheme file"); derive paths from `config.root` in `configResolved`.

## Arc 2 review, rounds 2 and 3

- **Codex round 2: `approve with fixes`, 3 Low, all accepted (`2a6d556`); round 3: `approve`.** The lesson worth keeping: a guard that checks known anchor lines in a downloaded script proves the anchors survive, not that nothing was added around them, so the runbook must still ask for a whole-body read.
- **zsh does not word-split `set -- $var`**, so a `for run in "a b"; do set -- $run` loop hands the whole string to `$1`. Run such chains under `bash`.
- **`process.env.X ?? "default"` keeps an empty string**, so `NULO_E2E_BROWSER=` (empty) is refused by the suite's browser resolver; pass `chrome` explicitly.
