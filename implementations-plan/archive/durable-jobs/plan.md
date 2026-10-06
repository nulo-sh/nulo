# Durable jobs

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the durable operation journal and job state machine behind every transaction: `apps/extension/src/wallet/services/operation-journal/` (service, reaper, garbage collector), `packages/wallet-core/src/jobs/` (stages, FSM, errors), and the journal-driven activity cards in `apps/extension/src/components/composite/activity/`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Treat "the wallet is alive" as something that may stop being true. Every submission becomes a job with an id whose state lives in `chrome.storage.local`, and the popup only observes it.

- **Stages**: queued, pending, simulating, proving, submitting, then succeeded, failed or cancelled. Cancel is legal only before submit; a cancel that arrives after is dropped, so the journal and the chain never disagree. No awaiting-user stage (the approval popup still blocks, only the post-approval flow is durable) and no cancelling stage (the card says cancelled at once and a running proof's result is discarded).
- **Recovery**: a reaper on a `chrome.alarms` tick plus a boot sweep fails stuck jobs with a distinct kind for a proof that never returned and for a job found stale on resume. A restart during submitting simply fails the job, because a proof is anchored to a block header and goes stale.
- **Concurrency**: per-(profile, chain) proving locks and a profile-level barrier, instead of scoping the global registries per chain.
- **Cancel**: a `cancelJob` call with abort checkpoints, and a per-method offscreen timeout so proving gets a generous limit.
- **Follow-on**: token import became a journal operation with no prove step, and terminal records are capped per profile and account by the collector.

### Journal record shape

Six decisions are carried in the record now so later features need no rewrite:

- Each record is tagged with origin and profile id (and a coarse kind) at creation, for future fairness and rate limits.
- Terminal records are kept, with a terminal timestamp set, never deleted on completion; tombstones and idempotency depend on it.
- Observation is a subscribe-with-snapshot pattern, so many watchers can follow one job.
- Progress is an extensible tagged union keyed by stage.
- The error keeps its category and the raw boundary text; a real error is never collapsed into "failed".
- An attempts counter exists even though nothing retries.

## Why

The popup's 60-second wait and the offscreen document's 90-second ceiling both fire before a long proof finishes, so a send could be reported as failed while it was still running and often succeeded. A suspended service worker also loses an in-memory proof. A journal on disk makes the displayed state the true state and lets the popup close and reopen mid-proof. The heartbeat idea was dropped because proving blocks the thread, so a periodic beat cannot fire, and the stale threshold is long instead.

## What shipped

- The FSM, the journal schema and its validated load (a malformed row is logged and dropped), the reaper, and the terminal-record collector.
- The recent-activity area renders one card per in-flight job, from the journal as primary source.
- Follow-up fixes folded in: a crash when a dApp send was approved before a fee method was chosen was fixed by popup draft types and an asserting validator, shared in `packages/wallet-bridge`; terminal cards for cancelled, interrupted and failed jobs, built on a pure display mapping in `apps/extension/src/utils/journal-state.ts`; a Cancel control on in-flight cards; retry was removed as arbitrary, the transfer amount is persisted on the record, and terminal cards stay in the activity list instead of aging out.
- Left out: reattaching a popup to an earlier dApp request, an IndexedDB backup of job records, and resuming a submit after a restart.
