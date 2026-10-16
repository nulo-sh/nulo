---
plan: harden-quality-fixes-2
tier: mid (the lane brief's call; competing outline, Codex + Opus dual audit, a fresh Codex final pass)
status: approved 2026-10-16 (orchestrator); arc 1 merged (#604); arc 2 implemented on `harden-quality-fixes-2-arc2`
issues: "#538, #542 (arc 1, Closes); #543 (arc 2, Closes); #541 (arc 2, Refs: page 21 steps 1-2 only)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 3 explorers (sonnet); Codex gpt-6.1-sol high + one Opus Plan lens; a fresh Codex final pass
base: origin/dev at ea8827f9
trunk: dev
post_implementation_hardening: not scheduled
---

# harden-quality-fixes-2: the second quality set of the 2026-10-15 harden

Two arcs, each one PR against `dev`, no stack (orchestrator D-orch-1). Arc 1 makes the e2e runners and the four PR e2e gates single-source. Arc 2 gives the confirm dialogs one request helper and gives the full-backup flows explicit state. Every item is the owner's pick on decision page 21 (2026-10-16): P21-01 **B** (#538), P21-02 **A** (#542), P21-03 **A** (#543), P21-04 **A** (#541). Recon: [recon.md](recon.md). Owner asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md).

## Scope

**In.** #538 whole (one runner config source, the retried-pass count, smoke reads `NULO_E2E_RETRY` falling back to 2, retries start unlocked). #542 whole (shared decide and aggregate scripts; the status job's sparse SHA-pinned checkout). #543 whole (`requestConfirm` at every confirm site, the contact edit handshake as one request object, CLAUDE.md's pattern). #541 page steps 1 and 2: the selection union with one `openSelection`, and a non-bumping `RunFence.snapshot()` on both export pages.
**Out.** #541's export composable (page step 3, its own later blueprint lane; the issue stays open). Any retry value change. `ConfirmPopup.vue`'s behaviour (only its header comment changes). #537 (F-02). #567 (small-ui-fixes-1 fixes it first; arc 2 then replaces that site).

## Outcome & Quality Bar

- **For whom:** the next contributor who changes a retry rule, an e2e gate, a confirm dialog or the backup flow; the owner reading a CI run.
- **Excellent:** (1) one workflow value sets every lane's retry, and each e2e job's summary states how many tests passed only on a retry, by name. (2) A gate rule change is one edit in one script; each lane's YAML only wires it, and the check names stay as they are. (3) A confirm written the old way (a write into `cacheStore.confirm`, an `open("confirm")` outside the helper) fails a unit test, in JS SFCs too; a backup state outside the union fails the TS type check; no dialog, row or button changes. (4) No await moves on the master-key surface.
- **Good enough:** the JS SFC callers stay untyped (`lang="ts"` is out of scope); the type protects TS callers and the helper protects everyone.

## Assumptions

**Facts** (citations in recon.md):
1. No workflow sets `NULO_E2E_RETRY` for smoke, and `_extension-smoke-e2e.yml` has no `retry` input; `_extension-network-e2e.yml:82-84,145` is the input pattern.
2. `RetryErrorReporter` has one hook and no state; vitest 4.1.10's `Reporter` has `onTestRunEnd`.
3. `decide` is its own job with no checkout; `changes` checks out the merge commit; `status` is one step and inherits `contents: read` in all four lanes.
4. The aggregators read `changes.result`, `decide.result`, `decide.outputs.run`, `changes.outputs.read-attempt`, `github.run_attempt` and each suite's result; nothing else reads `decide.outputs.run` except the suites' `if`.
5. `jq` 1.7 is on GitHub's `ubuntu-latest` image and on this host.
6. 15 confirm request sites; only `tokens/[id].vue:148` and `export/full.vue:449` assign a whole object; no site writes `toggle` or `confirmation_text`.
7. `ConfirmPopup` runs `callback` before it closes and replaces the slot with `{}` on close (`ConfirmPopup.vue:35-46`).
8. Both decrypt paths await `openEncryptedBackup` once and differ only in `parsedBackupName`; `openEncryptedBackup` has no other caller.
9. The export pages snapshot `generation` without bumping; only `discardRun`, `resetFlow` and unmount bump it.
10. A new export under `src/composables/`, `src/stores/` or `src/utils/` becomes an auto-import global, types included (`export type { RunFence }` in `auto-imports.d.ts`); CI fails on stale `src/types/`.
11. `popupStore.open(target, payload)` stores the payload with the entry, and `close` (a re-open included) deletes it; `popup.store.test.ts:13,52` pins that. No production caller passes one today.

**Inferences:**
- I1. Smoke today runs nowhere with `NULO_E2E_RETRY` set, so reading it changes no run until a workflow passes it (Fact 1; `agent.sh` and package scripts do not set it).
- I2. A second Decrypt on an opened backup with no `data.profile.type` throws inside `parseEncryptedBackup` (`text.trim` on an object) and shows "Decryption Failed". When the decrypted JSON is itself a string (a file sealed twice), `profileType` is `null` too, Decrypt stays offered, and a second Decrypt opens the inner backup (`JSON.parse` result cast unchecked, `full-backup-helpers.ts:117`). Phase 2.2 pins both on arc 2's base before changing the code.
- I3. Fetching `github.sha` by SHA works for a re-run while GitHub keeps the merge commit; a re-run after it is gone fails closed.

**Asks** (for the orchestrator, not the owner; each is answered before its phase; working assumption in brackets):
- A1. The lane brief says the contact edit handshake "goes through" `requestConfirm`. [The handshake takes the same discipline, not the same helper: one fresh request object `{ contact, onSave }`, handed whole to the editor as its popup payload; D9.]
- A2. Page 21's step 1 ("an explicit type for the chosen backup's state") includes the issue's `openSelection` step, since the opened state needs one producer. [Yes; D11.]
- A3. Arc 2 waits on three lanes. [It branches when harden-security-fixes-2 arc 1, small-ui-fixes-1 and harden-quality-fixes-1 have merged. If only the first lags, phase 2.1 may start on the arc 2 branch; the PR opens after phase 2.3.]

## Architecture & Implementation

### #538: one runner config, counted retries, unlocked retries

- `apps/extension/vite.shared.ts`, beside `e2eReporters`:
  - `e2eRetry(fallback: number): number`. Unset or `""` returns `fallback`. A value matching `/^\d+$/` that is a safe integer returns `Number(value)`. Anything else throws ``NULO_E2E_RETRY=${JSON.stringify(raw)} is not a non-negative integer`` (the `chaosSeed` shape).
  - `e2eIsolation`: `{ environment: "node", fileParallelism: false, pool: "forks", isolate: true }` with the one comment that explains them (the three copies' comments merge into it).
  - `networkRunner`: `testTimeout`, `hookTimeout`, `execArgv`, `server.deps.inline`, and the stall reporters, shared by the network and the combined config.
- The three configs spread these. `include`/`exclude`, `globalSetup`, `setupFiles` and `retry: e2eRetry(2)` stay written in each. Smoke keeps its comment on why two retries. The "Mirrors"/"Same as" comments go.
- `_extension-smoke-e2e.yml` gains the `retry` input (default `""`) and passes `NULO_E2E_RETRY: ${{ inputs.retry }}` to the run step, worded as the network input. No caller passes it (P21-01 B: nothing changes until a workflow sets it).
- `RetryErrorReporter` collects each retried pass (`fullName`, `moduleId`) in `onTestCaseResult` (unchanged printing), and `onTestRunEnd` appends one block to `GITHUB_STEP_SUMMARY` when that is set: a heading, `N passed on retry`, then one line per test. It writes the block when N is 0 too, so a missing block means the reporter did not run (D4). Append-only, as `scripts/ci-cd/plans/lib.ts` `writeSummary`. A nested vitest a test spawns must get its own summary file, or its fixture's retries land in the job's count.
- Retry entry: each file-scoped test that locks the wallet or stops the background starts with `await ensureUnlocked(page)` after `openPopup`, as `wallet-lock.test.ts:26` does: `auth-flows.test.ts` tests 1-2, `wallet-lock.test.ts` test 1, `sw-resilience.test.ts` tests at `:77` and `:146`, `sw-restart-network.test.ts` (D5). A retry then re-runs the failed step instead of timing out at its first route wait.

### #542: shared gate scripts

- `scripts/ci-cd/e2e-decide.sh` (env `EVENT`, `BASE`, `LABEL_HIT`, `SURFACE`, `GITHUB_OUTPUT`): today's gate body once, its stacked-PR comment included. Writes `run=true|false`.
- `scripts/ci-cd/e2e-aggregate.sh` (env `NEEDS`): today's state machine over `NEEDS` (`${{ toJSON(needs) }}`), read with `jq`. `changes` must be `success`; its `run` output must be `true` or `false`; a `false` must come from labels read in this attempt (`read-attempt` equals the runner's `GITHUB_RUN_ATTEMPT`); every other need must be `success` (run) or `skipped` (skip); a `NEEDS` with no suite is a fault. It ends with `echo "$GITHUB_WORKFLOW gate passed (or was skipped — no relevant changes / not labeled)."`: each lane's workflow `name:` is today's echo text (D7).
- Both scripts: the `live-labels.sh` form (`#!/usr/bin/env bash`, `set -euo pipefail`, tabs, `Usage:`/`Env:` header, inputs only through `env:`, `::error::` messages unchanged).
- Each of the four workflows:
  - `changes` gains a last step `id: gate` running `bash scripts/ci-cd/e2e-decide.sh`, with `SURFACE: ${{ steps.override.outputs.full || steps.filter.outputs.<surface> }}`, `LABEL_HIT`/`BASE` from `steps.live.outputs`. Its outputs become `run` and `read-attempt`; the outputs only `decide` read go (D6).
  - The `decide` job goes. Suites take `needs: changes` and `if: needs.changes.outputs.run == 'true'`.
  - `status` keeps its `name:`, `if: always()` and timeout; `needs` loses `decide`. Steps: `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1` with `ref: ${{ github.sha }}`, `persist-credentials: false`, `sparse-checkout: /scripts/ci-cd/e2e-aggregate.sh`, `sparse-checkout-cone-mode: false`; then `Aggregate results` with `env: { NEEDS: ${{ toJSON(needs) }} }` and `run: bash scripts/ci-cd/e2e-aggregate.sh`.
- Each lane's paths filter gains both script paths, so a gate edit still runs its lanes as an inline edit does today through the workflow's own path (`live-labels.sh` stays outside, as now).
- Check names: the four `status.name` values do not change; no required-checks runbook step is needed. The PR's own run is the live proof: all four aggregators report under their old names.

### #543: one confirm request, one edit request

- `src/stores/cache.store.ts`: `export interface ConfirmRequest` (the ten fields `ConfirmPopup` reads, `callback?: () => void`), and `confirm` becomes `ref<ConfirmRequest>({})`: a slot that is replaced whole is a ref, so the store's assignment writes through to `pinia.state` (replacing a `reactive` property leaves `pinia.state` holding the old object). Reads through the store are unchanged; a nested `toggle.model` ref still unwraps. The slot owns its contract. `ConfirmPopup.vue`'s behaviour is untouched; its header comment (`:12-19`) is rewritten to show `requestConfirm({ toggle: … })` and drops its stale pointer to `contacts/index.vue`, which writes no toggle.
- `src/composables/useConfirm.ts`: `useConfirm()` reads both stores at setup and returns `requestConfirm(req: ConfirmRequest)`, which assigns `cacheStore.confirm = { ...req }` and calls `popupStore.open("confirm")`, synchronously (D8).
- The 15 sites call it: the 10 SFC files (13 sites) take `const { requestConfirm } = useConfirm()` in the composables block; `useLockWallet.ts` and `useProfileImportFlow.ts` drop their partial types and captured slot. `useLockWallet`'s ownership test reads `cacheStore.confirm.callback === confirmLock`. Every title, description, button text and colour is passed unchanged.
- `CLAUDE.md` § Common patterns: "Confirmation dialogs" shows `requestConfirm({ … })` and one sentence: each request replaces the whole previous one; never write into `cacheStore.confirm`.
- Handshake (D9): `ImportContactsPopup.handleEditContact(contact)` calls `popupStore.open("edit_contact", { contact, onSave })`, where `onSave(row)` sets `importContacts.value[contact.idx] = stageRow(row, contact.idx)` (the row's `idx` as staged today). `EditContactPopup` reads `popupStore.getPayload("edit_contact")` in today's three places: on show for the contact, and in `handleUpdateContact` for the dirty-gate exemption and the import branch, which calls `onSave({ ...contactToEdit, name, address })` with today's sanitising, then closes. A normal edit opens with no payload and a close deletes it (Fact 11), so a request lives exactly as long as its editor. `cacheStore.importContact`, the `updated` marker, the importer's watcher, its clear on hide and `stageRow`'s strip go.

### #541: explicit selection state and the non-bumping fence

- `src/utils/full-backup-helpers.ts`:
  - `BackupSelection = { kind: "unreadable"; name; backup: null; profileType: null } | { kind: "plain"; name; backup: unknown; profileType: string | null } | { kind: "sealed"; name; backup: string; profileType: null } | { kind: "opened"; name; backup: unknown; profileType: string | null }`. Every variant carries `backup` and `profileType`, so the code of their readers stays byte-identical: `import.vue:292`, `ImportFullBackupForm.vue:133`, `useFullBackupImport.ts:787-789` (`isAllowedToImportBackup`), `useRestoreAgain.ts:233,358`, `full-backup-ctas.ts:22` (`showsRestoreCta`). An unknown text kept its text in `backup` and now holds `null`; no reader tells them apart (each checks `profileType` first or reads `.data` through optional chaining). Content stays `unknown` until `validateAndMigrateBackup`. `profileType` keeps today's unchecked read (`?.data?.profile?.type ?? null`); narrowing it would change what a malformed file shows.
  - `readBackupFile` maps: too large, bad JSON or unknown text to `unreadable`; plain to `plain`; encrypted to `sealed`. The errors it returns do not change.
  - `openSelection(target: BackupSelection, password, isStale)` replaces `openEncryptedBackup` at the same layer. It decides by `typeof target.backup === "string"`, not by `kind`: a `sealed` target always holds text, and an `opened` one does when its decrypted JSON was a string, which today's second Decrypt opens (I2). Any other target rejects, as `openFullBackupText` rejects a non-string today. It awaits `openFullBackupText` once, checks `isStale()`, and builds the `opened` selection synchronously (D11).
- Both decrypt paths call `openSelection` at their existing await and publish `opened.selection`; their fences and error copy stay. `useFullBackupImport` derives `parsedBackupName` from it as today.
- Readers of `type` move to `kind`; the readers above stay as they are: `full-backup-ctas.ts` (`showsDecryptCta` is `sealed`, or `opened` with no `profileType`: the I2 behaviour, pinned), `ImportFullBackupForm.vue:113` (calls `showsDecryptCta`), both pick paths' unrecognised check, `import-helpers.ts`. The `as string` casts (`useFullBackupImport.ts:568`, `useRestoreAgain.ts:171`) go: the `sealed` variant types the text. The `as FullBackupEnvelope` casts where content enters `validateAndMigrateBackup` (`useFullBackupImport.ts:614`, `useRestoreAgain.ts:238`) stay: that call is the trust boundary and treats its input as hostile, and a type guard there would assert trust before validation. The profile-name display read stays an unchecked optional read. Both pick paths keep `parseError` ahead of the unrecognised check.
- `src/composables/runFence.ts` gains `snapshot(): () => boolean` (the current generation, not bumped). `export/full.vue` and `export/account.vue` replace `let generation` with `const runs = createRunFence()` (`fence` stays the service fence), `const gen = generation` with `const isCurrent = runs.snapshot()`, each `gen !== generation` with `!isCurrent()`, each bump with `runs.invalidate()`. Helpers that took `gen` take `isCurrent`. Every capture and check stays on its line (D12).

## Security & Adversarial Considerations

- **The new failure mode (#542).** Each `*-status` job now checks out one file before it aggregates. If GitHub's git service fails or is slow then (an outage, a fetch timeout inside the 2-minute job limit, a merge commit no longer served for a late re-run), the job fails and the required check is red: fail-closed, never green without evaluation. Recovery: "Re-run failed jobs" when the suites ran; "Re-run all jobs" when the lane skipped, since the aggregator accepts a skip only on labels read in its own attempt (unchanged rule); a push, or a close and reopen, when the merge commit is gone, since every re-run keeps its run's `github.sha`. CI.md states this beside the attempt rule. The step adds its own window: suites can finish before the git service fails at this later fetch.
- **Trust.** The script runs from `github.sha`, the commit the workflow file came from, so a PR that edits it is in the same position as one that edits today's inline YAML: no new trust. Neither script's step carries a token in its env, and inputs arrive by `env:`, never interpolated into `run:`. The status checkout sets `persist-credentials: false`; the decide step runs inside `changes`, whose existing checkout keeps its read-only token in `.git/config` as today. No permission changes: each `status` keeps what it inherits (`contents: read`, plus `pull-requests: read` on the two Chrome lanes, whose workflow-level block grants it). The checkout pin is the repository's one `actions/checkout` SHA (`action-pins.test.ts`). A missing `jq` exits non-zero: red, not green.
- **Gate drift.** The truth tables run the YAML wiring and the shared script together, and `needs` equals every job (existing pin), so a suite dropped from `needs` or added without it fails `test:ci-gating`.
- **Confirm dialogs (#543)** guard deletes, a session drop, lock, and a plain passkey-backup download. Today a request written into an open dialog keeps the earlier request's `single` (no Cancel), `pre_title` or colours; the whole-object request removes that path. Callbacks and texts are the callers' own, unchanged; texts still render through Vue interpolation.
- **Master-key surface (#541).** The invariant "a superseded run neither publishes nor resurrects scrubbed secrets" keeps its checks one to one; `discardRun` still invalidates before it scrubs; no await is added or moved; no log line changes. Backup content stays untrusted until the existing trust gates.
- **Retry count (#538).** The summary names tests and files, never values. `e2eRetry` refuses a malformed value instead of passing `NaN` to vitest.
- Supply chain: no dependency, lockfile or permission change.

## Arc 1 (PR A): #538 and #542

Fast gate `F`: `bun run lint && bun run typecheck:all && bun run test`. Each exits 0. Commit per phase.

### Phase 1.1: #538 ✓
- Change: `apps/extension/vite.shared.ts`, the three `apps/extension/vitest.e2e*.config.ts`, `.github/workflows/_extension-smoke-e2e.yml`, `apps/extension/tests/e2e/retry-error-reporter.ts`, the four specs above, `apps/extension/tests/e2e/observability.test.ts`; docs: `.claude/skills/e2e-testing/SKILL.md:42-44,187` (the configs table, the `NULO_E2E_RETRY` row; no other doc states smoke's retry).
- Tests:
  - `apps/extension/scripts/e2e/e2e-retry.test.ts`: unset and `""` give the fallback; `"0"` and `"3"` parse; one case per refused class: `"abc"`, `"-1"`, `"1.5"`, `" 2"`.
  - `apps/extension/tests/e2e/observability.test.ts:63` (the reporter's runner pin): its child vitest inherits the job's environment, so on CI it would append the fixture's retried pass to the real smoke summary. Give the child a temp `GITHUB_STEP_SUMMARY`, add a steady test beside the fail-once one, and assert the block says 1 and names only the fail-once test (the steady test is the success control).
  - `apps/extension/scripts/e2e/retry-error-reporter.test.ts`, in process: a run with no retried pass writes `0 passed on retry`; with `GITHUB_STEP_SUMMARY` unset nothing is written.
  - `scripts/ci-cd/behavior-gating.test.ts`: the smoke reusable's run step binds `NULO_E2E_RETRY: ${{ inputs.retry }}` and the input defaults to `""`.
- Proofs, not committed: before the first edit and again after it, a scratch script under `~/.cache/nulo-backlog/harden-quality-fixes-2/` imports each of the three configs and prints its `test` object (reporters by class name, functions by name); the two dumps are equal. This is the only proof for `vitest.e2e.all.config.ts`, which no gate loads. `NULO_E2E_RETRY=abc bun run --cwd apps/extension test:e2e -- tests/e2e/wallet-lock.test.ts` fails at config load naming the variable. Insert a throw after `lockWallet` in `auth-flows.test.ts` test 1 and run it with `--retry=1`: on `ea8827f9` the retry fails with a route-wait timeout; on the branch it fails at the inserted throw again. Remove the throw. Log both in `lessons/phase-1.md`.
- Gate: `F`; `bun run test:ci-gating`; `bun run lint:actions`. Phase 1.3's smoke and network runs load the changed configs.

### Phase 1.2: #542 ✓
- Change: `scripts/ci-cd/e2e-decide.sh`, `scripts/ci-cd/e2e-aggregate.sh` (new); the four `.github/workflows/pr-extension-*-e2e*.yml`; `scripts/ci-cd/decide-gate.test.ts`, `aggregators.test.ts`, `behavior-gating.test.ts`; `CI.md` (`:48` the smoke aggregator, `:104-106` the `Decide` mentions and the attempt rule, with the checkout failure and its recovery beside it, `:230` adding a suite to `status`), `.github/WORKFLOWS.md:7-15`.
- Tests:
  - `decide-gate.test.ts` runs `e2e-decide.sh` directly: today's seven truth rows, plus `LABEL_HIT` `""`, `yes`, `True` and an empty PR `BASE`, each refused.
  - `aggregators.test.ts`: the loader takes the e2e lanes' `status` as the pinned checkout plus one run step; the harness binds `${{ toJSON(needs) }}` from the world, sets `GITHUB_RUN_ATTEMPT` and `GITHUB_WORKFLOW` as the runner does, and runs the step from the repository root. Every existing truth table stays and now runs wiring plus script: run and skip pass; any other result of any need fails; a malformed `run`; the attempt rule; drafts. New, for the JSON input: a need with an empty, `null` or missing result, a `changes` with no `run` output, malformed JSON, and a `NEEDS` with no suite each fail.
  - `behavior-gating.test.ts`: the gate step's env in `changes` (replaces `:306-326`); twin gate steps equal (`:615-627`); `status.needs` without `decide` (`:648-660`); `NEEDS: ${{ toJSON(needs) }}` replaces `resultsTested` (`:999-1020`); the status checkout's exact `with:`; both scripts in each lane's filter; no `decide` job in any lane; the no-draft-read pin (`:641-645`) also reads both scripts' text and refuses `draft` and `GITHUB_EVENT_PATH` there (a script could read the event payload the YAML scan never sees). The aggregator-name pin (`:87-132`) stays unchanged and green.
- Gate: `F`; `bun run test:ci-gating`; `bun run lint:actions`; `shellcheck scripts/ci-cd/e2e-decide.sh scripts/ci-cd/e2e-aggregate.sh` (actionlint sees only the call, not the files); `bun run check:plans`. Each exits 0.

### Phase 1.3: arc 1 gate ✓
- `bun run test:all`, `bun run test:release`. Then, with `load1 < 150`, build the armed bundle: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome` (and `build:firefox`).
- Smoke, Chrome then Firefox (`NULO_E2E_BROWSER=firefox`): `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension test:e2e -- tests/e2e/{auth-flows,wallet-lock,sw-resilience,sw-restart-network,observability}.test.ts --retry=0`. Then the whole smoke suite on Chrome once at retry 0.
- Network, one spec through the shared network block: `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/batch-mixed.test.ts`.
- Pass: all green at retry 0. A red gets one rerun; red again, run it on `ea8827f9`: green there means this arc broke it (fix the cause); red there too is logged in `lessons/phase-1.md` and filed (`flake` label only for a flake), and the gate stays unmet until fixed or reported as the blocker. No e2e scenario is added; the PR body gives each browser's smoke wall-clock (this PR's CI run and `dev`'s last).

## Arc 2 (PR B): #543 and #541

Starts per A3, on branch `harden-quality-fixes-2-arc2` off `dev` (cherry-pick this plan's commit if arc 1 has not merged). First re-verify recon's line numbers against the new base and log the moves.

### Phase 2.1: #543 ✓
- Change: `src/stores/cache.store.ts`, `src/composables/useConfirm.ts` (new), the 13 SFC sites, `useLockWallet.ts`, `useProfileImportFlow.ts`, `ImportContactsPopup.vue`, `EditContactPopup.vue`, `ConfirmPopup.vue`'s header comment, `CLAUDE.md`; `src/types/` regenerated by `bun run --cwd apps/extension build`.
- Tests:
  - `src/composables/useConfirm.test.ts`, on the real stores and a mounted `ConfirmPopup`, one case per behaviour, to CLAUDE.md's composable minimum without duplicates: every field reaches the dialog; a second request drops keys the first set (`single`, `pre_title`, `confirm_variant`); a request while the dialog is open keeps it open, on top, showing only the new request; after a close, the next request renders (the #567 class); confirm runs the callback once, then closes and clears; cancel runs nothing; two `useConfirm` users share one dialog, the later wins; the request is copied, so a later edit of the caller's object does not reach the dialog; `pinia.state` holds the request just made. One static case is the ban (the `storage-facade-ban.test.ts` pattern, its header naming the forms it reads): no `.ts` or `.vue` under `src/` outside tests assigns `cacheStore.confirm` or a field of it, except `ConfirmPopup.vue`'s reset and `useConfirm.ts`, and none but `useConfirm.ts` calls `open("confirm")`; it lists each offending `file:line`. Reads such as `useLockWallet`'s ownership check stay allowed.
  - Existing suites stay green with only their slot setup changed: `useLockWallet.test.ts`, `useProfileImportFlow.test.ts`, `tokens/[id].test.ts`, `full-passkey.pins.test.ts`, `ConfirmPopup.test.ts`.
  - The handshake suites exist and are re-pointed, not duplicated: `ImportContactsPopup.test.ts`'s `saveEdit` calls the payload's `onSave` instead of writing the slot (its cases at `:331,345,357` cover the re-judge, the cancelled re-open and row 0); `EditContactPopup.test.ts`'s import-mode cases (`:222,385,404`) set the payload, and its normal-edit cases (`:135,211`) open with none. Added: a bug pin that in import mode a clean Enter skips the dirty gate, restages the row and re-judges its selection, as today.
- Gate: `F`; `git diff --stat -- apps/extension/src/types` shows only the two new globals, `useConfirm` and the type `ConfirmRequest`, in `auto-imports.d.ts` (and `useConfirm` in `.eslintrc-auto-import.json`); the ban case is green and fails when one site is reverted by hand (proof, not committed).

### Phase 2.2: #541 ✓
- Change: `src/utils/full-backup-helpers.ts`, `full-backup-ctas.ts`, `useFullBackupImport.ts`, `useRestoreAgain.ts`, `popup/pages/import-helpers.ts`, `ImportFullBackupForm.vue`, `src/composables/runFence.ts`, `export/full.vue`, `export/account.vue`.
- First, on arc 2's base before any phase 2.2 edit (harden-security-fixes-2 arc 1 edits these files), write the two I2 pins in `useFullBackupImport`'s suite: a second Decrypt on an opened object with no profile type shows "Decryption Failed" and keeps the Decrypt section; a file sealed twice opens on the second Decrypt and shows the inner profile type. Both must pass there and after. If one fails there, I2 does not hold: log it and pin what the base does.
- Tests:
  - `full-backup-helpers.test.ts`: `readBackupFile` gives each kind (too large, bad JSON, unknown text, plain, encrypted), each with today's error; `openSelection` opens a `sealed` target and an `opened` one holding text; an `opened` one holding an object, a `plain` and an `unreadable` reject; a stale run gives `stale`; a good one gives `opened` with today's `profileType`.
  - `full-backup-ctas.test.ts` (new): the CTA predicates over each kind, the I2 pin included.
  - `runFence.test.ts`: a snapshot stays current across another snapshot and goes false after `invalidate()` and after `begin()`.
  - Existing suites unchanged in what they assert: `useFullBackupImport*.test.ts`, `useRestoreAgain*.test.ts`, `import*.test.ts`, `full.test.ts`, `full-passkey.pins.test.ts`, `account.test.ts`.
- Proof, not committed: `git diff` of `full.vue` and `account.vue` shows every changed line is a fence substitution (no `await` line added or moved).
- Gate: `F`; `bun run test:all`.

### Phase 2.3: arc 2 gate
- `bun run test:all`, `bun run --cwd apps/extension build`, `git diff --exit-code -- apps/extension/src/types`, `bun run check:plans`.
- With `load1 < 150` and the armed Chrome bundle: smoke `tests/e2e/{contacts,contacts-import,duplicate-phrase-import,passkey-backup,backup-imported-account,backup-roundtrip,restore-outcome,wallet-lock}.test.ts` at `--retry=0`; network `token-management` and `senders-advanced` (`NULO_E2E_RETRY=0`, as above). Same pass rule and red procedure as phase 1.3. No e2e scenario is added. `UI impact: none`; no screenshot is owed.

## Delivery

- Arc 1: branch `worktree-harden-quality-fixes-2`; `gh pr create --base dev` after phase 1.3 and its Codex loop, without labels. Title (66): `ci(e2e): one runner config, counted retries, shared gate scripts`. Body: per issue the change and why, `UI impact: none`, the checkout failure mode in one paragraph, the validation runs with outcomes, the smoke wall-clock per browser, "no e2e scenario added", `Closes #538`, `Closes #542`, `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Then `gh pr checks <n> --watch`; the four aggregators must report under their old names.
- Arc 2: branch `harden-quality-fixes-2-arc2`; the same steps after phase 2.3. Title (79): `refactor(ui): one confirm request helper; explicit backup selection and run fence`. Body as above with `UI impact: none` per issue, `Closes #543`, `Refs #541` (page step 3 remains, its own lane), and the A1-A3 answers. The close-out is this PR's final commits.
- Parallelism: arc 2's blockers, not effort, set the critical path; no lanes.

## Post-implementation

Follow `implementations-plan/README.md` § Post-implementation standard at revision `ea8827f9`:
- Step 1 is absent (`code_review: off`).
- Step 2 per arc, at its boundary, over that arc's diff from its base: `env -u CODEX_ACCOUNT ~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, then `resume-codex.sh`. Every prompt carries the standard's two rules verbatim, the arc map ("arc N of 2"), and this plan's rule verbatim: "An extraction that adds an await, moves a read, or adds a continuation is a defect." Then one fresh Codex session over the net diff for cross-arc issues. Log rounds in `lessons/phase-<arc>.md`. Hard stop at three rounds.
- Step 3: Delivery above. Step 4: the close-out in arc 2's PR; on #541 a comment naming what shipped and that page step 3 remains. Step 5: after arc 2 merges, `agent-worktree done harden-quality-fixes-2 --merged`, then the same for `harden-quality-fixes-2-arc2`'s worktree if one was made.

## Decision ledger

| # | Question | Chosen | Rejected, and why |
|---|---|---|---|
| D1 | Arcs | two: CI (no collision) and product (after three lanes) | four PRs (more review overhead, same critical path); one PR (blocks the CI work on other lanes) |
| D2 | `e2eRetry` input | `/^\d+$/` safe integer, unset or `""` falls back | `Number()` + `isInteger` (takes `"1e1"`, `" 2"`) |
| D3 | Where `retry` lives | explicit `e2eRetry(2)` in each config | inside the shared object (hides a per-lane policy) |
| D4 | Summary at 0 | always written when the env is set | only when N > 0 (absence and zero read the same; Opus called the zero line noise, Codex sided with it as evidence: one line per job) |
| D5 | Entry normalisation | every file-scoped test that locks or stops (6) | the issue's two (a retry of the others starts locked too) |
| D6 | Decide placement | a step of `changes`; the `decide` job goes | a `decide` job with its own checkout (a second new failure point; the owner's text names only the status checkout) |
| D7 | Aggregator input | `toJSON(needs)` + `jq`: every need checked, the suite list lives only in `needs`; attempt and lane name from the runner's `GITHUB_RUN_ATTEMPT` and `GITHUB_WORKFLOW` | one env per suite (the suite list written twice, in `needs` and in `env`, the duplicate `resultsTested` exists to pin) |
| D8 | Helper home | `useConfirm()` composable, type on the store slot | a cache-store action (no store opens a popup today); a bare function (store reads outside setup) |
| D9 | Handshake | one request `{ contact, onSave }` as the editor's popup payload: it lives exactly as long as the editor (reversed in round 1) | a renamed cache slot (outlives the editor, needs a clear on hide, and a normal edit opened beside it would read it: both reviewers preferred the payload); leave it (the brief puts it in scope) |
| D10 | Union shape | `kind` + per-variant fields, `backup` keeps its name, `type` goes | flat record with a `kind` added (two sources of truth) |
| D11 | `openSelection` | replaces `openEncryptedBackup` at its layer; opens any target holding text | an async wrapper over it (adds a continuation); accepting only `sealed` (breaks today's second Decrypt of a file sealed twice) |
| D12 | Export fence | `RunFence.snapshot()`; instance `runs` | `begin()` (invalidates in-flight runs, skips their `finally`) |
| D13 | Old-way confirm writes | one static ban case in `useConfirm.test.ts` | a one-time `rg` in the gate (JS SFCs are unchecked, so the pattern would rot); a new ban file (one case suffices) |
| D14 | Asks A1-A3 | the orchestrator accepted all three as written (2026-10-16): A1 the handshake takes `requestConfirm`'s discipline, not its helper (D9); A2 page step 1 includes `openSelection` (D11); A3 arc 2 waits on the three lanes | — |
| D15 | `networkRunner` shape (arc 1) | a function returning the options | the plan's object: built at import, it would construct the stateful reporters in every importer of `vite.shared.ts` (build and unit configs too) and share one instance between configs |
| D16 | Where the e2e status checkout and the run step are pinned (arc 1) | the checkout's whole step once, in `aggregators.test.ts`'s lane loader (it refuses any other shape before a table runs); the run step whole in `behavior-gating.test.ts` | the plan's second copy of the checkout pin in `behavior-gating.test.ts` (the same assertion twice) |
| D17 | Decide error text (arc 1) | names the step output the script reads (`live.outputs.label-hit`, `live.outputs.base`) | today's `changes.outputs.*` wording, which names job outputs that no longer exist |
| D18 | `requestConfirm`'s write type (arc 2) | the one write casts to `UnwrapRef<ConfirmRequest>`: Pinia's state type unwraps `toggle.model`, the runtime stores the caller's ref | typing `model` as `boolean` (a caller must pass a ref for the switch to write back) |
| D19 | `showsDecryptCta`'s reads (arc 2) | `kind`, then `profileType` only for an encrypted pick: today's read sequence, which the import pages' CTA read pins hold | one local read of `selectedBackup` (fails six read pins: a render dependency fewer) |
| D20 | The embedded profile name (arc 2) | `embeddedBackupName(backup)` serves the plain pick and the decrypt | a second copy of the plain path's cast, since the decrypt's typed `backupObject` is gone |
| D21 | The clean-Enter bug pin (arc 2) | two halves, one per component: the edit form saves the row unchanged; the importer re-selects a deselected new row on that save. The edit form's old clean-Enter case now dispatches where the form listens | one pin (no component test sees both popups); leaving the old case dispatching on a detached tree, where it passed whatever the gate did |

## Audit verdicts

**Round 1, Codex** (gpt-6.1-sol, high, session `01a1457a`): conditional approve, 5 findings, all accepted. #1 a nested vitest inherits the job's `GITHUB_STEP_SUMMARY`, so `observability.test.ts`'s fail-once fixture would put a false count in the smoke summary (demonstrated; the child gets its own file, and that pin carries the count test); #2 narrowing `kind` leaves `backup: unknown`, so the `as FullBackupEnvelope` casts at the validator stay, and the pick paths keep `parseError` first (demonstrated); #3 the scripts sat outside every lane's paths filter, so a gate-only edit would skip its lanes where an inline edit runs them (demonstrated; added, pinned); #4 `lint:actions` does not shellcheck script files (explicit `shellcheck` in the gate); #5 the handshake's request outlives an edit (needs a normal edit opened while the importer is open, which its outside-tap close prevents; closed by construction once D9 moved the request into the editor's payload). Corrections taken: the checkout adds its own outage window; the decide step's job keeps its read token in `.git/config`; the JSON input gets its own malformed cases; row 0 works today because `"0"` is truthy. Ledger: Codex sided with the plan on D1, D3-D8, D10, D11, with the outline on D9.

**Round 1, Opus lens** (Plan agent, opus): conditional approve, 8 findings, all accepted. #1 (medium) the union dropped `backup`/`profileType` from some variants, so five readers outside the plan would need rewrites and a naive one would disable Restore on a plain file with no profile type (demonstrated by type trace): every variant carries both, `null` where absent, and the readers stay byte-identical. #2 (medium) I2 is pinned on arc 2's own base, which harden-security-fixes-2 changes, not on `ea8827f9`. #3 the types gate also expects `ConfirmRequest` (auto-imports emit types); the slot becomes a `ref`, since replacing a `reactive` store property leaves `pinia.state` behind. #4 the handshake tests exist: re-point them, add only the clean-Enter bug pin. #5 outcome (3) overstated what an unchecked JS SFC and a one-time `rg` prove: a committed ban case (D13), and `ConfirmPopup.vue`'s stale toggle comment is rewritten. #6 no gate loads the combined e2e config: a before/after dump of each resolved `test` object. #7 `RUN_ATTEMPT` and `LANE` duplicate `GITHUB_RUN_ATTEMPT` and `GITHUB_WORKFLOW`: dropped. #8 a lost merge commit is recovered only by a push or a close and reopen; the status jobs' inherited permissions are stated per lane. Ledger: Opus sided with the plan on D1, D3, D5-D8, D10, D11, with the outline on D4 (kept: Codex disagreed, and a missing block must differ from zero) and D9 (taken, with Codex), ties on D2 and D12; it read the outline's D7 alternative as one env per suite, and the rejection reason now says so.

**Final pass, Codex** (gpt-6.1-sol, high, fresh session `01a1458e`): conditional approve, 1 finding, accepted. A file sealed twice decrypts to a JSON string; today Decrypt stays offered and a second click opens the inner backup, which an `openSelection` accepting only `sealed` would turn into "Decryption Failed" (demonstrated in memory against the helper chain): it now decides by the runtime type of `backup`, with a pin for the nested case written on arc 2's base. Codex found no other path to a green check without suites, judged the round-1 fixes complete and in proportion, and the rejected alternatives rightly rejected (D9's payload included).

**Arc 1, round 1, Codex** (gpt-6.1-sol, high, session `01a145c0`, over `c310bce2..10f8c519`): no blocking regression, 4 low findings. Accepted: #1 `e2e-decide.sh` let a malformed `SURFACE` read as a skip (inherited from the inline gate; plausible, needs an upstream output anomaly): it now refuses anything but true/false, with one test per refused class; #2 CI.md's job counts were wrong before and after the edit (18 more jobs, 14 suites, 4 control; 11 network suite jobs per browser); #4 in part: the two `vite.shared.ts` comments tightened, the loader's restating comment dropped. Rejected: #3, the network config's retry comment is unchanged existing text whose archive path resolves (CLAUDE.md lets it stay until rewritten); #4's other trims, since the headers state the invariant the test or reporter exists for.

**Arc 1, round 1, Opus lens** (general-purpose, opus): approve with small fixes, 4 findings, all accepted. #1 and #2 are Codex's #2 and #1. #3 the aggregate header listed "a suite that vanished" among the faults the script catches; it cannot see a need that is not in `needs`, so the header now says the test holds `needs` to every job. #4 `verify-cert-run.sh` still named the removed `decide` job.

**Arc 1, round 2, Codex** (resumed session `01a145c0`, over `10f8c519..0ceeb1db`): "No new material finding (high confidence)." The fixes are correct and complete; no settled disposition reopened. Arc 1's loop has converged; the cross-arc pass over the net diff runs after arc 2.

**Arc 2, round 1, Codex** (gpt-6.1-sol, high, session `01a146da`, over `5e2888be..b1d4cefe`): no runtime regression (moderate confidence), 3 low findings. Accepted: #1 the confirm ban split each file into lines, so `Object.assign(` or `open(` with its argument on the next line passed (demonstrated in memory): it now scans each file's whole text, reporting the line a match starts on, with a case that proves it sees each named form, split ones included, and lets reads pass; #2 the inherited decrypt publication-race case queued its re-pick before `decrypt()` resolved, so the helper's own stale check caught it and the caller's fence was never reached (demonstrated: removing that fence still passed); the re-pick is now queued from the helper's parse of the decrypted body, after its last stale check, and removing the caller's fence fails it; #3 `profileTypeOf`'s unchecked read gets the one sentence that keeps a "type safety" cleanup from changing a malformed file's CTAs. Rejected: #3's trim of the union's header clause, which states why every kind carries `backup` and `profileType` (round 1 of the plan audit found a union without them breaking five readers).

**Arc 2, round 1, Opus lens** (general-purpose, opus): no regression, 2 low findings, both accepted. #1 the copied-request case passed without the copy, since a changed field of a stored object does not re-render (demonstrated in Vue): it also reads the slot through the store, and storing the caller's object fails it; #2 the ban's header and CLAUDE.md claimed more than it reads: it knows only the name `cacheStore` (and `useCacheStore()`), so both now say so; the split-call half is Codex's #1.

## Seeds

Drafts until the orchestrator approves; no ELI5 is produced (orchestrator-owned).

```
/goal Arc 1 then arc 2 of implementations-plan/harden-quality-fixes-2/plan.md done: every phase marked ✓ with its gate output in the transcript; each arc's Codex loop converged (a resumed pass with no new material finding, quoted); PR A (Closes #538 #542) and PR B (Closes #543, Refs #541) open against dev only after their loops, checks green, the four aggregators under their old names; the close-out commits in PR B with `git show --stat` of the archive move.
```

```
/loop 15m Drive implementations-plan/harden-quality-fixes-2 per its plan.md: reality check against plan.md and lessons/; arc 2 starts only per Ask A3; run each phase's gate as written; Codex per arc at its boundary (env -u CODEX_ACCOUNT, gpt-6.1-sol, high); never merge; stop and report when both PRs are green.
```
