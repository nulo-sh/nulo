---
plan: fee-fresh-read-1
tier: light
status: building
issues: "#1914"
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
budget: recon inline (greps and one reproducer, no Explore agent); one Codex gpt-6.1-sol high read-only pass over plan and net diff after the build (lane brief, bounded work)
base: origin/dev at f7b78cc5e
trunk: dev
post_implementation_hardening: not scheduled
---

# fee-fresh-read-1: Mainnet app windows read both Fee Juice balances fresh, as Send does

Page 199, signed by the owner on 2026-11-20 ("p199 signed."), builds P199-03 = B: "Read fresh on every Mainnet app window, as Send does: the choice always rests on a current balance, and each Mainnet window waits for a fresh read of both balances before its fee settles (Send's wait); each Revoke chunk's card reads its own. A one-line change with a test, its own PR after #1915." Paths are under `apps/extension/src/` unless they name another root.

## The issue, checked (#1914)

**Holds as traced** (plausible but unverified in the issue; the code path is confirmed, the default it reaches is pinned by the card test below at the base). An app window's card (`FeeSettingsCard` without `originPrivacy`: the execute window, Change, each Revoke chunk) builds `useAppFeeSelection`, whose `forceRefresh` is `Boolean(c.lockedMethod())` (`composables/useFeeSelection.ts:359`). Unlocked, the snapshot's `store.ensure` reads unforced (`composables/useFeeSnapshot.ts:125`), the store passes `forceRefresh` through (`stores/balances.store.ts:522`) and the reader serves its TTL entry, up to `GAS_BALANCE_TTL_MS` old (`wallet/services/execution/gas-balance-reader.ts:74-79`). Nothing invalidates it for a credit made outside the wallet. With a cached private `"0"` and public Fee Juice able to pay, `appDefault` (`useFeeSelection.ts:189-204`) falls to Public Fee Juice where the network offers no sponsor (#1915). Send reads fresh on every mount for this reason (`useFeeSelection.ts:155-158`).

**Found while checking: forced mount reads outrank each other** (demonstrated, reproducer below). Each Revoke chunk mounts its own card on the same balance key. Once those mounts read forced, the store numbers forced runs and commits only the newest (`isGasRunStale`, `balances.store.ts:479-482`); an outranked run returns without committing, and its card's `ensure` settles on whatever `gas.verified` holds then.
- Initial conditions: a Mainnet account with more than 28 authwits selected (`MAX_REVOKES_PER_TX`), so Revoke shows two chunks; the popup's store has no entry for the key yet.
- Events: chunk 1's card starts forced run F1 (seq 1, RPC R1); chunk 2's card starts F2 (seq 2), which waits R1 out; R1 lands; F1 is outranked and commits nothing; F2 starts R2 and commits.
- Invariant broken: a card commits only a read its own mount asked for (`commitFromEntry` copies `gas.verified` without reading `entry.stale`, as the `CARD_CAPS` comment in `useFeeSnapshot.ts` already warns).
- Consequence: chunk 1 commits `verified` undefined with the slice still `fetching`, so not degraded: no retry is armed, no `retryVersion` moves, and the card stays on no default (or, with an earlier entry in the document, on its stale figure) while chunk 2 opens on Private Fee Juice. A scratch test against the real store at the base printed "first card sees undefined" with two `getGasBalances` calls.

**Change pop-up.** One card, the same app branch (`fallsBack`, no lock): it reads fresh on Mainnet with this change and needs nothing else. **Execute window.** One card per `send_tx` operation (`OperationCard.vue:455`); a batch with several shares the Revoke case, fixed by the same store change.

Closed limits searched (`known-limit fee juice cache fresh`): #1889, the five-minute cache on every network; this plan closes it for networks with no sponsor, and the orchestrator updates it after landing.

## Decisions

| # | Decision | Rejected | Why |
|---|---|---|---|
| D1 | `forceRefresh: () => Boolean(c.lockedMethod()) \|\| sponsorless(c)`, with `sponsorless(c)` (chain id known and `!offersSponsoredFpc`) also gating `appDefault`'s public step | reading `chainId` inline in both places | one predicate: the read is fresh exactly where the default can fall to Public Fee Juice on a private balance read as empty, and the two cannot drift; an unknown chain id stays "offers a sponsor", as in `appDefault` today |
| D2 | `fetchGas`: a forced run, after its own run, waits out every newer gas run registered for its key and epoch (`legFlights`) before it returns, so an outranked forced `ensure` settles on the newest run's commit | each card sharing one forced read (a forced fetch joining a forced flight in progress); a watcher in the card that waits for a later commit; leaving chunks 2..N on the cache | the owner's words: each chunk reads its own; the cause is in the store, where outranking lives; a promise that awaits a run already in flight adds no state, timer or lifecycle; the trigger-recency invariant stays as pinned |
| D3 | A failed or slow fresh read: unchanged, Send's handling. The commit waits for both legs (bounded by `INIT_FETCH_TIMEOUT_MS`); a failed gas read commits `verified` undefined, the store arms its backoff retry (forced, `balances.store.ts:648-655`), and the recovery re-derives an unpicked default (`reconcileSelection`). Until then `appDefault` picks nothing on a network with no sponsor, so Confirm has no settings | a fallback to the cached figure | Send holds on an unread balance for the same reason; a cached zero is what this change exists to avoid |
| D4 | No new loading state: the app windows keep their own loading look while the snapshot reads (`readPending` is Send-only, `FeeSettingsCard.vue:243`) | | the brief: nothing visible changes but the wait |

## Assumptions

- **Ask 1.** The pre-fill of a saved pick during the read stays as built: it shows the remembered row before the commit, but `isInitComplete` keeps it out of the settings, so Confirm waits for the fresh read. Working assumption: that is "the card's existing wait".
- **Ask 2.** Sponsor networks with a lock keep reading fresh (today's rule); sponsor networks without one keep the cache.

## UI impact

None but the wait the pick names: on a network with no sponsor an app window's fee settles after a fresh read of both balances instead of the reader's cached one. No copy, layout, testid or stored key changes.

## Security and adversarial considerations

- A dApp chooses the network and may lock the method; neither lets it skip the fresh read on a network with no sponsor, and the lock's own fresh read is unchanged.
- No message, permission, storage, log line or dependency change. The extra reads are the account's own balance reads, one per card mount, as Send's.

## Phase 1: tests, build, gates

1. Tests first, red at the base where they pin new behaviour:
   - `composables/useFeeSelection.test.ts`: `forceRefresh` by lock and network (no sponsor, unlocked: true; sponsor, unlocked: false; locked on both: true).
   - `popup/components/modules/send/FeeSettingsCard.test.ts`: on Mainnet the app card reads forced and a private balance credited after the cached `"0"` opens it on Private Fee Juice (#1914's path); the Testnet control keeps the cached read and its sponsor; two app cards mounted together on Mainnet (Revoke's chunks) each read forced and both open on Private Fee Juice. The existing "a null origin does not" assertion moves to a sponsor network.
   - `stores/balances.store.test.ts`: an outranked forced `ensure` settles only after the run that outranked it commits, with the newest figure; control: a lone forced `ensure` settles on its own run.
2. Build D1 and D2; the store's invariant list gains D2's line.
3. Gates: `bun run lint`; `bun run typecheck:all`; `bun run test`; `bun run test:all`; `bun run check:plans` after staging.
4. E2E, no new scenario (Mainnet is out of reach; the layers above prove it). The sandbox offers a sponsor, so unlocked windows there keep the cache; the specs reach the lock's forced read, the Revoke and Change cards and Send's forced read through the store: one `e2e:agent` run of `network/authwit-lifecycle`, `network/tx-sendTx-selfPay` and `network/fee-methods`, and smoke `send-fee-privacy`, on Chrome. No window handling changes, so no Firefox run.

## Post-implementation

Contract: this plan plus [`implementations-plan/README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `f7b78cc5e`. Step 1 absent (`code_review: off`). Step 2, bounded: ONE Codex pass (`run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`) over this plan and `git diff origin/dev...HEAD`, both verbatim rules and the brief's adversarial list (a fee settling on the cached value first; a failed or slow read leaving Confirm on a stale default; two reads racing a payer switch; a sponsor network that starts reading fresh; Revoke chunks sharing one read); then targeted verification of material fixes. Approval boundary (stop): a stored key, new copy, a new loading state, or a fresh read on a sponsor network without a lock.

## Delivery

One PR against `dev`, opened ready, never merged by the lane: `fix(fees): mainnet app windows read fee juice balances fresh, as send does`. Body: the owner's P199-03 words, the store fix and why, the rule C match line, the gates, the Codex verdict, `Closes #1914`. Close-out in the same PR.

## Seeds

- `/goal`: on a network with no sponsor every app window's fee card, each Revoke chunk's included, settles on a fresh read of both balances; sponsor networks keep the cache; one PR, checks green.
- `/loop`: watch the PR's required checks; on red, fix at the cause and rerun the affected specs.
