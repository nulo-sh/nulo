---
plan: exec-send-1
tier: light
status: plan approved (Codex final approve); arc 1 (#1426) phase 1 green, loop converged; arc 2 (#1432) waits on OA-1
issues: "#1426, #1432"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon 1 explorer (sonnet); Codex gpt-6.1-sol high audit round trip + Opus Plan leg; final fresh Codex pass
base: origin/dev at 51ea220b1
trunk: dev
post_implementation_hardening: not scheduled
---

# exec-send-1: a cancelled send that restarts, and a Send screen that opens on a stale balance

Two Major bugs from the bugs harden at `51ea220b1`, the base, so the issues' line numbers hold. #1426: a dApp send whose claim reads its queued row while a cancel lands, and whose read then fails, continues under a new row with a fresh controller. #1432: Send's first load installs a balance snapshot older than an event that landed during the load. Recon: [recon.md](recon.md). Every claim in both issues held against the tree; where a claim is only partly load-bearing, the Assumptions say so. Paths are under `apps/extension/src/` unless they name a package.

## Outcome & Quality Bar

- **For whom**: a person who cancels a queued dApp send; a person who opens Send while the wallet is refreshing balances.
- **Excellent**: (1) a cancel that the journal accepted is never followed by a broadcast of that send, whatever a storage read does; (2) Send's balance corner and Max show the newest balance the wallet has told the page about, and a deleted row stays gone, while Send's failure card shows when and as it does today.

## Assumptions

**Facts**
- F1. `getOperation` resolves `undefined` for a missing or unopenable row and rejects only when storage or the service's init rejects (`wallet/services/operation-journal/service.ts:531-535`, `wallet/storage/sealed-entity-storage.ts:168-174,518-565`).
- F2. `cancelJob` commits `cancelled` under the journal's transition lock, then aborts the registered controller (`wallet/services/execution/execution-lane.ts:205-245`); `abortCancelled` is the only path that aborts it, always after that commit.
- F3. `execution/claim-helper.ts:80` turns a rejected read into `null`; `:81-86` then deletes the pre-acquire controller and creates a fresh row with a fresh controller (`:152-161`); the caller checks only that controller (`dapp-send-executor.ts:370-374`). The scope re-file already refuses an aborted pre-acquire controller (`claim-helper.ts:210-213`).
- F4. A claim that throws is failed and cleaned by the caller: `failUnclaimed` fails a `queued` or `pending` row and skips the cancel sentinel; both controller keys are deleted before the slot is released (`dapp-send-executor.ts:402-419`, `execution-lane.ts:415-423`; pinned by `dapp-send-executor.test.ts:365,1188-1204` and `execution-lane.test.ts:919`).
- F5. The GC never evicts a cancelled row (`operation-journal/gc.ts:17-24`); a profile or chain purge deletes rows, and the fresh create then refuses by its profile and network fences.
- F6. Send's first load reads balances itself in a `Promise.all` with tokens and contacts and installs them after all three, unless the hook landed a read meanwhile (`popup/pages/send.vue:713-731`); while the rows are empty the hook's update and delete handlers patch nothing (`composables/useTokenBalanceSnapshot.ts:54-63`).
- F7. The hook's `fetchTokenBalances` lands its read at once, refetches when an in-scope event marked the run dirty, lets only the latest run land, settles a refusal as `unavailable` unless it is already `loaded`, arms one 2 s retry, and never rejects (`useTokenBalanceSnapshot.ts:86-124`). Send's own first read never sets that state, so at the base it stays `loading` until a hook read settles it.
- F8. The owner converged every balance list on the hook's rules and kept Send's failure card (P44-02 = B, PR #781): a refused first-load read of tokens, balances or contacts shows the card with Retry, at once, since `Promise.all` rejects on the first refusal.

**Inferences**
- I1. The #1426 trigger (a `storage.local.get` rejection overlapping a cancel in the claim window) is rare; its consequence, a broadcast the person refused, is irreversible. Labelled demonstrated by trace (F2-F3); phase 1's tests reproduce it.
- I2. The #1432 race is common (Send opened right after unlock, while `refreshBalances` runs). The wallet re-checks the amount at estimate and prove (the issue's statement, not re-verified here), so the loss is a wrong number and a refused send, not a wrong send.
- I3. A newer read can supersede the first load's balance read only through a reconnect, and a reconnect follows a dropped port, which rejects every request posted on it before the client reconnects, and `onConnected` fires only after Ready (`packages/extension-messaging/src/background/client.ts`, `onDisconnect`). So the hook dropping a superseded good read (the case #781's review guarded) needs conditions the wallet does not support.
- I4. In a `refreshBalances` burst, events that overlap one balance read coalesce into one refetch, but events that keep overlapping each refetch prolong the first load, as on Home. Plausible; no code.

**Asks**
- A1. [OWNER-ASKS.md](OWNER-ASKS.md) OA-1: Send's corner for a selected token with no balance row after a refused re-read, the skeleton (A, recommended) or the blank until the retry (B). P44-02 = B showed seven named rows and this was not one of them (`archive/ui-dedupe-1/OWNER-ASKS.md` OA-1, OA-3), so the panel does not decide it. Working assumption: arc 1 (#1426) ships now; arc 2 (#1432) waits for the answer, since both options shape its design.

## Architecture & Implementation

- **#1426 cause**: the claim treats "the read failed" as "the row is gone" and replaces the row. **Change** (`claim-helper.ts`): the read's rejection propagates (`disambiguateClaimFailure`'s `.catch` at `:261` stays: its `null` already rethrows the claim's error); when the pre-acquire controller is already aborted, the claim throws `JobCancelledSentinel` instead, so the dApp gets 4001 as for every other cancel. The genuine-absence branch is unchanged (D3). The caller already fails and cleans up (F4). Header comment: the decision tree gains "unreadable → reject".
- **#1432 cause**: Send's first load bypasses the hook that owns the "an event outlives an older snapshot" rule. **Change** (`send.vue`): the balance leg of the first load's `Promise.all` becomes `balances.fetchTokenBalances()`, and the late install with its guard goes. To keep the failure card (F8), `fetchTokenBalances` resolves `false` when its own read (or its dirty refetch) was refused and `true` otherwise, superseded or with no account included (`useTokenBalanceSnapshot.ts`; other callers ignore the value). The balance leg itself rejects on `false`, so `Promise.all` rejects at once and the card shows as soon as the balance read is refused, as today, not when tokens and contacts settle.
- **File-level change map**: `wallet/services/execution/claim-helper.ts`; `composables/useTokenBalanceSnapshot.ts` (return value, its doc); `popup/pages/send.vue` (`refetchIdentityScopedState`). Tests: `wallet/services/execution/claim-helper.test.ts`, `composables/useTokenBalanceSnapshot.test.ts`, `popup/pages/send.test.ts`.
- **Not taken**: a shared fail-closed read helper (D2); an aborted check on the absence branch (D3); a revision counter in the page or a hook option to rethrow (D4).

## UI impact

1. Send's balance corner and Max, in the race: the newest balance instead of the older snapshot; a row deleted during the load stays gone. The PR body carries before and after captures.
2. A dApp send whose queued row cannot be read ends as failed (its card reads failed, the dApp gets an error) instead of running under a new card; with a cancel already landed it stays cancelled and the dApp gets 4001. #1426's "Expected" states this.
3. Arc 2 only, on OA-1 = A: Send with a selected token that has no balance row, after a refused re-read (a worker restart): the corner keeps its skeleton instead of going blank until the 2 s retry, because Send's first read now counts as a read, as Home's and Holdings' do; `send.test.ts:747` is re-premised on that rule. On B, arc 2 is re-planned to keep the blank.

Items 1 and 3 are arc 2's; item 2 is arc 1's. The failure card, the loading state and every other value are unchanged. Sign-off: decision page 94, P94-01 (signed 2026-11-01), "the nine Major bugs the bugs harden found at dev 51ea220b1 are fixed as lanes merged on green", under the owner's rule of 2026-10-30: "if they are bugs, work on them. all of them sound very worth fixing. Merge those on green, I review the captures if needed."

## Security & Adversarial Considerations

- **Invariant**: a cancel the journal accepted stops the send; nothing replaces a queued row that the claim could not read.
- **Threat model**: no new input crosses a boundary. The adversary is the environment (a storage fault, a worker restart) and a dApp that floods sends; the existing queue caps bound the flood, and a failed read now ends the send with an error rather than creating rows.
- **Fail closed**: a transient read failure without a cancel now fails the dApp's send (the dApp may retry) instead of running it under a new id; this trades availability for consent, the right side for an irreversible broadcast.
- **Logging**: no new line; the error reaches the journal as `failUnclaimed` records it today. Crypto, supply chain, permissions: no change. One-broadcast-line rule (`sendTxTask`): untouched.

## Phase 1: an unreadable queued row ends the send (#1426; arc 1) ✓

- Change `claim-helper.ts` as above.
- **Tests**
  - Unit, `claim-helper.test.ts`, the pre-acquire controller registered and the claim's `getOperation` held:
    - the controller is aborted (a cancel landed), then the read rejects: the claim rejects with `JobCancelledSentinel`; `createFreshRecord` and `registerInFlight` are not called. Red at the base: it resolves with a fresh id and an un-aborted controller.
    - no abort, the read rejects: the claim rejects with that error object; nothing is created or registered. Red at the base.
    - Success control: the existing "record not found → createFreshRecord" case stays green. `cancelJob` aborting the registered pre-acquire controller is pinned already (`execution-lane.test.ts:74,511`).
- **Validation gate**
  - `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`: exit 0.
  - From `apps/extension`: `bun --bun vitest run src/wallet/services/execution src/wallet/services/operation-journal --retry=0` green; both new cases red with the base's `claim-helper.ts` (`git show 51ea220b1:<path>`) in place.
  - From the root, never beside a smoke run (it rebuilds `dist/chrome`): `NULO_E2E_RETRY=0 NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/cancel-mid-prove.test.ts` on Chrome: pass (the network config retries twice unless `NULO_E2E_RETRY` says otherwise).
  - `bun run check:plans` after staging: exit 0.

## Phase 2: Send's first load reads balances through the hook (#1432; arc 2, after OA-1)

- Change the hook and `send.vue` as above.
- **Tests**
  - Component, `send.test.ts` (the first load's token read held with `holdTokenReads`):
    - `test.each` over two orders, the update landing after the balance read answers and while it is out (`holdReads` on `getTokenBalances`, whose second read, the hook's refetch, answers the updated row): an update for the selected token is what the amount shows when the load ends. Red at the base for both, on the shown value.
    - A delete of the selected row after the balance read answers: the amount is 0 when the load ends. Red at the base.
    - `:747` re-premised: with no row, a refused re-read keeps the skeleton, and the retry's read keeps it (UI impact 3).
    - Control, `test.each` over the first read refused and the dirty refetch refused (an update during the first read): the token read held, the failed card at once, before the token read resolves; then it resolves and 2 s pass (the hook's one retry): still the failed card. Green at the base for the first row; red with the leg's `false` check removed, if the check moves after `Promise.all`, or if the dirty refetch's refusal resolves `true`.
  - Hook, `useTokenBalanceSnapshot.test.ts`: two existing cases assert the result, `true` when the read lands and `false` when it is refused.
- **Validation gate**
  - `bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`: exit 0.
  - From `apps/extension`: `bun --bun vitest run src/popup/pages/send src/composables/useTokenBalanceSnapshot.test.ts --retry=0` green; the three page cases red with the base's `send.vue` and hook.
  - Smoke, from `apps/extension`, on an armed build of this source: `VITE_NULO_E2E_MIGRATION_FIXTURE=1 VITE_NULO_E2E_TOKEN_SEEDS=1 VITE_NULO_E2E_TOKEN_SEEDS_CONFIRM=1 VITE_NULO_E2E_CSP_REPORT=1 bun run build:chrome`, then `env -u EXTENSION_PATH NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 bun run test:e2e -- tests/e2e/send-fee-privacy.test.ts tests/e2e/send-keyboard.test.ts tests/e2e/send-outcome-rows.test.ts tests/e2e/send-picker-add.test.ts --retry=0`; the same with `build:firefox` and `NULO_E2E_BROWSER=firefox`: pass.
  - `bun run check:plans` after staging: exit 0.
- **Captures** (PR body; not a gate): a scratch Puppeteer spec (the repository's e2e runner and fixtures), uncommitted, under `~/.cache/nulo-backlog/exec-send-1/`, on armed Chrome builds of the base and the branch: hold the popup's token read, deliver a balance update for the selected token on the balance port, release the read, screenshot Send at 360 × 600 px. The two PNGs go under `screenshots/` and are linked by blob permalink.

No e2e scenario is added: both races are orderings inside one module that the unit and component layers drive exactly; the smoke row count stays as it is.

## Decision ledger

- D1. #1426: the read's rejection propagates, mapped to the cancel sentinel when the pre-acquire controller is aborted. Not taken: the aborted check alone, which misses a cancel that lands after it (the issue's note); a re-read on failure, a retry that hides the fault.
- D2. No shared fail-closed read helper: `getOperation` already separates "absent" from "failed" (F1); the defect is a call site that merges them, and #1431's site needs an error state and a reconnect re-read, not a wrapper. What the next lane reuses is the rule, promoted at close-out: a rejected read is never an absent row. Named sites: #1431 (lane `incoming-2`), `dapp-interaction/service.ts:596` (report only; the claim stays the arbiter).
- D3. No aborted check on the absence branch. `undefined` means missing, or unopenable (another profile's keys, a failed seal check, a schema-invalid row; F1). Missing with an aborted controller needs a cancelled row deleted, which the GC never does and the purges follow with fenced creates (F5). Unopenable at the claim but readable to the cancel needs the keys or the row to change between two reads; a lock ends the session, so the fresh create's registration refuses. No supported ordering is known: plausible but unverified, left as is; a reproducer would make the one-line aborted check before the fallback the fix (Codex R1).
- D4. #1432 through the hook, not a page copy of its dirty rule (the app store's revision counter applies the same rule to another cache) and not a hook option (#781 removed the per-consumer rule options; `added`, `mapRow`, `scopeFence` remain). The boolean beats reading `unavailable` after the await: the state is shared by every run, keeps `loaded` across a refused re-read, and so loses which call was refused (Codex R1); Opus R1 found either workable. A refused dirty refetch after a good first read now shows the card instead of the stale balance: needs a fault between two reads on one port, accepted.
- D5. The hook's one retry after a refused first-load read now runs under Send's failure card; the card stays and tokens stay empty, so nothing changes on screen (pinned by the control).
- D6. Tests: the smallest set. The lane test with the real `cancelJob` is replaced by a held-read unit case, since the lane already pins that `cancelJob` aborts the registered controller (Opus R1; Codex R1 found either proportionate).
- D7. As built: the read moved into `readQueuedRow` to keep the claim's cognitive complexity within 15. Residual (Opus fix R1): a cancel still in flight when the claim's read rejects can leave the dApp with the storage error instead of 4001, the row ending cancelled or failed by which transition commits first; nothing is broadcast and nothing is minted, the window `disambiguateClaimFailure` already has. Accepted.

## Panel verdicts

| Round | Verdict | Accepted | Rejected |
|---|---|---|---|
| Codex R1 | conditional approve | the balance leg rejects itself, so the card shows at once (D4); the control holds the token read; D3 narrowed to what `undefined` means | a Playwright capture spec (the repo's e2e is Puppeteer) |
| Opus R1 | conditional approve | `send.test.ts:747` changes: UI impact 3; #1426's failed card: UI impact 2; F1, F4, F7 corrected; I1 relabelled; I4; two unit cases replace the lane test (D6); the refetch mocks answer the updated row | none |
| Codex final (fresh) | conditional approve | UI impact 3 is outside P44-02's seven rows: OA-1, and #1432 moves to arc 2; the control covers a refused dirty refetch; I4 reworded | none |
| Codex final (resumed) | approve | none | none |
| Codex fix R1 (arc 1) | approve | `readQueuedRow`'s doc names "gone or cannot be opened"; the test helper's comment dropped | dropping a pre-existing comment in `refileToExecutingScope` (outside the diff) |
| Opus fix R1 (arc 1) | approve | the same doc point; the header names the aborted pre-acquire controller | none; its traced residual is D7 |
| Codex fix R2 (arc 1, resumed) | approve | none | none |

## Delivery

- **Arc 1** (phase 1, #1426), now: branch `worktree-exec-send-1` to `dev` with `gh pr create`, opened ready after the Codex loop converges and the gates pass, no labels at creation; add `e2e:extension-network` afterwards only if the path filter skips the network suite. Title: `fix(execution): a cancelled dapp send never restarts when its queued row cannot be read` (87 characters; `dapp` lower-case for commitlint). Body: the change, UI impact 2 with both quotes, the gates with outcomes, no added e2e scenario, `Closes #1426`. Arc 1's gate is phase 1's.
- **Arc 2** (phase 2, #1432), after OA-1, off `dev` once arc 1 merges: the same flow; title `fix(send): send's first load keeps a balance update that lands during it` (72 characters); body with UI impact 1 and 3, the captures, `Closes #1432`. The close-out is arc 2's final commits.
- Parallelism: the two arcs touch disjoint files; they are serial only because arc 2 waits on OA-1.

## Post-implementation

Execution contract: `implementations-plan/README.md` § Post-implementation standard at `51ea220b1`, with these values:

- Step 1 is absent (`code_review: off`).
- Step 2, per arc over that arc's diff (arc 1 from `51ea220b1`, arc 2 from its base), then one fresh pass over the net diff after arc 2: `~/.claude/skills/codex/scripts/run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, resumed with `resume-codex.sh`; both verbatim rules and the adversarial ask in every prompt; one Opus `general-purpose` review beside round 1; hard stop at three rounds.
- Steps 3 and 4 as written. Close-out: the Outcome block; the lesson of D2 promoted with a pruning pass (`lessons.md` is at its 8 KiB budget); a comment on any issue left out; `STATUS.md` deleted; `git mv` to `archive/exec-send-1/` in its own commit; the index line moved.
- Step 5: `git fetch -q origin dev && git cat-file -e FETCH_HEAD:implementations-plan/archive/exec-send-1/plan.md`, then `agent-worktree done exec-send-1 --merged`; the orchestrator's session notices the merge.
- Three failures on one step end the arc as `ARC_FAILED`.

## Seeds (not run; orchestrator-owned)

- `/goal` Phase 1 ✓ in implementations-plan/exec-send-1/plan.md, its gate passing in the transcript; the Codex loop converged on arc 1's diff from 51ea220b1 (a resumed pass with no new material point, quoted); a ready PR to dev closing #1426; `bun run test` and `bun run lint` exit 0. Phase 2 only once OA-1 is answered.
- `/loop 15m` Drive implementations-plan/exec-send-1 from plan.md and lessons/: the next unchecked phase, its gate, the Codex loop, delivery, the close-out; never merge.
