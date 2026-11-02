---
plan: w3-import-1
tier: light
status: completed
issues: "#1458, #1466, #1459 (arc 1)"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg
base: origin/dev at b21fcdac8
trunk: dev
post_implementation_hardening: not scheduled
---

## Outcome

- **Date**: 2026-11-02
- **Status**: completed, one arc as #1570.
- **Shipped**: #1570 closes #1458 (D1: the rollback keeps the key of an account row that stays), #1466 (D2: the onboarding import page fences its completion at every await) and #1459 (D3: the export leaves out Pending rows), each proven by a test red on `dev` first.
- **Known limits**: #1566 (a failed import whose rollback also fails keeps a working account nothing announced).
- **Dispositions**: rejected, refusing the export while a send is Pending (a screen change; the issue recommends the filter) and a fence in `useProfileImportFlow.dispose` (D2).
- **Lessons**: none promoted. `lessons.md` is at its 8 KiB budget, and the citation test names its own misses ([lessons/phase-2.md](lessons/phase-2.md)).
- **Open items**: none.
- **Seeds retired**: the `/goal` and `/loop` seeds below are not to be run.

# w3-import-1: a failed import keeps a live account's key, a departed onboarding import stays put, a backup holds no pending send

One arc, one PR: three bug fixes in the import and backup paths, each proven red first. Recon and the claims check: [recon.md](recon.md). Asks: [OWNER-ASKS.md](OWNER-ASKS.md) (none). Consults: [lessons/phase-0.md](lessons/phase-0.md). Paths are under `apps/extension/src/` unless they name another root.

## The findings, checked

| Issue | Path (initial state → events → invariant → consequence) | Label | Fix |
|---|---|---|---|
| #1458 | Both import rows commit → `isChainLive` rejects after the writes → `unwrite`'s `storage.get` (or `delete`) rejects, so the account row stays → storage recovers → the catch deletes the key. Breaks "never an account that cannot sign" (`service.ts:818-823`). The account lists, cannot sign, refuses re-import. Reached from `importAccount` and `recreateImportedForReset` | demonstrated (trace; T1 reproduces) | D1 |
| #1466 | Seed or backup import running on the onboarding tab → the person presses the header Back (never disabled) → the page unmounts → the import resolves → `completeImport` marks the new entry, bootstraps over Create's fence, pushes `/onboarding/done` | demonstrated (trace; T2 reproduces) | D2 |
| #1459 | A send is Pending → the person exports a full backup → the file carries the Pending row → import: restore throws on it, `isRestoreHasErrors` holds the auto-complete behind the error screen | demonstrated (trace; T3 reproduces) | D3 |

## Outcome & Quality Bar

- **For whom:** a person importing an account or a profile, or restoring a backup, when storage faults, when they change their mind mid-import, or when a send is still in flight.
- **Excellent:** a failed import never leaves an account the wallet lists but cannot sign for; a page the person left never moves the tab or starts a bootstrap; a backup this build writes holds no row its own restore refuses.
- **Good enough:** nothing a person sees changes on any screen that works today. The residuals already accepted stay as they are (#727: a bootstrap already started finishes after Back).

## Assumptions

**Facts** (verified at `b21fcdac8`; citations in recon)
1. `commitImportedAccount`'s catch deletes the key whenever `keyWritten` (`service.ts:845-848`); `unwrite` can throw its own storage error in place of the refusal (`:557-564`).
2. `sweepOrphanImportedKeys` (`:243-251`) already holds the rule "delete a key only when its row is not occupied, under the row's lock".
3. The onboarding import page has no lifetime fence. Create's `createRunFence` lifetime fence (`create.vue:50-51`, checked after every await) is the pattern D2 copies; the popup import guards with an `isUnmounted` flag and `flowLive()` (`popup/pages/import.vue:67-77`).
4. One `completeImport` callback serves the seed and the restore paths (`useProfileImportFlow.ts:29-35`).
5. Restore refuses a Pending row on purpose: a stored one is re-armed and its backup-controlled endpoint dialled (`transaction/service.ts:711-715`). That refusal stays.
6. The harnesses exist: `account/service.test.ts:662-720` (its compensation `test.each` at L856-874), `onboarding/pages/import.test.ts:1-125`, `transaction/service.finality.test.ts`.
7. `KeyedLock` is a non-reentrant FIFO per key; the catch runs after the row lock's hold ends and after `unwrite` released its own, and `isChainLive` takes no lock, so the catch's row lock cannot deadlock (`lock.ts:91-97`, `network/service.ts:695`).

**Inferences:** I1. A rejected `storage.commit` may or may not have landed; D1's check covers both without knowing. I2. No stored shape, message or backup-file shape changes, so no migration and no backup-schema bump.

**Asks:** none open. A1 (settled by the panel, below): #1459's "refuse at export" option is not built; it would change what a person sees, and the issue recommends the filter.

## Decisions

- **D1 (#1458). Delete the key only when the account row is positively gone.** Extract `deleteKeyIfOrphan(profileId, chainId, address)` from `sweepOrphanImportedKeys`'s per-row body (row lock, `storage.occupied`, then `importedKeys.delete`). The sweep calls it; `commitImportedAccount`'s catch calls it instead of the bare delete, still with `.catch(() => {})`. A failed check keeps the key: an orphan waits for the sweep at the next worker's key-ready (`onRowKeysReady`), and an account that cannot sign is never made. The doc comment above `commitImportedAccount` says "removes it once the account row is gone". Rejected: a flag set when `unwrite` succeeds (misses the in-lock commit path, I1, and duplicates the sweep's rule); running the fallible step first (the liveness read must follow the write, or a purge that snapshotted during it misses the row).
- **D2 (#1466). The onboarding import page fences its own `completeImport` at every await.** `const lifetime = createRunFence(); const isMounted = lifetime.snapshot()`; `lifetime.invalidate()` first in `onBeforeUnmount`. `completeImport` returns before `markFlowPath` when `!isMounted()`; writes the pointer with `setLastActiveProfileId(p.id, { unless: () => !isMounted() })` (the facade's existing contract, as `new-profile-helpers.ts:106` uses it); returns before `completeImportWithRecovery` when `!isMounted()`, so no bootstrap starts after departure; its `recover` starts no hydrate when `!isMounted()`; returns before `router.push` when `!isMounted()`. The profile already exists, so a departed import completes silently. Rejected: a fence in `useProfileImportFlow.dispose`. The fix scope is completion after the profile exists: the page fence stops the shell-owned history mark, pointer write, bootstrap, recovery and navigation. It does not make the composable's `dispose()` terminal (the lessons rule) for the import's earlier steps; cancelling those would be new behaviour, out of scope. The shells own navigation, and both other shells fence in the page.
- **D3 (#1459). Export applies restore's status rule.** `exportableTx` returns false for `TxStatus.Pending`, with one line saying restore refuses it. The row was lost on import before; now it is absent from the file and the restore completes. A backup written before this fix still meets restore's refusal, as today; nothing is migrated. Rejected: refusing the export while a send is Pending (a screen change; owner call, not recommended by the issue); exporting it as another status (invents state); restoring it silently (weakens the boundary in Fact 5).
- **D4. Tests** (each red on the base copy, green after):
  - T1 `account/service.test.ts`, in the importAccount deletion-fence `describe`: liveness read 2 arms a one-shot wrapper (so the duplicate check's `occupied` read before the writes is untouched), then rejects; the wrapper makes the next `get` of the account key reject. Assert the log shows both writes, the import rejects with the wrapper's error, both rows stay (`keysLeft()`), nothing is announced. The `test.each` at L855-870 is the control (both rows removed when `unwrite` succeeds), unchanged.
  - T2 `onboarding/pages/import.test.ts`, one case per departure point: (a) `importMnemonic` resolves after unmount: no mark, no pointer write, no bootstrap, no route; (b) the pointer write resolves after unmount: no bootstrap, no route; (c) the bootstrap (started while mounted) returns `false` after unmount: no `hydrateKnownProfile`, no route. Each asserts only calls that start after the departure. T2 resets `history.state` before it starts (earlier tests leave a mark). The tests at `:156-177` ("goes on to /onboarding/done") are the controls.
  - T3 `transaction/service.finality.test.ts`: a Pending and a Proposed row of `p1` at distinct hashes, seeded through storage (restore refuses Pending); `backup()` holds exactly the Proposed one; `restore()` of that output into a fresh `FakeBrowserApi` and service restores exactly one row, readable, with no `restoreError`. The existing Pending refusal (`cross-profile-isolation.test.ts:670`) stays the boundary's test.
  - No e2e scenario added: each failure is a timing or storage fault a unit or page test drives exactly.

## Architecture & Implementation

| File | Change |
|---|---|
| `wallet/services/account/service.ts` | D1: `deleteKeyIfOrphan`; the sweep and the catch call it; one comment updated |
| `onboarding/pages/import.vue` | D2: lifetime fence, four checks and the pointer's `unless`, `invalidate()` on unmount |
| `wallet/services/transaction/service.ts` | D3: one clause in `exportableTx`, its doc line |
| `account/service.test.ts`, `onboarding/pages/import.test.ts`, `transaction/service.finality.test.ts` | T1-T3 |

## UI impact

None. No screen's layout, copy, rows or formatting changes. Behaviour returns to each issue's stated expectation: the onboarding tab stays where the person went; a restore of a backup this build wrote no longer stops on a spurious error screen.

## Security & Adversarial Considerations

- **Trust boundary kept:** a backup file is attacker-controlled; restore still refuses a Pending row (Fact 5). D3 only stops the wallet writing one.
- **Keys:** D1 keeps a sealed key in more cases, never fewer protections: it stays sealed under the profile DEK, purges and the orphan sweep still reclaim it, no log line is added.
- **Stale page writes:** D2 stops a departed page starting a bootstrap or a hydrate that writes shared stores over Create's session; one already running finishes (#727, known limit).
- No permission, message, dependency, CSP or stored-shape change.
- **Residual, pre-existing, filed as a known limit in Phase 2:** when `unwrite` cannot remove the row, the row (now with its key) was never announced (`onAccountAdded`), so listeners miss it until a reopen or restart, and a purge that snapshotted before the write leaves it on a deleted chain. Base keeps the same row without its key, so D1 is strictly better; fixing it needs a recovery policy for a row of unknown liveness, which is out of scope.

## Phase 1 (arc 1): reproduce ✓

1. Add T1, T2 and T3 against the base sources. Commit `test: …` (signed).
2. Run `(cd apps/extension && bun --bun vitest run src/wallet/services/account/service.test.ts src/onboarding/pages/import.test.ts src/wallet/services/transaction/service.finality.test.ts --retry=0)`.

**Gate:** pass = exactly the new cases fail, each on its stated assertion (T1: key row gone; T2(a)(b): `bootstrapActiveProfile` or `router.push` called after the departure; T2(c): `hydrateKnownProfile` called after the departure; T3: the Pending row exported); every other case green. A case green on base first goes back to its trace: fix the test until it reaches the traced fault. Only a trace that itself fails is a claim that did not hold: say so on its issue with what was run and close it `known-limit`, per the lane brief.

## Phase 2 (arc 1): fix and gates ✓

1. Make D1, D2, D3, one commit each (`fix(account): …`, `fix(onboarding): …`, `fix(backup): …`).
2. Rerun Phase 1's command: every case green.
3. File the residual (Security section) as an issue labelled `known-limit`, closed as not planned, after `gh issue list --state all --search "imported account not announced"`; its reopening condition: a report of an imported account missing from a list or a scan after a failed import.

**Gate:** 1. `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`. 2. `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run --cwd apps/extension build:chrome`, then `build:firefox`. 3. `cd apps/extension && NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/import-paths.test.ts tests/e2e/account-import-export.test.ts tests/e2e/backup-roundtrip.test.ts --retry=0`, then the same with `NULO_E2E_BROWSER=firefox`; record each wall-clock. 4. `bun run check:plans` after staging. Pass: all exit 0 at retry 0; a red e2e reruns once on base first (lessons), real breakage gets a fix.

**Arc 1 as built** (`worktree-w3-import-1`). Phase 1: the five new cases red on base, each on its stated assertion. Phase 2 gate green at the final code commit: lint, `typecheck:all`, `bun run test` (16 720 passed), `test:all` (17 workspaces), both armed builds, the three smoke files at retry 0 (Chrome 8 tests in 81.9 s, Firefox 8 in 114.8 s), `check:plans`. Known limit #1566 filed and closed.
- Deviation: `tests/e2e/helpers/profile-chaos/model.ts` cites `account/service.ts` by line number; D1 moved four cited lines, so `scripts/e2e/profile-chaos-model.test.ts` failed until they were repointed (own commit).
- Review round 1 added: T2(b) asserts the pointer write's `unless` (false mounted, true after leaving; a mutation dropping it now fails the test); the `lastActive` spy is reset per test (vitest 4's `clearAllMocks` keeps queued once-values); comments name both orphan-key sources and when the sweep runs.

## Delivery

- Branch `worktree-w3-import-1` (single arc; no stack). After the loop converges: `gh pr create --base dev`, ready, no label at creation. Title `fix(import): keep a live account's key, fence a departed import, export no pending send` (87 characters). Body: what changed and why per issue, the red-then-green proof, runs and outcomes, "no e2e scenario added or changed" with each browser's wall-clock for the three files, `Closes #1458`, `Closes #1466`, `Closes #1459`, ending `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- Before building, write the pick under `## Decision` on each issue (D1, D2, D3). Commits conventional, lower case, signed, ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Parallelism: none worth it (three small serial fixes).

## Post-implementation

The contract is this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `b21fcdac8`. Specific here:
- Step 1 is absent (`code_review: off`). Step 2 runs once over `git diff b21fcdac8...HEAD`: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; one Opus 5.5 diff review (`general-purpose`) beside round 1. Prompts under `~/.cache/nulo-backlog/w3-import-1/`. Hard stop at three rounds; each round in `lessons/phase-2.md` and the table below.
- Approval boundary (a plan change; stop): any change to a screen; a fence in the composable; a new retry, lock or stored field; a new e2e scenario.
- Close-out as the PR's final commits: the Outcome; a comment on any issue not fixed; lessons promoted within the 8 KiB budget; `STATUS.md` deleted; `git mv` into `archive/`, index line moved. Teardown after the merge: `agent-worktree done w3-import-1 --merged`, trunk `dev`; the archived plan is `implementations-plan/archive/w3-import-1/plan.md`. The orchestrator notices the merge; this session does not wait for it.

## Audit verdicts and decision ledger

| Round | Leg | Verdict | Accepted | Rejected |
|---|---|---|---|---|
| plan 1 | Codex, gpt-6.1-sol (session 01a19e2c) | conditional approve | D2's check after the pointer write and its `unless` (a departure there still started a bootstrap); T1 armed in liveness call 2; T2(c) asserts the hydrate; T3 into a fresh store, counting the row; a green-on-base test goes back to its trace before any known-limit close; the sweep runs at the next worker's key-ready; D3 promises only new exports | none |
| plan 1 | Opus 5.5 (Plan) | conditional approve | the same D2 window and T1 arming; T2 resets `history.state`; the Outcome narrowed; D2's rejection cites the C1 `dispose()` lesson; Fact 3 and the `test.each` lines corrected; Fact 7 (no deadlock); the unannounced-row residual filed as a known limit | none |
| final 1 | Codex, resumed (session 01a19e2c) | conditional approve | D2's rejected-alternative rationale narrowed to completion after the profile exists (the import's earlier steps stay unfenced, out of scope) | none |
| final 2 | Codex, resumed | **approve** | the condition verified; no regression | none |
| arc 1 r1 | Codex, gpt-6.1-sol (session 01a19e3c) | conditional approve | T2(b) must prove the pointer write's `unless` | none |
| arc 1 r1 | Opus 5.5 (general-purpose) | approve | the same `unless` gap; the spy reset; the sweep's doc names both orphan sources; the catch comment reworded; #1566 names both triggers | none |
| arc 1 r2 | Codex, resumed | **approve** | fixes and the citation repoint verified; no regression | none |

## Seeds (not run; orchestrator-owned)

```
/goal Phases 1 and 2 of implementations-plan/w3-import-1/plan.md marked ✓ with their gates passing in the transcript; T1-T3 red on base then green; the Codex loop (gpt-6.1-sol, high) converged; one ready PR against dev closing #1458, #1466 and #1459; bun run test:all and bun run lint exit 0.
```

```
/loop 15m Drive implementations-plan/w3-import-1 per its plan.md and the README § Post-implementation standard at b21fcdac8: run the gates, decide open questions with Codex (gpt-6.1-sol, high), open the PR, never merge, never change a screen; stop once its checks are green and report.
```
