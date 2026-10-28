# e2e-infra-3 recon

Base: `origin/dev` at `78f5f9171`. One Explore agent (sonnet) inventoried the seam call sites; the rest was read by the planner. The agent reported `node_modules` missing; it is installed (`apps/extension/node_modules`, root `node_modules/.bun`), so its one unverified point (Puppeteer's BiDi defaults) is open, not absent.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| A marker that the Terms sheet has a verdict | `app.vue:120` `legalSheetShown` (undefined, then the sheet's `visibility` emit, `LegalAcceptanceSheet.vue:75-79,89`); the shell already carries e2e state attributes (`app.vue:607-610`, read by attribute: `[data-service-ready="true"]` in `fixtures/wallet-pages.ts:166`, `[data-session-checked="true"]` in `own-window.test.ts:49`) | adapt: one more shell attribute |
| The update scenarios' Terms answer | `helpers/legal-drivers.ts:182-191` `answerUpdatedTerms`, callers `update-replay.test.ts:551,595`, `network/update-in-place.test.ts:362`, `helpers/profile-chaos/pre-update.ts:124` | adapt |
| A reload into an acceptance state | `reloadWithLegalState` (`legal-drivers.ts:162`), `legalSeedValue` (`fixtures/legal.ts`) | reuse |
| A "fee card settled" signal | `send-fee-privacy.test.ts:25-28` (`SETTLED`: a method on the trigger or `fee-init-degraded`), `fixtures/send-page.ts:87` `waitForFee` | not reused: both accept a card still reading (a saved pick shows while pending, `FeeSettingsCard.vue:202-203`) |
| Self-ending UI waited out before the 240 px record | `expectFitsNarrow` (`fixtures/type-roles.ts:755-777`) waits out a success snack | adapt: same place, one more wait |
| A marker for "this card's read is in flight" | `readPending` (`FeeSettingsCard.vue:207`); the card already exposes `data-origin` and `data-sponsor-funding` | adapt: one more attribute |
| Picker dismissal by the automation | Firefox Remote Agent `FilePickerHandler.sys.mjs` (a factory whose `open` calls `done(returnCancel)` synchronously); 153 enables it by `remote.bidi.dismiss_file_pickers.enabled` (default false, `Session.sys.mjs:43-48,389-396`); 158 by `unhandledPromptBehavior.file` other than `ignore` (`#shouldDismissFileDialog`) | reuse Firefox's own |
| Launch prefs that are not what users run | `egressGuardPrefs`, `permissionRequestPrefs` (`fixtures/browser/firefox.ts:270,289`) | reuse the pattern |
| Focusing a page on Firefox | `WebDriverSession.switchToWindow` (`webdriver-classic.ts:91`) selects the tab and focuses its window; `navigateWindow`/`refreshWindow` already do it; `contextIdOf` (`firefox.ts:370`) turns a `Page` into its handle | reuse for `bringToFront` |
| Addressing a tab's `<browser>` in privileged scope | `closeTab` (`firefox.ts:748`): `chromeScript` + `NavigableManager.getBrowserById` | adapt for `setViewport` |
| Resizing a content `<browser>` | none in the repo (searched `embedderElement`, `synchronouslyUpdateRemoteBrowserDimensions`, `window/rect`, `resizeTo`, `outerWidth`); Firefox's own BiDi `setViewport` sets the embedder's `style.width/height` and calls `synchronouslyUpdateRemoteBrowserDimensions(true)` (158 `browsingContext.sys.mjs:3060-3095`) | build new, mirroring Firefox |
| Banning direct calls | `browser-seam.test.ts`: `directReloads` + `RELOAD_DEBT` (`:186`, `:167`), `calledMember` (`:98`), `inAsync` guard cases | adapt |
| Driver unit tests | `scripts/e2e/firefox-driver.test.ts` (pure, `vi.fn` stubs; pins the revision, the CI action and its cache key at `:127-160`) | adapt |

## Seam inventory (#1111)

- Under `tests/e2e`: `.bringToFront(`: 36 calls in 18 files; `.setViewport(`: 27 in 17 (plus `scripts/store-art.ts`); `.viewport()`: 3 (`fixtures/type-roles.ts:731`, `onboarding-tab.test.ts:71`, `network/window-placement.test.ts:177`, diagnostic); `atWidth(`: 5 callers. 32 `.ts` files: 28 specs, `fixtures/{wallet-pages,send-burst,type-roles}.ts` and the driver's own `firefox.ts`, whose `prepareClick` (`:403`, swallows every error) and `prepareKeys` (`:442`) call `bringToFront`.
- Five `bringToFront` sites are dApp pages on http (`connect-verify-mismatch:86`, `connect-check-window:296`, `send-chaos:74`, `same-token-concurrent-sends:461,528`); everything else is an extension page.
- Six `setViewport` sites carry `deviceScaleFactor: 2` and run on Chrome only (`network-arrival:146,161`, `stale-network-captures:86`, `network/stale-network-a10-capture:46`, `network/store-captures:373,406`). `scripts/store-art.ts:58` is its own Chrome launch, outside `tests/e2e`.
- `page.viewport()` is Puppeteer's memory of the last `setViewport`; `atWidth` and `onboarding-tab` restore from it.
- Pin readers: `firefox-revision.ts:7`; `firefox.ts:240` (exact-match lookup, `FIREFOX_PATH` overrides); `scripts/e2e/install-firefox.ts`; `.github/actions/setup-puppeteer/action.yml:34` (cache key hashes the pin file, no restore keys); `firefox-driver.test.ts:127-160`.
- Version-tagged claims a pin move re-verifies: FIREFOX.md `:36-40` (the pin), `:47` (`runtime.reload`), `:64` (the page-error relay: a failed arming or capture check holds the bump), `:75` (drag selection), `:77` (`getLastFocused`), `:79` (screenshot clip); e2e-testing skill `:32`, `:733`, `:741-745`; `firefox.ts:32`.

## Open work and limits

- Open issues the lane resolves: #1123, #1111, #1210, #1222. Collisions: none (`gh issue list --state all` for "type-roles", "file picker", "bringToFront", "Firefox 158", "legal sheet"). Closed limits nearby: #1030 (240 px check and absolutely positioned boxes), #704; neither touches these paths.
- A prior occurrence of #1222: `archive/passkey-unlock-1/lessons/phase-A2.md` (run 2 of 5, load near 120).
