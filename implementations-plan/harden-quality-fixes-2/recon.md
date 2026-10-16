# Recon: harden-quality-fixes-2

Base: `origin/dev` at `ea8827f9`. Three read-only Explore agents (sonnet): a reuse sweep, a map of the four PR e2e gates, a map of the confirm sites and the full-backup state. The parent verified every issue claim below against the tree. Paths are repo-relative; `ext/` is `apps/extension/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Strict integer from an env var | none shared. `ext/tests/e2e/fixtures/chaos-seed.ts:9-16` (`/^\d+$/`, safe integer, message names the variable) is the house shape. Searched `parseInt\|Number.isInteger\|Number.isSafeInteger\|Number\(process\.env\|envInt` in `apps/`, `packages/`, `scripts/`, `infra/`. | **build new** `e2eRetry(fallback)` in `ext/vite.shared.ts`, shaped like `chaosSeed` |
| Shared e2e runner options | `ext/vite.shared.ts` owns `srcDir`, `noirAliases`, `e2eReporters` (its header records the drift that put them there). `environment`, `fileParallelism`, `pool`, `isolate` repeat in all three configs; `execArgv`, `server.deps.inline`, `testTimeout`, `hookTimeout`, the stall reporters repeat in network and all | **adapt**: two option objects beside `e2eReporters` |
| Retried-pass count | `ext/tests/e2e/retry-error-reporter.ts` (one hook, `onTestCaseResult`, no state). Its runner contract is pinned by `ext/tests/e2e/observability.test.ts:63` (smoke, spawns a child vitest). Step-summary writers: `scripts/ci-cd/plans/lib.ts:318-332` (`writeSummary`, env injected, append), `scripts/ci-cd/audit-gate.ts:343`. Nested-vitest reporter tests in the unit layer: `ext/scripts/e2e/stall-watchdog.test.ts` with `ext/scripts/e2e/fixtures/stall-watchdog/` | **adapt** the reporter (state + `onTestRunEnd`); copy the `writeSummary` pattern, do not import it |
| Retry entry normalisation | `ensureUnlocked` (`ext/tests/e2e/fixtures/helpers.ts:118`): no-op when unlocked, unlocks when locked, presses the boot retry once. Used at entry by `wallet-lock.test.ts:26` and five `sw-resilience` tests | **reuse as-is** |
| Shared CI shell script | `scripts/ci-cd/live-labels.sh`: `#!/usr/bin/env bash`, `set -euo pipefail`, tabs, `Usage:`/`Env:` header, inputs by step `env:`, results to `$GITHUB_OUTPUT`. Tested in `scripts/ci-cd/behavior-gating.test.ts:365-390` (`Bun.spawnSync(["bash", script])`, cwd = root) | **reuse the pattern** for `e2e-decide.sh`, `e2e-aggregate.sh` |
| Sparse checkout | `pr-quick.yml:290-297`, `publish-packages.yml:151-156`, `:222-227`: pin `actions/checkout@3d3c42e5… # v7.0.1`, `sparse-checkout-cone-mode: false`, anchored paths, `persist-credentials: false` on the two publish jobs | **reuse the form** |
| Typed request + open | `ext/src/composables/usePasskeyCeremony.ts` (typed request ref, single in flight). `useLockWallet.ts:57-58` re-reads the slot because `ConfirmPopup.vue:45` replaces it. Two whole-object sites: `tokens/[id].vue:148`, `export/full.vue:449`. No helper, no store action opens a popup (searched `confirm` in `src/stores`, `src/composables`, `src/utils`; `open("confirm")`) | **build new** `useConfirm()` composable |
| Popup request payload | `popupStore.open(target, payload)` / `getPayload` (`ext/src/stores/popup.store.ts:19-28`): exists, no production reader | not used (decision D7) |
| Supersession fence | `ext/src/composables/runFence.ts` (`begin`, `invalidate`), 18 `createRunFence()` sites in 16 files (the issue's "nine" is stale). The export pages hand-roll `let generation` | **adapt**: add `snapshot()` |
| Selection state union | `kind:` unions are the house form (`presto-ui-state.ts:24`, `full-backup-restore.ts:91`, `openEncryptedBackup`'s result `full-backup-helpers.ts:110-118`) | **adapt** `BackupSelection` |

## Issue claims checked

**#538 (F-03).** Holds: the copied block, the `NaN` parse (`vitest.e2e.network.config.ts:40`, `vitest.e2e.all.config.ts:34`), smoke's hard-coded `retry: 2` (`vitest.e2e.config.ts:41`), the uncounted reporter. **Did not hold:** "the combined config runs `tests/e2e/network/**` without the network `setupFiles`": `vitest.e2e.all.config.ts` sets `setupFiles: ["./tests/e2e/network-setup.ts"]` at `ea8827f9`. Locked-retry path holds and is wider than the issue's fix list: `auth-flows.test.ts` tests 1 and 2 (file-scoped; test 2 ends locked), `wallet-lock.test.ts` test 1, `sw-resilience.test.ts` tests at `:77` and `:146` (the second ends locked by design), `sw-restart-network.test.ts` (smoke, not network; its one test's retry starts from its own failed attempt). No workflow sets `NULO_E2E_RETRY` for smoke; `_extension-smoke-e2e.yml` has no `retry` input.

**#542 (F-04).** Holds: four copies of one decide and one aggregate script; the pins lift each copy (`decide-gate.test.ts:46-58` extracts only the final `if … fi`; `aggregators.test.ts:45-80` runs the status step with `${{ }}` substituted). **Partly did not hold:** the two network aggregators are not byte-identical (net carries a 6-line comment and each echo names its lane); they are command-identical. Both Firefox decides, not only smoke-Firefox's, lack the stacked-PR comment. Facts the design rests on: `decide` is its own job with no checkout (`needs: changes`, one step `id: gate`); `changes` already checks out (full, merge ref); `status` is one step, no checkout; every lane grants `contents: read` at workflow level (`behavior-gating.test.ts:615-626` pins that only `changes` has job-level permissions in the Firefox lanes). Pins that break by design: `behavior-gating.test.ts:306-326` (`decide.steps[0].env`), `:615-627` (twin decide), `:648-660` (`status.needs`), `:999-1020` (`resultsTested`); `aggregators.test.ts:45` (one step), `:421-437` (`decide`); all of `decide-gate.test.ts`. `jq` 1.7 is on the runner image and on this host.

**#543 (F-08).** Holds: 15 request sites (13 in 10 SFCs, 2 composables), all SFCs without `lang="ts"`. **Did not hold:** "only `export/full.vue:449` assigns a whole object": `tokens/[id].vue:148` (`showHomeFull`) does too. Additional facts: no site writes `toggle` or `confirmation_text` (ConfirmPopup still renders both); `useProfileImportFlow.ts:100` captures the slot once, which is #567 (demonstrated, owned by lane small-ui-fixes-1). Handshake as the issue states, plus: `EditContactPopup` picks its mode from `cacheStore.importContact` in three places (`onShow`, the dirty gate `:137`, the save branch `:140`).

**#541 (F-07).** Holds: `BackupSelection.backup: unknown` (`full-backup-helpers.ts:37-42`), casts at `useFullBackupImport.ts:544,568,614` and `useRestoreAgain.ts:171,238`, the "sealed" rule (`full-backup-ctas.ts:17-19`, duplicated in `ImportFullBackupForm.vue:113`), the two decrypt paths (differ only in `parsedBackupName` and a merged fence line), the hand-rolled fences (`full.vue:75`, `account.vue:59`). Replacing them with `RunFence` plus a non-bumping `snapshot()` keeps every capture and check where it is. The issue's step numbering differs from decision page 21's: the page's step 1 is the selection type, its step 2 the non-bumping fence check, its step 3 the export composable (the issue's step 4).

## Collisions (2026-10-16, no open PR)

| Lane | Its files this lane also touches | Sequencing |
|---|---|---|
| harden-security-fixes-2 arc 1 (branch `harden-security-fixes-2-arc1`) | `useFullBackupImport.ts`, `useRestoreAgain.ts`, `full-backup-restore.ts`, `full-backup-helpers.ts`, `export/full.vue`, `settings/tokens/index.vue` | arc 2 branches after it merges |
| small-ui-fixes-1 (#567 in `useProfileImportFlow.ts`; #565 the export file names) | `useProfileImportFlow.ts`, `export/full.vue`, contacts export | arc 2 after it merges |
| harden-quality-fixes-1 (#559 contact rules) | `EditContactPopup.vue` (validators), `export/full.test.ts`, `useLockWallet.test.ts` | arc 2 after it merges |
| execute-popup-readability, send-fees-ux, home-onboarding-2, type-roles-coverage | none of this lane's files (`popup/windows/execute/**`, `FeeSettingsCard.vue`, Send, onboarding shell are untouched) | none |
| #537 (F-02, no lane yet) | the PR e2e workflows' suite jobs | none now |

Arc 1 touches only `.github/`, `scripts/ci-cd/`, the e2e configs, the reporter, four smoke specs and docs: none of the above.

## Observations not planned

- `ConfirmPopup.vue` renders `toggle` and `confirmation_text`, which no caller writes; its header comment names a `contacts/index.vue` use that is gone. Dead, invisible; out of scope (ConfirmPopup stays untouched).
- An encrypted backup that decrypts to a body without `data.profile.type` keeps the Decrypt section on screen, and a second Decrypt reports "Decryption Failed". Arc 2 preserves this (D10); a malformed file is the only way in.
