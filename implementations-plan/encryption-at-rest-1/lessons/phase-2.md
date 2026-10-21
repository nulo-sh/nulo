# Arc A2 (P4–P5): the journal and the transaction history

## Where the code differs from the plan, and why

- **The e2e readers use a build-flagged seam, not RPC.** A1 read its two roots through `callService`. The journal and transaction readers cannot: `waitForFunction` closures poll from playground and popup pages, the readers read while locked (a record failed by the lock), read every profile's rows, need a transaction row's keyed storage key, and `failed-send-check` opens values it captured mid-write. So `VITE_NULO_E2E_SEALED_READ=1` builds in `src/e2e/sealed-read.ts` (`nulo:e2e:sealed-read`): extension-origin senders only, sealed `STORES` roots only, read-only, answered with the rows the worker's held keys open. Only `agent.sh` arms it. Smoke and the update candidate do not, and `_build-extension.yml` greps release bundles for the key, so the update replay reads history through RPC (`getTransaction`, `getOperation`).
- **`sealedRoot` options live in `STORES`**, beside the `sealed` flag A1 put there: one declaration says a root is keyed (`txs`) and keeps ownerless legacy rows plaintext.
- **No new plaintext transaction row exists.** Every new `Tx` carries the execution fence's profile. A write naming no profile only rewrites a stored ownerless row in place, checked again at commit; the store refuses it for a new row, or one sealed or adopted meanwhile.
- **RPC reads answer the active profile.** `getTransactions` and `getTransaction` read the active profile's rows and the ownerless ones; locked, none. Internal callers name the profile (`transactionsOf`), since an unnamed read would answer with whichever keys the worker holds.
- **Unknown ownership is any chain's unreadable account rows**, stricter than the plan's "of that chain". An unreadable row whose id does not parse names no chain, and the stricter check only delays an adoption: the row stays plaintext and readable, as before this build.
- **Adoption requires the profile to hold the row's account on the row's chain**, and then sole ownership under the transaction lock. A row marked `ambiguous` is never adopted.
- **`getPendingForAccount` stays account-wide.** It feeds the fee-estimate reuse check, where another profile's pending send on the same account is the same signal: the notes may be spent.
- **The post-start replay order moved**: resume, reaper, `reapUnlocked` subscription, `SendCheck` start, then the replay of held keys, so a startup unlock's keys reach every subscriber (`runtime.post-start.pins.test.ts`).
- **`--additive` is a no-op until the freeze.** `PINNED_STAMPS` is empty while #938 is open, so `bun run baseline:storage -- --additive "<why>"` rewrites stamp 0 exactly as the bare command does and prints no pin. A2 adds two sealed goldens (`journal.sealed`, `txs.sealed`). Once #938 lands, the merge re-stamps with the mark and adds the pin, as A1's does.
- **`type-roles` re-attested** the auth-registry digest (`scripts/type-roles/identifier-sites.expected.json`): the registry passes the profile to the transaction lookups, which moved the digested lines.

## Attempts

- **Unit suite after wiring the journal store.** Minimal fixtures had no row keys, so every journal write refused (the store refuses a keyless write by design). The fakes gained `profileKeysStub` / `rowKeysForEveryProfile`; tests that sniffed plaintext journal bytes read through `storedText` / `openStoredText`, and the coordinator's refusal test arms on order (the first journal write after `proveTx`) instead of on content.
- **`network-reset/service.composition.test.ts` red after the transaction change.** A file trace (vitest silences a passing test's console) against an `origin/dev` checkout showed an incoming scan still in flight when the "after" snapshot was taken; the test seeded a cursor the first scan advanced. The seeded cursor now matches what a scan converges to and both snapshots wait for the scans to settle. The service was not at fault.
- **The stored-shape generator** reordered unrelated golden keys when asked to add the two sealed goldens; they were inserted by hand and the generator's rerun left the file unchanged.
- **Complexity:** the two journal readers whose signatures gained the message argument lost their anchors; with the parse gone (the seam answers parsed rows) both fell under budget, and the manifest dropped three acceptances.

## Concurrency inventory (D9)

| Root | Conversion and adoption run under | Delete vs open |
|---|---|---|
| `nulo:journal` | the journal's `transitionLock`, one row per section | the conversion commits only while the stored text is unchanged and the profile still holds the same keys, so a row deleted meanwhile is not written back |
| `nulo:core:txs` | the transaction service's `Lock`, one row per section; adoption re-checks sole ownership inside it | the same compare-and-commit; an arming captures the deletion epoch and inserts no watch once `beginDeletion` passed it |

## Measured

(filled in at the gate)
