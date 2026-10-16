# home-onboarding-2: recon

Base: `origin/dev` at `dfdf4c31`. Two Explore agents (sonnet): a reuse sweep over ten capabilities, and a map of the Firefox e2e harness. The planner read the pages, the composable, the archived lane [home-onboarding-chrome](../home-onboarding-chrome/plan.md) and Firefox 153.0.4's own extension modules.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| #132 header change | `RecentActivityView.vue:847` and `:925` carry no `section_header` class; #348 (`19629fdb`) removed the 8 px padding and the hairline rule from both headers | nothing to build |
| Read and request the loopback grant | No production `chrome.permissions` call (searched `permissions\.(contains\|request\|remove\|onAdded\|onRemoved\|getAll)` over `apps`, `packages`, `scripts`, `.github`, e2e included); `utils/files.ts:42` only documents avoiding it | build new: `composables/usePrestoHostPermission.ts` |
| Browser detection | `utils/browser-surface.ts:2` `isFirefox()` (reads `chrome.runtime.getBrowserInfo`) | reuse as is |
| Async-read fence | `composables/runFence.ts` `createRunFence`; pattern in `useLegalAcceptance.ts` (subscribe before the first read, `dispose` invalidates); `chrome.*` listener precedent `usePinnedTokens.ts` (`chrome.storage.onChanged`, test fakes `addListener`/`removeListener`) | reuse |
| Presto check | `usePrestoCheck.ts`: `start()` probes only when the `prestoReached` flag is set, else rests `idle`; `check()` forces a probe and records the flag | reuse as is (D2) |
| The row's parts | `@nulo/design` `Banner` (`warning`, `vertical`; its own action button has no focus ring); design `Button` (`.wrapper:focus-visible`, 2 px solid accent) through the extension's `components/ui/Button.vue` | reuse; new `components/PrestoPermissionRow.vue` |
| Cross-shell home | `src/components/` flat, beside `PrestoStatusCard.vue`; `PermissionRow.vue` exists in `components/composite/capabilities/` (unrelated) | new name `PrestoPermissionRow` (no tag clash) |
| Page tests | `onboarding/pages/presto.test.ts` (mocks `usePrestoCheck`, pins the footer's `v-snack-footer` value); no `proving.test.ts` | extend; build new `proving.test.ts` |
| Logging | `console.debug("<fixed message>", { error })` (`useScopedTokens.ts:49`) | reuse |
| Manifest pins | `src/manifest.test.ts:78-81` pins the shared manifest (nothing optional); Firefox block (`:133`) pins no host permission; `scripts/store-listing.test.ts:34` checks `permissions` and `host_permissions` of both builds against `store/listing.md` headings (loopback at `:107`, `:112`) | adapt both |
| A test-only Firefox pref | `LaunchOptions.egress` → `egressGuardPrefs`, kept out of `FIREFOX_LAUNCH_PREFS` (`fixtures/browser/firefox.ts:261-305`), pinned in `scripts/e2e/firefox-driver.test.ts:34-73` | adapt: one more `LaunchOptions` field |
| Firefox-only spec | `FIREFOX_ONLY` reasons (`fixtures/browser/index.ts:205-214`); `describe.skipIf(!isFirefox)(FIREFOX_ONLY.<reason>, …)` allowed (`FIREFOX.md:9`) | add one reason |
| Real click, Tab, ring | `pointerClick` (`helpers/legal-drivers.ts:186`, hit-tested; an evaluated click is no user gesture on Firefox, `FIREFOX.md:36`); `tabTo`, `focusRing` (`helpers/pointer-probes.ts:67`, `:119`); `gotoPrestoStep` and `interceptHealth` (`onboarding-tab.test.ts:27`, `fixtures/presto.ts:29`) | reuse |
| Firefox lint | `bunx web-ext@10.6.0 lint --source-dir apps/extension/dist/firefox --self-hosted` (`FIREFOX.md:88`), manual, in no workflow | reuse as a gate step |

## Facts the plan rests on

- **Firefox merges the lists.** Firefox 153.0.4 (`modules/Extension.sys.mjs`, from the browser's `omni.ja`): `manifestOptionalPermissions` (`:1357-1384`) builds one set from `optional_host_permissions` and, for an MV3 extension (`originControls`), the manifest's own origins; the install grant reads `getManifestOrigins()` (`:1338-1346`, `:4390-4400`). An origin listed in both lists is one optional origin, granted at install as today.
- **The probe of 2026-10-13** ([lessons/phase-2.md](../home-onboarding-chrome/lessons/phase-2.md)):
  - `permissions.request` grants an origin listed only in `host_permissions`.
  - With `extensions.webextOptionalPermissionPrompts=false`, a hit-tested click's request resolves `true` with no doorhanger.
  - Withholding needs both loopback origins and `*://*/*` removed.
  - A withheld permission does not stop an extension page or the background from reaching a CORS-answering loopback server. `/health` then carries the extension's `Origin`, so Presto serves its minimal body until it approves Nulo.
- **The stand-in node needs the grant.** The smoke launch's stand-in node is a loopback redirect that relies on the loopback grant (`FIREFOX.md`, "There is no CDP" row). A spec that withholds it while a registered wallet polls the node risks errors that are the harness's own, so the e2e uses a fresh install (onboarding, no profile, no node traffic).
- **No collision.** #363's colour sweep (`shot/p18-363-c`) edits `PrestoStatusCard.vue` and `RecentActivityView.vue`, which this lane does not touch. chain-endpoints arc 2 edits `manifest.config.ts` and the shared blocks of `src/manifest.test.ts`. This lane edits only `manifest.firefox.config.ts` and that test's Firefox block. The merge risk is textual.
- **Known limits** in the area (`gh issue list --state closed --label known-limit`): #352 (own windows), unrelated.
