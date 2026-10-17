# Recon: harden-quality-fixes-3

Base: `dev` at `493ff497`. Two Sonnet explorers (the fixture import graph; the #539/#546 instances at HEAD), an AST graph of `fixtures/helpers.ts`'s top-level declarations, and a Biome `noImportCycles` probe (`biome lint --only=suspicious/noImportCycles apps/extension/tests/e2e`). Paths are under `apps/extension/tests/e2e/` unless they start at the repo root.

## Reuse map

| Need | Existing code | Verdict |
|---|---|---|
| Pin "no import cycle" | Biome 2.5.13 `suspicious/noImportCycles` (`ignoreTypes` on by default; counts dynamic imports; treats `import { type X }` as a runtime edge). Today it reports 19 cycle edges in the e2e tree. No cycle check exists (no madge, dependency-cruiser or `noImportCycles` in `biome.json`). | reuse-as-is |
| Bulk playground input setter | `setPgInput` (`fixtures/playground.ts:63`, through `replaceInputValue`). `network/same-token-concurrent-sends.test.ts:444-446` already sets `tokenAddress`, `recipient` and `amount` with it. The playground syncs on both `input` and `change` with the same handler (`apps/playground/src/main.ts:151-152`). | adapt: a 3-line `setPgInputs` over it |
| Post-restart reconnect and send | `reconnectPlayground(ctx, page, bundle, label)` and `sendDefaultTx(ctx, page, config, label, { popupTimeoutMs })` (`fixtures/send.ts:14,31`), used by five network specs | adapt: `sendDefaultTx` returns its result; the error sentinel moves into the shared call |
| Click a playground button through an approved execute window | none shared: the canaries (grant, consume, post-restart send) and `sendDefaultTx` each write click, popup, approve, result. Searched `approveExecute(` in `fixtures/` and `helpers/`: only `send.ts:46`. | build new: `runApprovedPgCall` in `fixtures/send.ts` |
| Select the dApp's acting account | none: four network specs evaluate `pg-select-account` by hand (`grep -rln pg-select-account network`). | build new: `selectPgAccount` in `fixtures/playground.ts` |
| Passkey registration | `registerPasskeyProfile` (`fixtures/passkey.ts:14-39`); `passkey-backup.test.ts:79-91` is a step-for-step copy | reuse-as-is |
| Reset ritual | `completeResetRitual` (`helpers/crash-truth.ts:51-67`), `resetProfile`'s tail (`fixtures/helpers.ts:1776-1782`), two inline copies (`passkey-backup.test.ts:46-75`, `passkey-paths.test.ts:128-160`) | adapt: extract the shared segment `confirmProfileReset` |
| Open the first network's detail | `openNetworkDetail(page, name)` (`fixtures/helpers.ts:2076`); the five `endpoints.test.ts` preludes only read the first row's name first | adapt: a spec-local `openFirstNetworkDetail` |
| Fund-and-fresh-balance in the network fixtures | `importTokenAndWaitForBalance` (`fixtures/helpers.ts:1077-1093`): baseline before import, then the fresh-row wait at 90 s | reuse-as-is |
| Smoke's Chrome cleanup | `killChromesLoading` (`sandbox-ownership.ts:201`), pinned through `chromePattern` by `apps/extension/scripts/e2e/owned-processes.test.ts:365`, used by `global-setup.ts:182` and `reap.ts:56` | reuse-as-is |
| Download capture | `armBackupDownloadCapture(page, { gzip })` / `readCapturedBackupDownload` (`helpers/backup-export.ts:31-65`); `helpers/contacts.ts:53` already uses `{ gzip: false }` | adapt: move to a neutral `helpers/download-capture.ts` |
| Stop a background only if alive | `stopBackground`, `backgroundAlive` (`fixtures/browser/index.ts:263-266`) | adapt: `stopBackgroundIfAlive` beside them |

## Claims checked against the tree

- **#544.** The cycles hold, and there are more. One strongly connected set of six runtime modules: `fixtures/{extension,helpers,popups,playground,send-page}.ts` and `helpers/legal-drivers.ts` (`send-page.ts:8` imports `legal-drivers`, which imports the hub). Biome also counts the dynamic import at `extension.ts:1082`, so `helpers/import-drivers.ts` and `fixtures/passkey.ts` join it. The issue's "move the eight DOM primitives into a leaf that imports only `./browser`" does not break every cycle on its own: `popups.ts` needs `recordPageErrors` (module state, `ExtensionContext`, `./page-errors`), and `import-drivers.ts` and `legal-drivers.ts` need `openPopup`, `openOnboarding` and `seedLegalAcceptance`. The vestigial dynamic imports are at `extension.ts:452-453` now; the cycle dodge is at `:1082`. `helpers.ts` is 2,185 lines in 17 sections; 122 spec files import it and 187 import the hub.
- **#544, a blocker the issue does not name.** `patchPagePolling` carries an accepted complexity directive on an anonymous in-page predicate (manifest entry: `fixtures/extension.ts`, score 29, "the predicate implements Puppeteer's exact exists / visible / hidden selector semantics in-page"). An anonymous callback has no move path (`.claude/skills/complexity-budgets/SKILL.md`): moving it to a new file is a new acceptance. The manifest holds 22 acceptances.
- **#546.** Every pair holds. Click: `clickSelector` (`extension.ts:1553`) refuses only native `disabled`, `clickByTestId` (`:1587`) also `aria-disabled`; of the nine `clickSelector` call sites only `helpers/contacts.ts:149` (`pressRow`) targets a control that is `aria-disabled` by design (`ImportContactsPopup.vue:227`). Chrome cleanup: smoke's `pkill` (`global-setup-smoke.ts:26-32`) also runs through `sh -c` with the path unquoted for the shell, and under Firefox it matches nothing. The token preamble has four copies (`fixtures/aztec.ts:277-299,306-335,382-406,417-435`); a fifth swallowing catch sits in `createSponsoredFeeOptions` (`:215-222`), the known limit #568. The stale "refactor once we have three" comment is at `extension.ts:685-698`; four cap fixtures already share their helpers.
- **#539.** Every instance holds, except one detail: "the `fixtures/helpers.ts` copy clicks submit without waiting for it to enable" is false. `clickByTestId`'s predicate skips a natively disabled element and polls until it is enabled (`extension.ts:1597`). The four bulk setters: the canaries key by input name, `multi-account-from` and `account-switch-live-session` by full testid. The canaries' test names are pinned in `scripts/ci-cd/canary-expectations.json`; both set `retry: 0` in the test options; CI runs them prover-ON in the `network-e2e-canary` job of both network lanes. The playground has no tests of its own, and nothing outside `apps/playground/src` reads "Not connected".

## Facts the plan rests on

- `fixtures/helpers.ts` has no module-scope side effect and no `inject()`. Module-scope `inject()` exists only in `fixtures/playground.ts:17-22` (with a fallback) and `fixtures/burst-account.ts:25`.
- `typecheck` runs `tsc -p tsconfig.e2e.json`, which includes `tests/e2e/**` (`apps/extension/package.json:24`).
- `apps/extension/scripts/e2e/browser-seam.test.ts` scans every module under `fixtures/` (outside `browser/`) and `helpers/`, so new modules are covered; `:324` requires `fixtures/extension.ts` and `fixtures/popups.ts` to exist; `:30` and `:368` name `fixtures/extension.ts` as the home of the `\//` regex that moves with `patchPagePolling`.
- `.claude/skills/e2e-testing/SKILL.md:320,630` cite `fixtures/extension.ts` line numbers that are already stale.
- Function-level calls inside `helpers.ts` form no cycle between sections. Cross-section private uses: only `dropdownDiagnostic` (Dropdown) is called from another section (`clickTokensMenuItem`, Token).

## Collisions

- Open PR #607 (harden-security-fixes-2 arc 2) edits `fixtures/helpers.ts` (`callService` exported) and `fixtures/popups.ts`. Whichever lands second moves the hunk into its new home.
- `fixtures/type-roles.ts` (type-roles-coverage) is not moved; it imports `ensureUnlocked`, `navigateByHash` and `readSessionRow` from `./helpers`, which the barrel keeps exporting.
- Closed known limit #568 (the swallowed `registerContract` errors) says whoever next edits those helpers may delete the catches.
