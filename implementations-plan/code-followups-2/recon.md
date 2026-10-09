# code-followups-2 — recon

Recon read the tree at `61060c0` with three Explore agents (sonnet). R1 checked entries 1–100, R2 checked
101–195 against the code and the merged PRs, and R3 deep-dived the code-only candidates. During recon
`origin/dev` moved to `f557e20`, which merged #56 (settings-by-task) and #74 (contacts-import-1). The
worktree was fast-forwarded. The driver re-read every built entry at `f557e20` and renumbered the
file: `follow-ups.md` holds **202** entries at `f557e20` and held 195 at `61060c0`. The brief's count
of 175 did not hold. Entry numbers below are positions at `f557e20`. The close-out matches entries by
their text, since other lanes edit the file. Absence claims name what was searched.

## Reuse map

| Capability needed | Existing code found | Verdict |
|---|---|---|
| Scope-refusal class and the dApp 4100 envelope | `packages/extension-messaging/src/errors.ts` `ScopeViolationError` (code `SCOPE_VIOLATION`); `wallet-sdk/error-envelope.ts` `SCOPE_VIOLATION_ENVELOPE` | reuse as is |
| Rebuild a typed error from the code channel | `errors.ts` `REBUILT_AS` / `walletErrorFromPayload` (already lists `ScopeViolationError`); `wallet-bridge/src/dispatcher.ts` `unwrapOperationResult` | reuse as is |
| Code-channel allowlist | `execution/rpc-cancel.ts` `ridesCodeChannel` (six classes) | adapt: add one class |
| Journal failure kind for claimed rows | `execution/mark-failed-unless-cancelled.ts` `markFailedUnlessCancelled` (dApp send path) and the shared `failureKind` (also the first-party Send path) | adapt `markFailedUnlessCancelled` only; `failureKind` is not changed (plan D21) |
| Journal failure kind for queued rows | `wallet-sdk/queued-journal.ts` `queuedFailureKind` (maps `ScopeViolationError` to `scope_refused`) | reuse as the model |
| "Not allowed" labels | `journal-state.ts` (`scope_refused` label and subtitle) | reuse as is |
| `scopeViolation()` helper | `packages/wallet-bridge/src/scope-violation.ts` | not used: it is not exported from the package and its message union has no selector-binding arm; construct `ScopeViolationError` directly |
| Class-id check | `execution/service.ts` → `packages/aztec-runtime/src/pxe/artifact-class-id.ts` `assertArtifactClassId`; the strict wire check `assertWireArtifactClassId` (needs current == original) | not used: entry 34 is parked (plan D2) |
| Profile projection | `profile/service.ts` `getProfileInfo` / `profileIdentity`; `profile/session-manager.ts` `toInfo` | adapt: one pure helper in `profile/spec.ts` |
| Single home for a shared constant | `token-balance/spec.ts` `MAX_SYNC_FAILURE_MESSAGE_LENGTH` ("single owner … can never drift") | reuse the pattern |
| Fixed-category fee-read reason | `execution/operation-estimate-reuse.ts` `feeReadFailed` | reuse the pattern |
| Log redaction of an error | `wallet/logger/utils.ts` `trim` → `projectError`; `utils/log-payload-ban.test.ts` | reuse: log the error as an argument |
| Raw purge of malformed rows | `wallet/services/purge-rows.ts` `purgeMalformedRows` | adapt: optional key attribution for unparseable values |
| Account row key parse | `account/spec.ts` `parseAccountRowId` | reuse as is |
| Run fence for a page | `apps/extension/src/composables/runFence.ts` `createRunFence` | reuse as is |
| Busy flag plus generation idiom | `popup/pages/settings/security/export/account.vue` | reuse the pattern |
| Shared submit-latch helper | none (searched `latch` in `apps/extension/src`: per-page `isBusy` / `isLoading` refs only) | not built: an inline flag is enough |
| Secret countdown | `composables/useSecretCountdown.ts` | adapt: `start()` clears first; no-op after scope dispose |
| Race with a cleared timer | inline in `popup/auth-guard.ts` `withinDeadline` (`.finally(() => clearTimeout(timer))`) | reuse the idiom at `importPreflight.ts` and `importChainSync.ts`; no shared helper exists |
| Disposed-composable guard | `useSecretCountdown`'s new `disposed` flag; `useIncomingTrustPrompts.ts` `dispose()` | adapt: a `disposed` flag that `seedVisibility` reads |
| zod 4 enum | `z.enum(TsEnum)` builds the same `ZodEnum` as `z.nativeEnum` (zod 4.4.3 `classic/schemas.js`) | reuse as is |
| Group teardown | `tests/e2e/global-setup.ts` `killProcessGroup` | adapt: move to a side-effect-free module, wait on and escalate by group |
| Orphan reaping and process ownership | `lockfile.ts` `killOrphanByPid` / `isPidAlive`; `tests/e2e/fixtures/browser/ownership.ts` (environment-marker ownership; it records why a live group under a recorded pid proves nothing) | reuse as is: the reaper is not widened |
| L1 probe | `global-setup.ts` `probeAnvil` (one `eth_blockNumber` call) | adapt: add an `eth_chainId` check |
| Route scan options | `apps/extension/scripts/pages-options.ts` `PAGES_OPTIONS` | adapt: `extensions: ["vue"]` |
| Generated-sources freshness check | `.github/workflows/_build-extension.yml` "Assert the build left generated sources unchanged" | reuse: it sees removals once the writer overwrites |
| Development-only manifest override | `manifest/manifest.chrome.config.ts` (`env.mode === "development"` adds the development key) | reuse the pattern |
| Pinned-download pattern | `.github/actions/setup-aztec/install.sh` + `installer-pins.sha256`; `scripts/ci-cd/setup-aztec-pins.test.ts` | reuse the pattern |
| Workflow-command escaping | `scripts/ci-cd/audit-gate.ts` `command` / `plain` (tested in `audit-gate.test.ts`); `scripts/release/publish-chrome-store-run.ts` `command` / `plain` (same bodies; audit-gate narrows `name`) | adapt: move one copy to a shared module, used at all twelve TypeScript sites |
| Static repo guard | `scripts/ci-cd/no-local-paths.test.ts`, `scripts/ci-cd/complexity-baseline.test.ts` (git-grep scans) | reuse the pattern |

## Overlap map (files this lane must not touch)

Read with `gh pr list --state open` and each branch's diff from its merge base with `origin/dev`
(a stacked PR's `gh pr view --json files` also lists dev's merges into it).

- **PR #55** (security-ui-1, backup download): `popup/pages/settings/security/export/full.vue` and its
  tests, `ConfirmPopup.vue` and its test, `packages/design/src/ui/Button.vue` and its test,
  `components/ui/Button.stories.ts`, the e2e files `backup-imported-account`, `helpers/backup-export`,
  `helpers/crash-truth`, `helpers/handshake-import`, `legal-acceptance`, `network/account-balance-orphans`,
  `network/backup-import-stalled-network`, `network/backup-migration-roundtrip`,
  `network/backup-restore-integrity`, `passkey-backup`, `passkey-toolbar-panel`, `security-backup`.
- **PR #58** (security-ui-1, emoji refuse): `wallet/services/dapp-session/*` (including `spec.ts`),
  `wallet/services/wallet-sdk/background.ts` and its tests, `session-revocation.ts`,
  `session-established.test.ts`, `test-services.ts`, `popup/windows/verify/**`,
  `popup/pages/settings/connected-apps/**`, `DappSessionVerification.vue`, `tests/e2e/fixtures/popups.ts`,
  `tests/e2e/network/connect-verify-mismatch.test.ts`.
- **PR #75** (security-ui-1 close-out): `implementations-plan/index.md`, `lessons.md`, `follow-ups.md`,
  `archive/index.md`. It adds four entries to `follow-ups.md` and rewrites one, so numbering shifts
  if it lands first.
- **accessibility-1** (planned file map): the Send files (`RecipientField.vue`, `AmountCard.vue`,
  `send.vue`, `SelectTokenCard.vue`, `FeeSettingsCard.vue`, `FeeMethodSelector.vue`),
  `RecentActivityView.vue`, `TokensView.vue`, `packages/design` tokens and `base.css`,
  `SubPageHeaderBase.vue`, `onboarding/pages/create.vue`, `ConnectStepBar.vue`,
  `TransactionTerminalCard.vue`, `popup/pages/activity.vue`, `popup/pages/settings/index.vue`,
  `popup/windows/verify/index.vue`, **`CLAUDE.md`**, the e2e files `send-keyboard`, `home-links`,
  `tooltips-glossary`, `onboarding-tab`, `navigation`, `network/send-amount-exact`, `network/fiat-send`,
  `network/fee-sponsor-funding`, `network/popup-escape-layered`, `network/home-cap`,
  `network/connect-one-window`, `helpers/pointer-probes.ts`.
- **type-roles** (approved, untracked): `packages/design` typography and any font-size CSS.
- **Shared planning files** every lane edits: `index.md`, `lessons.md`, `follow-ups.md`,
  `archive/index.md`.

No file this plan changes is in the list above, except the shared planning files at close-out.
`dapp-session/spec.ts` (entry 132's ninth call) is left to PR #58 (Phase 1.4).

## Candidate deep-dives (verified at `f557e20`)

- **10.** `contract-resolver.ts` `selectorBindingRefusal` returns a plain `Error("Scope violation: <policy label> does not match selector's function")`.
  `assertSelectorBinding` runs at six sites (`authwit-discoverer.ts`, `fast-path.ts`, `service.ts`,
  `tx-request-builder.ts` ×2, `view-executor.ts`). `ridesCodeChannel` omits
  `ScopeViolationError`; `failureKind` maps only `DuplicateInitializationError` and
  `SessionEndedError`. Today: the dApp gets "The wallet could not process the request." with no code;
  a queued send reads "Stopped before broadcast" / "Transaction failed". Owner sign-off:
  `archive/security-fixes-1/OWNER-ASKS.md` § "Answers: owner sign-off, 2026-10-08", "OA-2 (#13): A,
  classify the refusal as a scope refusal". Option A's defined result: code 4100 with "This request
  is outside the permissions you gave this app."; the send reads "Not allowed" / "The app asked for
  more than you allowed. Nothing was sent." with subtitle "Not allowed". `background.ts`'s
  `isExpectedRefusal` already lists `ScopeViolationError`, so the "Method X failed" line drops from
  `error` to `debug` with no edit there. Tests that flip `constructor` from `Error` to
  `ScopeViolationError`: `contract-resolver.test.ts`, `fast-path.test.ts` (2), `authwit-discoverer.real.test.ts`,
  `service.authwit-binding.test.ts`, `view-executor.test.ts`, `tx-request-builder.pins.test.ts` (2).
  The "Method not found" rows stay `Error`.
- **34.** `execution/service.ts` `executeRegisterContract` and `executeAztecRegisterContract` look up
  and check the artifact by `instance.currentContractClassId`. The address commits only to the
  original class (`computePartialAddress`), and the PXE seam re-derives the address from the
  preimage, so a forged `current` passes the address check. Upstream PXE `registerContract` performs
  no validation. The wallet does not support upgraded contracts (`pxe/effective-class.ts`,
  `assertNotUpgraded`); for every stock dApp `current == original`. Test home:
  `execution/service.class-id.test.ts` (its `instance()` fixture carries only `currentContractClassId`).
  **Parked after audit round 1:** binding the original id alone still accepts an upgraded instance
  registered without an artifact (the lookup then uses the original id) or with its original one,
  and the entry's model check (`current == original`) refuses every upgraded instance at
  registration. Both change which registrations succeed for a dApp.
- **37.** Three copies of the projection: `session-manager.ts` `toInfo`, `service.ts`
  `getProfileInfo`, and `profileIdentity` (the persisted-only form `backup()` uses). Bodies are
  identical, including `recoveryMode` absent when false.
- **64.** `balance-projector.ts:49` and `balance-job-queue.ts:38`, both `BATCH_SIZE = 12`; the queue's
  drain limit is the projector's chunk, so they must stay equal.
- **65.** `transfer-estimate-reuse.ts:209` returns `` `base fee fetch failed: ${getErrorMessage(error)}` ``
  into a `logDebug` finished string. Pins asserting the old text: `transfer-estimate-reuse.pins.test.ts`
  at the three base-fee rows.
- **95.** `purge-rows.ts` `purgeMalformedRows` `continue`s on a syntax-broken or non-object value. The
  account call (`account/service.ts`, raw pass) predicates on `parseAccountRowId(id)`; the other
  eight callers attribute by value. `rawAddressesForProfile` already harvests broken-value keys.
- **102.** `account-state/service.ts` `classifyRestoreFailure`: `` this.logWarn(`restore: registration failed on ${networkId} — ${message}`) ``;
  its comment says per-item errors are never rendered, but `popup/pages/import.vue` and
  `onboarding/pages/import.vue` expose the restore error log. No test asserts the log text.
- **132.** Nine calls in seven files; `dapp-session/spec.ts:88` is in PR #58. zod 4.4.3:
  `nativeEnum` and `enum` both construct `ZodEnum({type: "enum", entries})`; R3 compared parse
  results and issues for a numeric and a string enum over eight inputs: identical.
- **26.** `seed.vue` `handleUnlock` has no in-flight latch and no unmount fence; `useSecretCountdown.start()`
  arms new timers without clearing the old ones. `change-password.vue` `handleChangePassword` checks
  `isAllowedToChange` only; its button is `:disabled` while loading (now line 214, not 229), so only a
  same-tick double click re-enters. Both pages are free since #56 merged. `useSecretCountdown` has
  one user (`seed.vue`).
- **125.** `killProcessGroup` waits on the leader (`child.exitCode`, `child.killed`) before the group
  SIGKILL; `killOrphanByPid` returns early when the leader is dead (`isPidAlive` = `process.kill(pid, 0)`).
  Linux does not reuse a pid while a live process group carries it as its id. That makes the
  in-run teardown safe (it holds the child it spawned), but not the persisted-lock reaper: once a
  recorded group is gone its id can be reused by another group whose leader exited
  (`tests/e2e/fixtures/browser/ownership.ts` records the same reasoning). Only the teardown changes.
- **126.** `probeAnvil` resolves `typeof parsed.result === "string"`; `ensureAnvil` adopts any such
  listener. Verified locally: anvil 1.4.1 answers `eth_chainId` with `0x7a69` and `anvil_nodeInfo`
  reports `environment.chainId: 31337` but no slots-in-an-epoch value, so no RPC proves that flag.
- **130.** `auto-imports.d.ts` still declares `resolveRestoredActiveNetworkId` (`:280` at `f557e20`)
  and `restoreNetworksStage` (`:287`), neither exported any more. `.eslintrc-auto-import.json` holds
  neither. `vite.config.ts` sets no `dtsMode`;
  unplugin-auto-import 21.1.0 supports `dtsMode: "overwrite" | "append"`. `_build-extension.yml`
  fails on any diff under `src/types/` after the build.
- **135.** `PAGES_OPTIONS` sets no `extensions`; 9 helper `.ts` files under `src/popup/pages` and 13
  under `src/popup/windows` become routes. Every page in the five scanned dirs is a `.vue`
  (`src/pages` 1, `src/popup/pages` 44, `src/popup/windows` 15, `src/onboarding/pages` 8, no `.js`).
- **152.** `manifest.config.ts` `connect-src 'self' blob: https: http:`; under CSP3 an `http:` source
  does not match a `ws:` URL. `bun run dev` serves on port 8088 with HMR on 8088; only
  `dev:chrome` runs a dev server (`dev:firefox` is `vite build --watch`). `manifest.test.ts` pins the
  production policy for both builds. No build outside the two `dev` scripts uses `--mode development`.
- **108 (third item).** `_extension-network-e2e.yml` declares `SPONSORED_FPC_SALT` as an optional
  secret and exports it as env; callers pass it at `pr-extension-network-e2e.yml` (4),
  `pr-extension-network-e2e-firefox.yml` (4), `nightly.yml` (10), `extension-network-e2e-soak.yml` (1),
  `release.yml` (1). No code reads `process.env.SPONSORED_FPC_SALT`: the only matches in `apps/` and
  `packages/` are two local `const SPONSORED_FPC_SALT = 0n` (`tests/e2e/fixtures/aztec.ts`,
  `packages/aztec-runtime/src/pxe/known-artifacts.ts`). `behavior-gating.test.ts` compares the Firefox
  jobs' `secrets` with the PR pool's.
- **134.** `docker-ci-like.sh` pipes `https://bun.sh/install` to `bash` and downloads Node
  `v24.16.0` (`NODE_VERSION` overridable) with no hash; the script already installs Aztec through the
  pinned `setup-aztec/install.sh`.
- **142.** Unescaped: `attach-assets-run.ts` (`fail`, the `::warning::` asset line, the top-level
  catch) and `publish-firefox-amo-run.ts` (`fail`, both `::add-mask::` lines, the validation-error
  lines). The audits found the same pattern in `lock-version-run.ts` (2), `auto-unstick-run.ts`,
  `scripts/publish/check-digests.ts` and `scripts/ci-cd/assert-canary-results.ts` (2). Escaping pairs:
  `audit-gate.ts` and `publish-chrome-store-run.ts`. `test:release` runs `scripts/release/` and
  `scripts/publish/`; `test:ci-gating` runs `scripts/ci-cd/`.
- **163.** Vocabulary search (`git grep -E` over `apps`, `packages`, `scripts`, `.github`, `.githooks`,
  excluding `*.json`, `*.svg`, `*.md`) for review/audit findings and rounds, `per audit`, reviewer
  names with review words, and the milestone shapes CLAUDE.md bans (`M4.10`, `A11.1`, `pre-A11`,
  `phase 4b`, `PR-2`, `Stage D`, `Arc N`): six hits, all comments.
  `apps/extension/scripts/e2e/agent.sh:38`, `src/composables/useFullBackupImport.test.ts:2101`,
  `tests/e2e/global-setup-smoke.ts:36`, `tests/e2e/global-setup.ts:727` and `:892`,
  `tests/e2e/network/tx-sendTx-multicall.test.ts:27`. `config.test.ts:13`'s "reviewer sign-off in the
  PR description" is a live process rule, not a workflow reference.
- **148, 149, 150.** None of the routed items is in its target yet: `.claude/skills/e2e-testing/SKILL.md`
  (§ 5's last row is 46, so the next free row is 47; row 4 names only its two original files),
  `.claude/skills/aztec-update/SKILL.md` (no unknown-address grep), `apps/extension/tests/COMPOSITION-TESTS.md`
  (no `svc()` / `as never`). The CLAUDE.md half of 149 (wrangler's `routes` rule, an agent session's
  refusal of domain changes) targets a file accessibility-1 edits.

## Resolved entries (search trails)

- **29. A restored token with a receipt opens the first-receive prompt.** `trustRestoredTokens`
  exists and runs on restore: `composables/useFullBackupImport.ts:374`,
  `composables/full-backup-restore.ts:568-578`, `incoming-transfer/service.ts:678-701`. Present since
  the repository's first commit `e1c7533`.
- **183. The import-contacts sheet pushes the EXISTING tag off the card edge.** `git grep -n EXISTING
  apps/extension/src` returns only fee-juice hits (`GasBalanceCard.vue`, `tx-detail-helpers.ts`, a fee
  test). `ImportContactsPopup.vue` groups rows under section labels ("Already saved", `:57`); its only
  `.tag` is `sender`. `git log -S"EXISTING" -- …/ImportContactsPopup.vue` gives `90f4fb3` (#36), whose
  body says the `EXISTING` and `INVALID` tags are gone because the section says it.

## Partly resolved

- **107. First-party service methods still trust a caller's `profileId`.** Its example is stale:
  `TokenService.addToken` mints an execution fence from the active profile and throws
  `unauthorized profile` when the supplied `profileId` differs (`token/service.ts:256-289`, also
  `:513`), present since `e1c7533`. The account service's public methods (`createAccount`,
  `getAccount`, …) still take `profileId` unchecked. The rest holds.

## Moved citations (recorded, not rewritten)

Kept entries whose locations moved; the close-out does not rewrite them, so the shared file's diff
stays small: 8, 9, 16, 21, 23, 27, 39, 54, 77, 81 (R1); 114 (`helpers.ts:1251`, plus a fifth sleep at
`network/store-captures.test.ts:205`), 164 (`fixtures/extension.ts:484-486`), 177 (`unsealImportedKey`
is now `unsealImportedSigningKeyV2`; `settleRegistryTx` no longer exists), 181
(`BalanceView.vue:234-242`), 182 (`popup/pages/import-helpers.ts:23`), 191 (`RecentActivityView.vue:348-355`),
196 (`packages/design/src/ui/Input.vue:273-286`). 150's "next free rows" is row 47 now.

## Triage

Verdicts: R1 for old 1–100, R2 for old 101–195, the driver for entries new at `f557e20`. "old" is the
entry's position at `61060c0`. Lane: *build P* (phase), *delete*, *rewrite*, or *keep* (reason in
[plan.md](plan.md) § Not this lane).

| # | old | Entry | Recon | Lane |
|---|---|---|---|---|
| 1 | 1 | The gas link. | HOLDS | keep |
| 2 | 2 | Unleashed publishes no privacy notice. | UNCHECKABLE | keep |
| 3 | 3 | Fetch the default token list instead of building it in, so that adding a token needs no re | HOLDS | keep |
| 4 | 4 | A V6 mainnet seed and its fee policy, when a V6 mainnet exists. | UNCHECKABLE | keep |
| 5 | 5 | An automated live-transaction smoke, if wanted: | UNCHECKABLE | keep |
| 6 | 6 | `presto-banners` 1.2.0. | HOLDS | keep |
| 7 | 7 | Every other failure before a dApp send is claimed reads "Popup closed early". | HOLDS | keep |
| 8 | 8 | A dApp cannot widen a contract-classes grant. | MOVED | keep |
| 9 | 9 | Repeated scope refusals pile up in Activity. | MOVED | keep |
| 10 | 10 | Classify the selector-binding refusal as a scope refusal (the owner picked this on 2026-10 | HOLDS | build 1.5 |
| 11 | 11 | A refused dApp call's activity record is titled by the name the dApp claimed. | HOLDS | keep |
| 12 | 12 | `requestCapabilities` is allowed as a batch leg and opens a connect window (`packages/wall | HOLDS | keep |
| 13 | 13 | The dApp-session writers read raw stored grants. | HOLDS | keep |
| 14 | 14 | The published schema patch takes any string for `grantPublicAuthwit`'s two addresses (owne | HOLDS | keep |
| 15 | 15 | A schema-valid address can still throw at a `String()` coercion. | HOLDS | keep |
| 16 | 16 | The unit switch, Max and Refresh quote are mouse-only. | MOVED | keep |
| 17 | 17 | A press on Max while the destination holds the focus is lost. | HOLDS | keep |
| 18 | 18 | In USD mode a long derived amount wraps the line under the field. | HOLDS | keep |
| 19 | 19 | At rest the USD field hides its tail. | HOLDS | keep |
| 20 | 20 | A wrapped review line indents its symbol 4 px. | HOLDS | keep |
| 21 | 21 | The fiat notice can say the price moved when it did not. | MOVED | keep |
| 22 | 22 | The address-keyed fee maps outlive a deleted profile off the live path. | HOLDS | keep |
| 23 | 23 | An Allow the watchdog displaced mid-un-hide leaves receipts hidden under `trusted`. | MOVED | keep |
| 24 | 24 | A pin or a token-deletion cleanup racing a profile deletion can recreate its pinned-tokens | HOLDS | keep |
| 25 | 25 | Two of the token add's compensations delete by id without lock ownership. | HOLDS | keep |
| 26 | 26 | Recovery phrase and Change password have no submit latch. | MOVED | build 2.1 |
| 27 | 27 | Two keyboard focus rings do not show. | MOVED | keep |
| 28 | 28 | Send's token card has no focus style of its own. | HOLDS | keep |
| 29 | 29 | A restored token with a receipt opens the first-receive prompt. | RESOLVED | delete |
| 30 | 30 | The first-receive trust prompt shows no explorer link. | HOLDS | keep |
| 31 | 31 | A deleted default token returns after a full-backup restore on a fresh install. | HOLDS | keep |
| 32 | 32 | `AccountService` creation and import share no critical section. | HOLDS | keep |
| 33 | 33 | Creating a profile waits for activation with no identity check or deadline. | HOLDS | keep |
| 34 | 34 | dApp contract registration checks the artifact against `currentContractClassId`. | HOLDS | keep (parked after audit round 1) |
| 35 | 35 | `connect-src` allows plain HTTP to any host (owner ask OA-4, open). | HOLDS | keep |
| 36 | 36 | `style-src` keeps `'unsafe-inline'`. | HOLDS | keep |
| 37 | 37 | The profile projection is built twice. | HOLDS | build 1.2 |
| 38 | NEW | A lock the worker cannot persist is silent. | NEW (checked by the driver) | keep |
| 39 | 38 | Six surfaces still read a token without a decimals getter in base units. | MOVED | keep |
| 40 | 39 | A mint outside the standard shapes shows no amount. | HOLDS | keep |
| 41 | 40 | A listed token's mint figure rests on its method's name and arity. | HOLDS | keep |
| 42 | 41 | An unlisted token's mint shows no amount; looking it up is its own plan. | HOLDS | keep |
| 43 | 42 | The authwit popups keep the 60 s ceiling. | HOLDS | keep |
| 44 | 43 | A definitive "won't go through". | UNCHECKABLE | keep |
| 45 | 44 | A checked dApp send can leave its public authwit out of the revoke index. | HOLDS | keep |
| 46 | 45 | A chain prune after inclusion is caught by no send path. | HOLDS | keep |
| 47 | 46 | A failed card beside a settled row for the same send. | HOLDS | keep |
| 48 | 47 | A neutral snack style for "Send not confirmed". | HOLDS | keep |
| 49 | 48 | The status colours' contrast in the light theme. | HOLDS | keep |
| 50 | 49 | A node's refusal at the send line reads "Not confirmed yet" for 30 minutes. | HOLDS | keep |
| 51 | 50 | A checked record shows no tx hash or explorer link. | HOLDS | keep |
| 52 | 51 | Home's error snack covers the row above the tab bar. | HOLDS | keep |
| 53 | 52 | The Revoke authorizations and authwit registry popups never check the sponsor. | HOLDS | keep |
| 54 | 53 | A dApp's embedded sponsor payment is never checked. | MOVED | keep |
| 55 | 54 | The dApp window offers no way to get fee juice when nothing can pay. | HOLDS | keep |
| 56 | 55 | A Confirm before a sponsor-paid estimate returns skips the funding check. | HOLDS | keep |
| 57 | 56 | A re-enabled Sponsored row reads "free" before it is checked again. | HOLDS | keep |
| 58 | 57 | The sponsor notice is not announced. | HOLDS | keep |
| 59 | 58 | A hand-added sponsor that falls back to Nulo's names the payer by its row title. | HOLDS | keep |
| 60 | 59 | Owner decision: | UNCHECKABLE | keep |
| 61 | 60 | Revisit the private-origin fee order when a funded sponsor ships on mainnet. | UNCHECKABLE | keep |
| 62 | 61 | An embedded fee payment with no `maxFeesPerGas` commits an unpadded cap. | HOLDS | keep |
| 63 | 62 | The fee-estimate admission cap frees a slot while its simulation still runs. | HOLDS | keep |
| 64 | 63 | Two `BATCH_SIZE = 12` constants size the batched balance views (`apps/extension/src/wallet | MOVED | build 1.2 |
| 65 | 64 | The transfer ladder's base-fee reason carries the node's message. | MOVED | build 1.1 |
| 66 | 65 | Reopening the popup during a queued send shows a stage-less awaiting card first. | HOLDS | keep |
| 67 | 66 | The connect page's header names the active network, not the dApp's. | HOLDS | keep |
| 68 | 67 | The waiting connect window still says the dApp "wants to connect to your wallet" after All | HOLDS | keep |
| 69 | 68 | The connect step bar's empty half barely shows: | HOLDS | keep |
| 70 | 69 | A connect window whose wait fails closes with no message: | HOLDS | keep |
| 71 | 70 | The swap to the emoji check in the connect window is likely not announced to screen reader | HOLDS | keep |
| 72 | 71 | A dApp refused for want of a current Terms acceptance opens nothing in the wallet. | HOLDS | keep |
| 73 | 72 | A `sendTx` leg inside a dApp `batch` gets no queued journal record while it waits. | HOLDS | keep |
| 74 | 73 | Ask upstream whether `@aztec/wallet-sdk` should refuse a discovery `requestId` that collid | UNCHECKABLE | keep |
| 75 | 74 | A dApp that calls `executeUtility` on a function that is not a utility gets the unclassifi | HOLDS | keep |
| 76 | 75 | Deleting one profile's dApp-session row tears down another profile's live channel on the s | HOLDS | keep |
| 77 | 76 | Home's two view links are mouse-only. | MOVED | keep |
| 78 | 77 | From a token's page, History should open filtered to that token. | HOLDS | keep |
| 79 | 78 | The two view links fail contrast. | HOLDS | keep |
| 80 | 79 | Screen readers hear History's and Settings' title twice. | HOLDS | keep |
| 81 | 80 | Home's section header against the drawing. | MOVED | keep |
| 82 | 81 | Onboarding ignores the stored theme. | HOLDS | keep |
| 83 | 82 | Paste a token address into the Holdings search to add it. | HOLDS | keep |
| 84 | NEW | Two Settings hub additions wait on the owner: | NEW (checked by the driver) | keep |
| 85 | NEW | Account State still lives under `advanced`. | NEW (checked by the driver) | keep |
| 86 | 83 | Add token shows the PXE store's developer errors verbatim. | HOLDS | keep |
| 87 | 84 | A password profile's unlock that fails for an unexpected reason shows nothing. | HOLDS | keep |
| 88 | 85 | New incoming public transfers wait on a from-zero history scan. | HOLDS | keep |
| 89 | 86 | A reorg that re-mines a surviving incoming transfer emits nothing. | HOLDS | keep |
| 90 | 87 | Incoming note rows are never reconciled against the PXE. | HOLDS | keep |
| 91 | 88 | An opt-in "Privacy maxi" setting (deferred): | HOLDS | keep |
| 92 | 89 | Only transactions get explorer links. | HOLDS | keep |
| 93 | 90 | The incoming-transfer pollers call dRPC every 30 s per watched token, on the shared key. | HOLDS | keep |
| 94 | 91 | `repository.setTrust`'s own await is unfenced on both arms. | HOLDS | keep |
| 95 | 92 | A profile deletion leaves a JSON-broken account row at its canonical key. | HOLDS | build 1.3 |
| 96 | 93 | The migration engine has no watchdog on `up()`, an accepted audit residual: | HOLDS | keep |
| 97 | 94 | An edited Local Network reads "InvalidChain" and drops out of full backups (the owner made | HOLDS | keep |
| 98 | 95 | Report the handshake-loss behaviours to aztec-packages. | UNCHECKABLE | keep |
| 99 | 96 | Recovery for installs that already lost a third-party note. | UNCHECKABLE | keep |
| 100 | 97 | Nothing stops a second own window for the same flow. | HOLDS | keep |
| 101 | 98 | A contract class id does not commit to ABI metadata. | HOLDS | keep |
| 102 | 99 | `classifyRestoreFailure` logs a finished string and misstates its sink. | HOLDS | build 1.1 |
| 103 | NEW | A lock or a profile switch can break a contacts import. | NEW (checked by the driver) | keep |
| 104 | 100 | account-switch-isolation's restructuring stages were not built. | HOLDS | keep |
| 105 | 101 | No network e2e proves two concurrent NO_FROM sends serialize and both confirm. | HOLDS | keep |
| 106 | 102 | Owner check: | UNCHECKABLE | keep |
| 107 | 103 | First-party service methods still trust a caller's `profileId`, such as `TokenService.addT | PARTLY | rewrite |
| 108 | 104 | proverless-network-stabilization left three items: | HOLDS | build 3.1 (part) + rewrite |
| 109 | 105 | Onboarding has no "Grant access" step for Presto on Firefox. | HOLDS | keep |
| 110 | 106 | The Ready-handshake transport rework is parked, for its reach: | HOLDS | keep |
| 111 | 107 | `ConfirmPopup`'s passkey confirmation is dead: | HOLDS | keep |
| 112 | 108 | A passkey profile created in the page saves a second passkey when its confirmation fails a | HOLDS | keep |
| 113 | 109 | Owner checks on a Mac: | UNCHECKABLE | keep |
| 114 | 110 | Test whether `withStaleAnchorRetry` retires the e2e's 5 s anchor sleep. | MOVED | keep |
| 115 | 111 | The strict-mode opt-out restore has no e2e. | HOLDS | keep |
| 116 | 112 | `passkey-backup.test.ts`'s export case is skipped on CI and fails on a fast host: | HOLDS | keep |
| 117 | 113 | The playground's multicall sends nonces the standard Token refuses (inferred from the azte | HOLDS | keep |
| 118 | 114 | No e2e shows a discovered authorization's transfer row. | HOLDS | keep |
| 119 | 115 | No e2e shows a private transfer's row. | HOLDS | keep |
| 120 | 116 | CI builds no Storybook, so a change that breaks `bun run --cwd apps/extension build-storyb | HOLDS | keep |
| 121 | 117 | An earlier green copy of a required check stands while a later run of the same head works. | HOLDS | keep |
| 122 | 118 | A PR run decides from its own event's snapshot, and runs can reach their concurrency group | HOLDS | keep |
| 123 | 119 | The e2e aggregators trust GitHub's fold of a shard matrix. | HOLDS | keep |
| 124 | 120 | Two local worktrees can pick overlapping e2e ports. | HOLDS | keep |
| 125 | 121 | The e2e teardown escalates on its group leader's exit, so a descendant that outlives the l | HOLDS | build 2.3 (part) + rewrite |
| 126 | 122 | `global-setup.ts`'s `probeAnvil` accepts any string `eth_blockNumber` result, so it proves | HOLDS | build 2.3 (part) + rewrite |
| 127 | 123 | `network/store-captures.test.ts` is red on `dev` (opt-in, `STORE_CAPTURES=1`, Chrome only) | HOLDS | keep |
| 128 | 124 | A smoke build still contacts live hosts. | HOLDS | keep |
| 129 | 125 | `hoist = false` is still not set. | HOLDS | keep |
| 130 | 126 | Two auto-import globals outlive their exports. | MOVED | build 2.2 |
| 131 | 127 | Retire vitest's interop stopgap. | HOLDS | keep |
| 132 | 128 | Nine `z.nativeEnum` calls use an API zod 4.4.3 deprecates ("merged into `z.enum()`"), in s | HOLDS | build 1.4 |
| 133 | 129 | Five declined third-party-notices items wait on their triggers: | UNCHECKABLE | keep |
| 134 | 130 | `docker-ci-like.sh` bootstraps Bun and Node unverified. | HOLDS | build 3.2 |
| 135 | NEW | Helper `.ts` files in page directories are routes. | NEW (checked by the driver) | build 2.2 |
| 136 | 131 | The store launch's owner steps are open. | UNCHECKABLE | keep |
| 137 | 132 | S2 and S3 wait on the first release on the new flow. | HOLDS | keep |
| 138 | 133 | The new release flow's live proofs. | UNCHECKABLE | keep |
| 139 | 134 | Nightly tags and releases are kept forever. | UNCHECKABLE | keep |
| 140 | 135 | A store-match check. | HOLDS | keep |
| 141 | 136 | CodeQL alert 23 re-raises dismissed alert 1 (`actions/cache-poisoning/poisonable-step`, hi | UNCHECKABLE | keep |
| 142 | 137 | Two release scripts write error text into workflow commands unescaped. | HOLDS | build 3.3 |
| 143 | NEW | The store's "security" capture now frames the Lock page. | NEW (checked by the driver) | keep |
| 144 | NEW | Privacy § 5.3 still names Settings → Advanced. | NEW (checked by the driver) | keep |
| 145 | 138 | The plans `.gitignore` catches only four transcript shapes. | HOLDS | keep |
| 146 | 139 | No release step refuses a stable publish while a `«FILL»` placeholder survives in `legal/` | HOLDS | keep |
| 147 | 140 | Every document log line, debug included, crosses to the worker as an RPC. | HOLDS | keep |
| 148 | 141 | Route the e2e gotchas the lessons rewrite retired into the `e2e-testing` skill. | HOLDS | build 3.5 |
| 149 | 142 | Route four retired gotchas to their owners. | HOLDS | build 3.5 (part) + rewrite |
| 150 | 143 | Route three items into the `e2e-testing` skill's flake ledger (§ 5, next free rows), held  | HOLDS | build 3.5 |
| 151 | 144 | The extension's Vite and vitest configs warn under Vite's planned native config loader. | HOLDS | keep |
| 152 | 145 | `bun run dev` was not run under the extension pages' CSP floor. | HOLDS | build 2.4 |
| 153 | 146 | The fee-cap change's post-audit proposals, to re-check against the tree (the fee code has  | HOLDS | keep |
| 154 | 147 | A resurrected late-mined authwit transaction leaves its registry row pending forever. | HOLDS | keep |
| 155 | 148 | Accounts deployed under an older artifact than the wallet's aztec.js. | UNCHECKABLE | keep |
| 156 | 149 | The full-backup import's yellow warning reads at about 1.6:1 on the light theme (`apps/ext | HOLDS | keep |
| 157 | 150 | A Retry on the import's errors screen that fails again returns a pixel-identical screen, s | HOLDS | keep |
| 158 | 151 | The import's error viewer lists networks by id, and onboarding's `View errors` notice says | HOLDS | keep |
| 159 | 152 | vitest 4.1.10 never re-runs a fixture setup that failed: | PARTLY | keep |
| 160 | 153 | A full backup's account-state still carries the contracts every PXE boot registers, once p | HOLDS | keep |
| 161 | 154 | An import could also skip the profile's own account contracts and Nulo's protocol sponsors | UNCHECKABLE | keep |
| 162 | 155 | A popup closed during the import's account-state tail loses its per-network outcome: | HOLDS | keep |
| 163 | 156 | A static guard against workflow references in code. | HOLDS | build 3.4 |
| 164 | 157 | The e2e tree does not type-check: | MOVED | keep |
| 165 | 158 | No CI lane proves in browser WASM, the default for every user without Presto: | HOLDS | keep |
| 166 | 159 | An unknown `priorityLevel` from malformed internal popup RPC input. | HOLDS | keep |
| 167 | 160 | `safe_json_rpc_client` returns `undefined` for a null-like node result before schema parsi | HOLDS | keep |
| 168 | 161 | Account RPC params are not schema-validated. | HOLDS | keep |
| 169 | 162 | The SDK `chainInfo` decoder folds non-canonical fields onto canonical composites: | HOLDS | keep |
| 170 | 163 | An NBSP in an RPC URL passes Zod's trim, then fails the adapter as "RPC didn't respond", o | HOLDS | keep |
| 171 | 164 | `TooManyPendingError` does not survive a port (a pinned omission). | HOLDS | keep |
| 172 | 165 | Async drift kept as today: | HOLDS | build 2.5 (part) + rewrite |
| 173 | 166 | Decode drift kept as today: | HOLDS | keep |
| 174 | 167 | The incoming arms differ in dedupe order, call counts and record timing. | HOLDS | keep |
| 175 | 168 | Program-level deferrals, each with its reason: | HOLDS | keep |
| 176 | 169 | Fee and reuse helpers that would add an await or move reads: | HOLDS | keep |
| 177 | 170 | Row lifecycle: | MOVED | keep |
| 178 | 171 | Popup reducers the harness cannot stage: | HOLDS | keep |
| 179 | 172 | Visual shells left local: | HOLDS | keep |
| 180 | 173 | Smaller residue: | HOLDS | keep |
| 181 | 174 | BalanceView's add has no id dedupe (`BalanceView.vue:236-240`). | MOVED | keep |
| 182 | 175 | Enter at a failed full-backup import re-runs the restore while its button is disabled (`im | MOVED | keep |
| 183 | 176 | The import-contacts sheet pushes the EXISTING tag off the card edge. | RESOLVED | delete |
| 184 | 177 | Change password reveals current, new and repeat together from one flag. | HOLDS | keep |
| 185 | 178 | Journal rows have two profile rules and three network rules across Home, TokensView and Hi | HOLDS | keep |
| 186 | 179 | Popup stacking drift: | HOLDS | build 2.5 (part) + rewrite |
| 187 | 180 | Detail pages: | HOLDS | keep |
| 188 | 181 | LogsViewer appends the first live log line to the last loaded line with no newline, becaus | HOLDS | keep |
| 189 | 182 | The extension's test count was once nondeterministic, 8,797 against 8,798 across runs. | UNCHECKABLE | keep |
| 190 | 183 | A recurring Firefox network-lane flake: | HOLDS | keep |
| 191 | 184 | Home's in-progress card shows "0" for an empty `amountRaw`, where finished cards show no a | MOVED | keep |
| 192 | 185 | Two more popups compare names untrimmed. | HOLDS | keep |
| 193 | 186 | NewSenderPopup's own shake ignores reduced motion. | HOLDS | keep |
| 194 | 187 | "Disable animations" stops transitions, not keyframe animations. | HOLDS | keep |
| 195 | 188 | Merge the skeleton shimmer twin in `apps/extension/src/components/composite/send/AmountCar | HOLDS | keep |
| 196 | 189 | At the 25-character name cap, the contact popups block a duplicate but show only "Maximum  | MOVED | keep |
| 197 | 190 | Confirm a queued send at once, then estimate and send it when unblocked (the owner's choic | UNCHECKABLE | keep |
| 198 | 191 | dApp sends are not ordered behind earlier sends until inclusion. | HOLDS | keep |
| 199 | 192 | Three send-ordering questions carry a working answer. | HOLDS | keep |
| 200 | 193 | Send-ordering residuals that fail as before, never worse. | HOLDS | keep |
| 201 | 194 | The send chaos run's nightly jobs are advisory. | HOLDS | keep |
| 202 | 195 | A fee-method click right after a dApp send may not take. | HOLDS | keep |
