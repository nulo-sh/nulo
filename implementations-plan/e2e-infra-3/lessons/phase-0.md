# Phase 0: planning consults and probes

## 2026-10-27 · Probes

- Firefox 153.0.4 and 158.0 omni.ja, read in place (`chrome/remote/content/shared/webdriver/`): 153 dismisses file pickers only under `remote.bidi.dismiss_file_pickers.enabled` (default false); 158 drops the pref and dismisses when `unhandledPromptBehavior` sets `file` to anything but `ignore`. Both dismiss through `FilePickerHandler`, a factory whose `open` calls `done(returnCancel)` at once.
- Firefox 158's BiDi `setViewport` resolves its context without privileged scope, then sets the embedder `<browser>`'s `style.width/height` and calls `synchronouslyUpdateRemoteBrowserDimensions(true)`. 158's `script.evaluate`/`callFunction` and `browsingContext.getTree` accept privileged scope (`moz:scope: "chrome"`).
- `puppeteer-core@25.14.0` pins `stable_158.0`; geckodriver here is 0.37.1; both Firefox revisions are in the host's Puppeteer cache.
- Terms 1.2 (material) is in `dev` and `v1.1.0`; the v1.0.0 recording accepts 1.1, so its replay is stale, not current.

## 2026-10-27 · Panel round 1

- **Codex r1** (`gpt-6.1-sol`, high, fresh session): `conditional approve` with five medium findings: Checking's absence is not fee readiness (a saved pick shows no Checking while the read is pending; code trace); the null-viewport reset is undefined; Phase 3's stop rule turns a null result into a refutation; the verdict marker was selected by a data attribute, not a testid; the network gates ran with the network config's two retries and no Chrome coverage. Position: #1222 wholly in arc 2.
- **Opus (Plan)**: `conditional approve`. High: the verdict is per route; after a reload into a preset hash the sheet judges the start location first and reads `hidden` before the router lands, so S7's control would resolve. Medium: Phase 3's stop rule and an unproven arming (the suite's session is classic plus BiDi, `session.new` answered locally); Phase 4's `textFates` comparison cannot fail; the null reset; fuller gates. Low: "no such window" missing from `targetGone`; a saved pick hides the pending read. Fact fixes: `wallet-pages.ts:166` reads `data-service-ready`; four call sites in three files; the degraded notice replaces the row, "Select method" replaces Checking; 27 `setViewport` calls in 17 files and 32 files under `tests/e2e`.
- Verified before folding: the start-location verdict (`legal-sheet.ts:27`, empty meta), the chaos run's settled-but-arbitrary route (`profile-chaos/run.ts:488-493`), the saved-pick path (`FeeSettingsCard.vue:203,415-419`), the counts (grep), `NULO_E2E_RETRY` in `vitest.e2e.network.config.ts:27`.
- All taken except Codex's "#1222 wholly in arc 2": kept in arc 1 under the condition Codex itself named, a material benefit shown by Phase 3 (D5).

## 2026-10-27 · Final pass

- **Codex final** (fresh session, `gpt-6.1-sol`, high): `conditional approve`. Medium: a `null` reset that deletes the WeakMap entry lets `viewportOf` fall back to Puppeteer's stale viewport (demonstrated in the proposed algorithm, Puppeteer's `bidi/BrowserContext.js:249-251`); the verdict alone would miss a sheet rendered regardless of `visible`, so keep the DOM absence check (plausible). Low: F3 overstated (the status starts `loading`), and the router is vue-router 5.2.0. It upheld F3's in-app navigation claim from the installed router and Vue scheduler sources.
- All three taken. **Resumed:** `approve`, no new material finding.
