# Phase 7 — one directive at a time

Each directive is gated by the armed smoke suite on Chrome and Firefox (3 local shards each, retry 0) and the eight network files on Chrome and then Firefox (`e2e:agent`, retry 0), with the CSP violation recorder armed throughout.

## The `[::1]` probe (OA-4)

Method (scratch, never committed): a Node HTTP server bound to `::1` that counts hits per path and answers with `access-control-allow-origin: *`; the armed build copied, with only `manifest.json`'s policy rewritten; a probe spec that fetches `http://[::1]:<port>/popup` from the popup and reads the record.

| Policy's `connect-src` | Chrome | Firefox |
|---|---|---|
| `'self' https: http://localhost:* http://127.0.0.1:* http://[::1]:*` | refused: `Failed to fetch`, a `connect-src` violation for `http://[::1]:<port>`, no server hit | refused: `NetworkError`, the same violation, no server hit |
| the same without `http://[::1]:*` (control) | refused, identically | refused, identically |
| `'self' https: http:` | `200`, one server hit, no violation | `200`, one server hit, no violation |
| none (today's policy) | `200`, one server hit | not run |

Both browsers ignore the `[::1]` source: the precise list behaves exactly like the control. So `http:` ships and OA-4 stays open. The offscreen fetch was not reached (a smoke launch with no profile has no PXE host yet); a host source is parsed the same way in every document under one policy, so the popup result stands for both.

## Directives
### `connect-src 'self' blob: https: http:`

- First run, `connect-src 'self' https: http:`: Chrome smoke green, zero violations. Firefox smoke red on every test that downloads a file (account export and import, both backup round trips, contacts export, the imported-account lifecycle, legal S5/S6, the toolbar-panel backup): `connect-src` violations from `/src/popup/index.html` blocking `blob`. Firefox checks `downloads.download({ url })` against the calling page's `connect-src`, and `utils/files.ts` downloads a `blob:` URL; Chrome does not check it. The downloads failed, so this was breakage, not noise.
- Source added: `blob:` in `connect-src`, the source the violation names. A blob URL names data already in the browser's memory, so the source opens no network destination.
- The same run's Firefox `migration.test.ts` throwing-migration failure was not load (see below).
- The network leg of that run was stopped to rebuild with `blob:`; the gate was rerun from the start.
- Rerun with `blob:`: Chrome smoke and Firefox smoke green with zero violations apart from the migration case below; the eight network files green on Chrome and on Firefox (8 of 8 each, 14 tests), CSP equal to the pin.

## The close check raced the migration retry on Firefox

The throwing-migration case failed again in the rerun, once on the 60 s timeout and once with the version converged but `nulo:schema:blocked` still present. Alone on an armed build it failed 2 runs of 3; with `NULO_E2E_CSP_REPORT` unset on the same build it passed 3 of 3 (31-38 s). So phase 6's "load" verdict was wrong: the close check caused it.

- Timing: each check's read took 0.5-1.2 s and its close about 1 s, so the budget was not the cause.
- Mechanism: the Retry button calls `runtime.reload()`. Firefox reloads the add-on in place, and the new background consumes the gesture token and starts the engine. The test used to close the browser at once, so the relaunch did the run. The check held the browser open about 2 s longer, the in-place boot took the token, and the close killed its run midway. The relaunch then met a persisted non-terminal block with no token, and the gate parked it, sometimes after the version had already been stamped.
- Fix: `ExtensionContext.checkCspViolations()` checks the record on demand, and `retryAndReopen` calls it before the click. The reload discards the record anyway (Chrome disables the unpacked build; Firefox starts a fresh `storage.session`), so the close after it is the plain, immediate teardown again. This also checks that launch on Chrome, which the disabled-extension pass used to skip, so `EXTENSION_DISABLED` is gone.
- Result: `migration.test.ts` armed, 3 of 3 on Firefox (39-41 s for the case) and 1 of 1 on Chrome.

## Phase 6's typecheck claim

`vue-tsc` reported `zod-jitless.ts` "is not a module" for its test's dynamic import: a file with no import or export is a script to TypeScript. The phase 6 gate missed it because the exit code read was `tail`'s. `export {}` makes it a module; `typecheck:all` now exits 0, read directly.

### `font-src 'self'`

- Every face the build loads is an extension asset (`/assets/*.woff2`, from `@nulo/design`), and the Presto banner is mounted with `fonts="none"`, so it links no Google Fonts stylesheet.
- Gate: smoke green on Chrome and Firefox (Firefox's migration case included, with the early check), the eight network files green on both, zero violations, CSP equal to the pin. No source added.

### `style-src 'self' 'unsafe-inline'`

- `style-src 'self'` alone, `onboarding-tab.test.ts` on both browsers: one or two inline `style-src-elem` violations per launch that reached the Presto step, from `/src/onboarding/index.html`. Source: the `<presto-banner>` element writes `<style>${STYLES}</style>` into its shadow root (`@alejoamiras/presto-banners` 1.1.0, `element.js:145`). `STYLES` is a constant, so its hash was added, with a unit test deriving the hash from the installed banner (it failed when the hash was altered).
- Full gate with the hash: Chrome smoke green, Firefox smoke red on `rows.test.ts`, an inline `style-src-elem` from the logger window (`/src/popup/index.html`). A probe that mounted the logger window and waited for `.cm-content` recorded the same violation on both browsers; Chrome's smoke missed it because the test closes the window right after it opens, and a report still in flight from a closing document is lost (a named gap).
- Source: CodeMirror's `style-mod` uses `adoptedStyleSheets` only inside a shadow root; in a document it writes a `<style>` element and rewrites its `textContent` as each theme mounts. Its text is generated, so no hash names it, and a hash in the directive switches `'unsafe-inline'` off. `'unsafe-inline'` it is, which also covers the banner; the hash and its test went (D-23h).
- `tab-size` on `.cm-content` is not affected: CodeMirror writes its `style` attribute through `style.cssText`, which CSP does not govern (the probe read `tab-size` 4 on both browsers).
- What the directive still buys: no stylesheet from another origin (the banner's Google Fonts link, were `fonts="none"` dropped). Narrowing it further means mounting the editors in a shadow root, a UI change; recorded for follow-ups.
- Gate with `'self' 'unsafe-inline'`: smoke green on Chrome and Firefox, the eight network files green on both, zero violations, CSP equal to the pin.

### `frame-src 'self'`

- The only frame any page loads is Firefox's offscreen document, hosted as a frame of the background page from the extension's own origin.
- Gate: Chrome smoke green; Firefox smoke green except `passkey-retry.test.ts`'s closing `waitForToastGone(…, 1_000)`, the same timing failure phase 6 saw once on Chrome, with no violation recorded. Alone it passed 2 of 2. It is now row 46 of the e2e-testing skill's flake ledger: a 1 s budget that a loaded host spends on the first poll's round trip. The eight network files green on both browsers, zero violations, CSP equal to the pin. No source added.

### `media-src 'self'`

- No page plays audio or video (no `<audio>`, `<video>` or `Audio` in the build).
- Gate: smoke green on Chrome and Firefox, the eight network files green on both, zero violations, CSP equal to the pin. No source added.

### `object-src 'self'`

- No page embeds an `<object>` or `<embed>`.
- Gate: smoke green on Chrome and Firefox, the eight network files green on both, zero violations, CSP equal to the pin. No source added.

### `default-src 'self'`, and the directives that equal it removed

- Final policy: `default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; img-src 'self' data: blob:; connect-src 'self' blob: https: http:; style-src 'self' 'unsafe-inline'`. `font-src`, `frame-src`, `media-src` and `object-src` now come from `default-src`, as does `manifest-src`; `worker-src` still falls back to `script-src`, unchanged by the arc.
- `store/remote-code.md` now cites the new block and states what the policy does and does not prove: `connect-src` admits any HTTPS host, so the bundled loaders, not the policy, keep the WASM local; zod no longer tries `Function()` at all.
- Gate: the Arc 3 gate below runs on this policy; it is a superset of the per-directive gate (the eight files are in the full network suite).
