# Arc A2 (P4–P5): the journal and the transaction history

## Where the code differs from the plan, and why

- **The e2e readers use a build-flagged seam, not RPC.** A1 read its two roots through `callService`. The journal and transaction readers cannot: `waitForFunction` closures poll from playground and popup pages, the readers read while locked (a record failed by the lock), read every profile's rows, need a transaction row's keyed storage key, and `failed-send-check` opens values it captured mid-write. So `VITE_NULO_E2E_SEALED_READ=1` builds in `src/e2e/sealed-read.ts` (`nulo:e2e:sealed-read`): extension-origin senders only, sealed `STORES` roots only, read-only, answered with the rows the worker's held keys open. Only `agent.sh` arms it. Smoke and the update candidate do not, and `_build-extension.yml` greps release bundles for the key, so the update replay reads history through RPC (`getTransaction`, `getOperation`).
- **`sealedRoot` options live in `STORES`**, beside the `sealed` flag A1 put there: one declaration says a root is keyed (`txs`) and keeps ownerless legacy rows plaintext.
- **No new plaintext transaction row exists.** Every new `Tx` carries the execution fence's profile. A write naming no profile only rewrites a stored ownerless row in place, checked again at commit; the store refuses it for a new row, or one sealed or adopted meanwhile.
- **RPC reads answer the active profile.** `getTransactions` and `getTransaction` read the active profile's rows and the ownerless ones; locked, none. Internal callers name the profile (`transactionsOf`), since an unnamed read would answer with whichever keys the worker holds.
- **Unknown ownership is any chain's unreadable account rows**, stricter than the plan's "of that chain". An unreadable row whose id does not parse names no chain. The stricter check delays an adoption, and it also keeps the deletion, reset and account purges from removing or marking an ownerless row, so a deleted profile's ownerless legacy rows can stay plaintext (the plan's known limit on ownerless rows).
- **Adoption requires the profile to hold the row's account on the row's chain**, and then sole ownership under the transaction lock. A row marked `ambiguous` is never adopted.
- **`getPendingForAccount` stays account-wide.** It feeds the fee-estimate reuse check, where another profile's pending send on the same account is the same signal: the notes may be spent.
- **The post-start replay order moved**: resume, reaper, `reapUnlocked` subscription, `SendCheck` start, then the replay of held keys, so a startup unlock's keys reach every subscriber (`runtime.post-start.pins.test.ts`).
- **The re-stamp is stamp 1.** #938 froze stamp 0 while this arc was in review, so the `dev` merge kept stamp 0 and its goldens as #938 pinned them and ran `bun run baseline:storage -- --additive "<why>"`: stamp 1 marks `journal` and `txs` additive (a plaintext row still reads through the dual read and is sealed at its profile's next unlock), introduces the `journal.sealed` and `txs.sealed` goldens, and its pin is `PINNED_STAMPS[1]`. The generator rewrites unrelated goldens' layout when it seals new ones (it reorders integer keys), so the two goldens were sealed by it and inserted by hand; its rerun reports the shapes unchanged.
- **`type-roles` re-attested** the auth-registry digest (`scripts/type-roles/identifier-sites.expected.json`): the registry passes the profile to the transaction lookups, which moved the digested lines.

## Attempts

- **Unit suite after wiring the journal store.** Minimal fixtures had no row keys, so every journal write refused (the store refuses a keyless write by design). The fakes gained `profileKeysStub` / `rowKeysForEveryProfile`; tests that sniffed plaintext journal bytes read through `storedText` / `openStoredText`, and the coordinator's refusal test arms on order (the first journal write after `proveTx`) instead of on content.
- **`network-reset/service.composition.test.ts` red after the transaction change.** A file trace (vitest silences a passing test's console) against an `origin/dev` checkout showed an incoming scan still in flight when the "after" snapshot was taken; the test seeded a cursor the first scan advanced. The seeded cursor now matches what a scan converges to and both snapshots wait for the scans to settle. The service was not at fault.
- **The stored-shape generator** reordered unrelated golden keys when asked to add the two sealed goldens; they were inserted by hand and the generator's rerun left the file unchanged.
- **Complexity:** the two journal readers whose signatures gained the message argument lost their anchors; with the parse gone (the seam answers parsed rows) both fell under budget, and the manifest dropped three acceptances.

## Review

- **Codex round 1 (gpt-6.1-sol, high): CHANGES, one medium.** An ownerless row planted offline at a hash the profile already held sealed replaced the sealed row at adoption. Fixed (`352f3925`): adoption keeps an existing keyed row and removes only the plaintext, as the conversion does.
- **Opus, beside round 1: APPROVE** at `352f3925` (the same medium, found independently), one low and a doc nit. Low: the adoption armed its row without the deletion-epoch check the final arming makes, so a deletion that began during the pass could leave a watch polling for the deleted profile (needs two concurrent deletions and an unreadable account row). Fixed (`fc153ec5`); the nit is fixed above.
- **Codex round 2: CHANGES, one medium.** A keyed write, conversion or adoption dispatched the sealed write and the plaintext removal together, so a refused write with a removal that succeeded left neither copy (`unlimitedStorage` rules out quota; disk-full or an I/O error remains). Fixed (`23d2eae1`): the removal waits for the write.
- **Codex round 3: APPROVE**, no new material finding.

## Concurrency inventory (D9)

| Root | Conversion and adoption run under | Delete vs open |
|---|---|---|
| `nulo:journal` | the journal's `transitionLock`, one row per section | the conversion commits only while the stored text is unchanged and the profile still holds the same keys, so a row deleted meanwhile is not written back |
| `nulo:core:txs` | the transaction service's `Lock`, one row per section; adoption re-checks sole ownership inside it | the same compare-and-commit; an arming captures the deletion epoch and inserts no watch once `beginDeletion` passed it |

## Measured

All at retry 0, on one host shared with other agents; load1 is the 1-minute load average on 188 cores at a run's start and end.

- **Activity-list load gate** (`sealed-storage.test.ts`, 500 seeded journal records, the activity page's `getOperations({ profileId, isTerminal: true })`, median of 5 from a fresh popup): Chrome 88 ms plaintext, 74 ms sealed; Firefox 590 ms plaintext, 587 ms sealed. The gate (+50 ms) holds on both. The same run's contacts list (A1's root, 2 000 rows): Chrome 95 → 114 ms, Firefox 318 → 487 ms, inside OA-5's accepted Firefox cost. Sealing 2 500 rows after unlock: Chrome 7.1 s, Firefox 34.7 s.
- **`sealed-storage.test.ts`** with the journal rows: Chrome 32 s, Firefox 90 s (A1: 25–33 s and 41–60 s). Chrome stays inside A1's range; Firefox ran at load1 near 170 beside the Chrome smoke and network suites, so its 30 s over A1's range is not separable from host load.
- **Full smoke**: Chrome 61 files passed, 8 skipped, 2 206 s (load1 288 → 163); Firefox 65 passed, 4 skipped, 3 390 s (load1 267 → 168). Both ran in parallel, on the build before the three review fixes.
- **Unit**: `typecheck:all` ∥ `test` ∥ `lint` green; `test:all` green (extension 906 files, 14 987 tests); `test:ci-gating` 686 pass (load1 134 → 165).
