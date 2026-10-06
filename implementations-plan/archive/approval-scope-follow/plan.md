# Approval scope follow

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: The execute window names a scope difference and, on approval, moves the wallet to the transaction's network and account (`apps/extension/src/popup/windows/execute/scope-mismatch.ts`, `apps/extension/src/popup/windows/execute/scope-follow.ts`); the in-flight send guard covers only the wallet's own sends (`apps/extension/src/utils/in-flight-send.ts`); authwit signing runs under the authorizing fence (`apps/extension/src/wallet/services/execution/service.ts`).
- **Open items**: Home's `activity-feed-root` never renders for an empty account, and the e2e gotchas the lessons rewrite retired still need routing into the `e2e-testing` skill, both tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

A dApp's transaction runs in the scope the dApp pinned, its chain and signer account, whatever the wallet is looking at. When the two differ, the execute window shows one informational banner naming the difference and, after a successful approval and before the window closes, writes the wallet's two durable scope pointers (active network and active account) to match. One text action declines the follow. The wallet's own Send stays guarded, and the freeze that protected it no longer covers dApp sends.

## Why

After a mismatch the user confirmed, the window closed, and the wallet showed a feed scoped elsewhere, with no pending row and no balance move, which reads as a failed transaction. Following the transaction walks the user into a scope where the dApp's own queued journal records live, and the old guard froze account, profile and network switching on any in-flight send. Narrowing the freeze to wallet-origin sends was therefore a prerequisite. The same pass absorbed four follow-ups from the fenced-execution work: a popup that locked kept stale in-flight rows, the guard's header described a guard that no longer existed, authwit signing sat outside the fence, and a send whose journal record could not be created ran unregistered.

## What shipped

- **Banner and follow.** The scope resolver compares network rows, not chain ids, because the feed keys on the network row, plus the signer rules for the account axis. The follow runs after approval inside a cross-realm Web Lock, so concurrent approvals land as complete pairs. The account write goes through a guarded storage write fenced inside the facade's barrier. The pair is not atomic against other writers and there is no rollback: the next switch repairs a partial pair.
- **Limits.** The follow moves durable pointers only. A wallet view already open in a tab keeps its old scope until reloaded, and the next manual Send defaults to the followed account.
- **Guard.** `isInFlightSend` additionally requires a popup-origin record. A lock cancels dApp sends too, so the lock dialog's count is not narrowed.
- **Cache lifecycle.** A lock resets the popup's in-flight cache, and an unlock re-reads it. Every read carries a generation, so a read that started before a lock or unlock writes nothing when it lands late.
- **Authwits.** The wire handler captures the fence at admission, the dispatcher forwards it, and `aztec_createAuthWit` is a fenced kind. The arm awaits the fence check, then checks liveness synchronously as the statement before signing.
- **No unregistered sends.** A send whose journal record cannot be created is refused before any build, in the popup transfer and the dApp claim helper alike.
- **Tests.** Unit and component pins, two network e2e files (`execute-scope-account.test.ts`, `execute-scope-chain.test.ts`), and a held-lock step that observes a follow pending behind a real lock.

## Lessons

### Microtask

Moving a span into an awaited helper adds a microtask. The authwit fence gate first went into an async helper to hold the complexity budget, which reopened the gap between the liveness check and signing that the synchronous check exists to close. The fix inlined the two-statement gate and moved the unrelated message-hash resolution into the helper instead; [lessons](../../lessons.md) carries the entry.

### Empty feed

Home renders its `activity-feed-root` only when the account has activity or a token, so an e2e that switches to a fresh, unfunded account and waits for it fails at the first wait. The scope waits and card assertions moved to the History page, whose root always renders.
