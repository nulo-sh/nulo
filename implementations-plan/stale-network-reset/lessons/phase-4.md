# Phase 4: reset service

## Built

- `NetworkService.resetChainInPlace(req, hooks)`: under the network lock only to reserve the row (as `deleteNetwork` does) and, later, to rewrite it; the purge (`beforePurge` → `purgeChain` → `afterPurge`) runs under the reservation with the lock free, so another network's `getNode` never queues behind this chain's PXE drain. `rewriteForResetLocked` is idempotent, refuses a target another row holds, re-keys chainId and L1 from the build's seed and applies A6 (`applyResetEndpoint`: the user's primary survives only when it is the endpoint the popup probed, by id and URL, and was not told to switch).
- `commitResetCapture` writes the journal under the network lock only while the row is still on the captured chain, not being deleted, and its primary is still the probed one.
- `deleteNetwork` refuses while the network's reset runs (`RESET_RUNNING`); idle, it takes the journal that names it and its record entry with the row, before the purge. `addNetwork` refuses a chain a journal moves to (`CHAIN_QUARANTINED`).
- `AccountService.recreateForReset` (index, name and visibility kept; derived under the journal's verified L1, so nothing probes after the purge; idempotent) and the imported path, which commits only when the resealed key opens under `(toChainId, newAddress)` and derives `newAddress`. `inspectImportedForReset` and `resealImportedForReset` (each DEK copy zeroized).
- `exportFullBackupKeys` refuses with `ERR_RESET_PENDING` while a journal exists: the journal is then the only copy of the accounts it moves.
- `NetworkResetService` (spec, service, client; registered after the integrity coordinator). The run lock is an in-memory `Flight`; dApp requests and discoveries wait on it in `background.ts` at most 60 s. The three hold points are `network-reset-purging`, `-purged` and `-account`.
- `ImportedAccountUnusableError` is now a `WalletError` in `@nulo/extension-messaging` (`IMPORTED_ACCOUNT_UNUSABLE`, rebuilt across the port); its message is unchanged, so the existing regexes still match.
- `network-reset` joined `LOG_SOURCES` in the log viewer's filter: the source scan test fails on a service name the filter lacks, and without it the viewer hides the service's lines. It is a dev-mode filter row; the PR mentions it.

## Gotchas

- `services.get<T extends IService>()` refuses a non-`IService` shape such as `ResetRunGate`; ask for `IService & ResetRunGate`.
- Every wallet-sdk fake that boots `initWalletSdkHandler` needs a `network-reset` stub with `waitForRunEnd`; the three harnesses got one, no assertion changed.
- A discovery held for the whole 60 s cap is refused as expired, since the wallet answers a discovery within `DISCOVERY_STALE_MS` = 55 s. Pinned in `background.reset-wait.test.ts`; the run itself is far shorter.
- A resume whose row is gone is refused at admission (`ERR_NOT_RESETTABLE`), keeping the journal for the popup, rather than failing inside the run.
- Accounts on a chain sort by index, then address, so an imported `0xi…` lists before a derived `0xn…` at the same index; tests sort before comparing.
- `afterPurge` runs after `purgeChain` deleted the chain's accounts, so anything it needs from them is read in `beforePurge`. Mutation testing caught the first version reading the stored accounts after the purge, which dropped an unmovable imported account's transactions from the awaited purge (they went only through the best-effort `onAccountDeleted` listener).
- `validateJournal`'s "row on the journal's source chain" line was redundant: `resetChainInPlace` checks the same thing under the lock, before any purge or rewrite, and no test could tell them apart. Removed; the doc comment names where the check lives.
- `freshView` crossed the cognitive-complexity budget (24 > 15); `splitAccounts` and `conflictsOf` came out as module functions, no directive added.

## Composition test

`network-reset/service.composition.test.ts` runs the reset against the real Network, Account, Token, Fpc, AuthRegistry, Transaction, OperationJournal, DappSession and IncomingTransfer services on `FakeBrowserApi`, with every chain-scoped store seeded on both chains. It proves the old chain's rows are gone from every store, the Local chain's rows are byte-identical, the accounts are re-created, and, with the run held mid-purge, that the Local network can be read, renamed and its dApp session found. The PXE clear is a call recorder and derivation is mocked (bb-free, per `COMPOSITION-TESTS.md`).

## Proof that each guard is load-bearing

- 35 mutants (each guard or ordering line changed alone, its test file run). First pass: 9 survived. Each got a test (capture's chain and deletion checks, the Mainnet journal on a custom Mainnet row, finish order by the journal's first removal, the capture's account count and Mainnet-L1 account, single flight across networks, the unmovable account's transactions, done entries not re-created) or, for the redundant on-chain line, removal. Second pass, the 8 remaining survivors plus 3 new mutants on the moved and new lines: all 11 killed.

## Gate

At `5785b342`, then `f4d8912f` for the smoke runs, retry 0:

- `bun run lint` exit 0 (27 warnings, all pre-existing); `bun run test:ci-gating` exit 0 (556 pass); `bun run audit:vue` exit 0 (770 files, 12284 tests).
- Armed builds: `build:chrome` and `build:firefox` exit 0.
- Smoke, Chrome: 52 files passed, 4 skipped; 228 tests passed, 12 skipped; 1560 s; exit 0.
- Smoke, Firefox: 54 files passed, 2 skipped; 227 tests passed, 13 skipped; 2168 s; exit 0.

At `908455f4`, retry 0, proverless (`NULO_E2E_PROVERLESS=1 NULO_E2E_RETRY=0 bun run e2e:agent`):

- `bun run audit:vue` exit 0 (770 files passed, 3 skipped; 12293 tests); `bun run test:ci-gating` exit 0 (556 pass, 0 fail).
- Network, Chrome: 116 files passed, 5 skipped; 215 tests passed, 7 skipped; 6391 s; exit 0.
- Network, Firefox: 116 files passed, 5 skipped; 213 tests passed, 9 skipped; 7575 s; exit 0.
- The skips are opt-in or browser-specific (store captures, send chaos, the delegated-authwit and warm-up probes, the background-restart files).

The smoke runs stand for `908455f4`: its change is the dApp-session delete on a chain purge, which no smoke test reaches.

## The network gate's one failure (D48)

The first proverless Chrome network run, on `f4d8912f`, failed one test at retry 0: `connect-unserved-chain.test.ts`, "a deleted network: calls get the typed 4901, and the next connect drops the row and shows the notice", which expects a deleted network's session row to survive `deleteNetwork`. Phase 3 had put the dApp-session delete on the chain purge's subscriber, so every purge, `deleteNetwork`'s included, deleted the chain's sessions. The fix (`908455f4`) moves the delete into the reset's own `afterPurge` step (`dappSessions.purgeForChain`, after the transaction purge) and removes the subscriber: a deleted network keeps its sessions until the next connect drops them, and only a reset deletes them, since a kept session would auto-approve with the accounts the reset creates. A composition test pins both halves; 5 mutants, all killed. Recorded as D48; D28 narrowed to the reset.

Lesson: a chain purge is shared by three callers (delete, reset, profile deletion); a subscriber on it applies to all three, so a reset-only consequence belongs in the reset's hook, not on the purge.

## Codex fix loop, arc 1 (gpt-6.1-sol, high)

Round 1, fresh session over `1ba770cf..5785b342`: 4 material findings.

1. A full backup could omit accounts while a reset ran: accepted. The password path re-checks the journal after its reads, and the passkey path's two slices refuse while a journal exists.
2. A capture could write a journal after the profile's deletion had cleared it: accepted. The journal write checks the run fence inside the record lock, synchronously, because deletion holds the profile lock while it waits on the record lock.
3. Transaction polling reads a quarantined chain: rejected. It reads chain truth for rows the reset deletes; a guard there is a new guard surface, which the plan sends to the owner.
4. A network added on the target chain during capture: accepted. `commitResetCapture` refuses under the network lock when another row holds `toChainId`.
5. Two Source-filter rows in the dev log viewer: on the owner's arc 2 sign-off list.
6. The purge's doc comment said best-effort: fixed.

Fixes in `8eb26c66`; 6 mutants, all killed.

Round 2, resumed: 2 material findings, both accepted.

1. The passkey slices had no check after their reads: both re-check the journal after reading.
2. A runtime verdict read before a reset finished could quarantine the healed chain again: `mergeEntry` compares the classified digest with the current one under the record lock; an obsolete verdict refuses the operation and writes nothing, never a profile block.

Fixes in `712809f4`; 5 mutants, all killed.

Round 3, resumed: 1 material finding, accepted. An account load that started before a reset finished derived a replaced row; the runtime classifier then read the clean replacement and returned false, which blocked the healed profile. A chain that classifies clean now refuses the operation and writes nothing; a mixed or orphaned chain is still unclassifiable and still blocks. Fix in `f4d8912f`; its mutant killed.

Round 4, resumed, verifying round 3 (the repo rule stops at three rounds while a finding stays material; this one was fixed locally, so the fourth pass only verifies it): "VERDICT: no new material findings". The loop converged.

Round 5, resumed, verifying `908455f4`: "Verified by code trace; confidence: high. … Dapp-session remains phase 0. Its added dependency creates no cycle … VERDICT: no new material findings". The loop holds at `908455f4`.

The final cross-arc pass (fresh, over all three arcs) found one more here: a capture whose view probed nothing (the seed's endpoint was primary) skipped the endpoint check at commit, so a user primary set from another popup during the capture was replaced by the seed's at the rewrite, unannounced. The commit now requires the seed's endpoint, or none, still primary in that case; an address change, which keeps the row's chain, is not checked. Two comments that restated their functions are gone.
