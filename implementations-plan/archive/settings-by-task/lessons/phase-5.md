# Phase 5: the Codex fix loop on the net diff

`/codex high` on `gpt-6.1-sol`, read-only, against this worktree at `a2f8bdc` with the net diff from `50540c8` (`_impl.diff`, the plan files and the regenerated `src/types/` excluded), the plan, the three phase logs, and the two rules from § Post-implementation.

## Round 1: fresh session

Verdict: `approve`. "No new material findings in A–E." Every claim was checked against the code at HEAD: the dispose contract, the hub's fence and generation, the redirect records, the Lock page, the pinned toggle bug, the back targets, the labels. No fix.

## Round 2: resumed, adversarial

Asked to attack the five riskiest spots, to construct a listener leak, an orphaned confirm, a stale-handle lock, a stale hub value, and an e2e false pass, and to re-read every added comment.

Verdict: `conditional approve (with conditions: address R1 before relying on the Lock now smoke; correct R2's restart-recovery claim)`.

| Id | Severity | Claim | Decision |
|---|---|---|---|
| R1 | Medium | `wallet-lock.test.ts:31`: `waitForLockScreen` reloads when the hash is not on auth (`fixtures/helpers.ts:104`), so the Lock now smoke passes when the live redirect never happens | Adopted: `waitForHash(page, "#/popup/auth", 15_000)` right after the click, before the helper. The helper's reload tolerance covers a race after a password change, which this test never does. Proved by three Chrome runs and one Firefox run (below). |
| R2 | Low | `plan.md` Inference 6 said the attempted value "does not outlive the restart"; a rejected reconnect read keeps it | Adopted: reworded to "until the first successful reread". |
| R3 | Low | Five comments to delete or tighten: two test-file summaries, the `readAnswers` helper line, the `IconSlotAndDanger` story line, the composable's TSDoc recap and the session-change comment's over-broad claim | Adopted; the TSDoc keeps its one-sentence contract ("locks at once, or asks first while approved sends run") and the `managers.profile` requirement. |

Proofs of safety recorded by the review, kept here because they are the argument for the contract: overlapping decisions share the counter and the last `finally` removes both listeners; an `onUpdate` between `getProps()` resolving and the copy loop fences its key, and the loop has no suspension point; a reconnect during the first read starts a new generation, so the old answer fails the check; the redirect records are appended before router creation and vue-router resolves a redirect before the guard sees the target's meta; the Terms sheet covers pointer input and the lock has no legal check. Two inherited limits, both verbatim from the header chip: a lock decided before the session-change event arrives can send a handle the worker refuses under `runExclusive` (`wallet/services/profile/service.ts:901`); the running-send branch has no second login check.

## Round 2 fixes

Five files under `apps/extension`, +5/−15: the R1 wait in `tests/e2e/wallet-lock.test.ts`, the R3 trims in `useLockWallet.ts`, `useLockWallet.test.ts`, `settings-labels.test.ts` and `Settings.stories.ts`. Proof: `wallet-lock.test.ts` three times on Chrome (Lock now test 3.8 to 4.0s, file 17.6 to 20.5s) and once on Firefox (4.3s, file 21.4s), no retries, against the existing builds (newer than every production source change); `bun run lint` exit 0; the two unit files 38/38. Round 3 (resumed, on this fix diff) decides convergence.

## Round 3: resumed, on the fix diff

Verdict: `approve`. "No new material findings." R1, R2 and R3 confirmed resolved; the only executable change is the added e2e assertion. One caveat recorded, no change: the live redirect awaits `getProfiles()` (`popup/locked-state.ts:49`) and the transport timeout is 60 seconds, so the 15-second budget has no proven upper bound; the four runs at 3.8 to 4.3 seconds and the reopen path's own 10-second budget support keeping it. The loop converged: three rounds, one fix commit (`e4d3e82`).

## Delivery gates after the rebase onto origin/dev (`b56d5e3`)

The rebase replayed eight commits with one conflict, `implementations-plan/index.md` (three plans dev added beside this one). A stale `apps/landing/src/generated/release.json`, written by the landing build before #49 dropped that step and its ignore line, was deleted; it had aborted the first `audit:vue` on a format error. On the clean tree: `bun install --frozen-lockfile` exit 0; `bun run audit:vue` exit 0 (typecheck 59.5s, lint 1.8s, 703 test files / 10,440 tests, build 26.6s); `bun run check:plans` 0 findings; `bun run test:ci-gating` 383 pass; `settings-routes`, `navigation` and `wallet-lock` smoke on Chrome 11/11. The build left `src/types/` unchanged.
