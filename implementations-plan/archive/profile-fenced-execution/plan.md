# Profile-fenced execution

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: the session fence on every send, in `apps/extension/src/wallet/services/execution/` (see its `README.md`), the auto-lock deferral in `apps/extension/src/wallet/services/profile/session-manager.ts`, and the lock confirmation in `apps/extension/src/components/Header.vue`.
- **Open items**: Storybook misrenders the extension's components, because the `unplugin-vue-components` directory resolves from the Vite root and the `chrome` stub is skipped under Chromium; it was closed by a later plan before `follow-ups.md` was retired. None is open.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

A transaction runs under the session that approved it, or it stops. The existing authorization fence (profile id plus deletion epoch) gains a session serial, a monotonic id carried by every unlocked or restored session, so a fence names this session and not just this profile: an A to B to A switch, or A to lock to A, both fail it.

- The fence is captured atomically at both dApp authorization moments (the approval popup and the silent self-paid path) and threaded, non-optionally, along the send path.
- Each site that needs a profile resolves it from the fence and asserts it, once more after proving, and finally synchronously in the same tick as the `node.sendTx` invocation, the one place a session end cannot interleave.
- A mismatch throws a typed `SessionEndedError`; the record fails with kind `session_ended` under its original profile and nothing is submitted. The dApp sees a 4900 `SESSION_ENDED` envelope.
- Ending the session cancels in-flight work: locking cancels what is pending, simulating or proving, after a confirmation at the lock button, and a sweep cancels the ended session's registered sends by serial.
- The inactivity auto-lock defers while approved sends run, within a per-session budget of the shorter of the session TTL and ten minutes.

## Why

Every send is authorized under one session and then proves for seconds to minutes, yet the code re-read "which profile is active" at seven points afterwards: mutex key, account contract, two estimate-reuse checks, the journal stamp and more. A session change in between silently continued the operation under the new one. A prerequisite for [approval-scope-follow](../approval-scope-follow/plan.md), which narrows the account-scoped send freeze on its own terms.

Continuing a transaction across a lock needs two key contexts alive at once, a security-model change. A warning at the lock button replaces blocking, so the lock-screen profile selector needs no dialog, since an unlock of another profile is always preceded by a lock.

## What shipped

- `SessionEndedError`, the `session_ended` job-error kind, the serial on the fence, and `assertFence` (awaited, under the facade lock) and `isFenceLive` (synchronous, lock-free) on the profile service.
- One serial-aware in-flight registry in the execution lane, the only writer of the controller map; a registration under a dead serial is reported to the caller, who fails the record.
- `expireOrDefer` on both expiry paths, with every write of the session row going through one artifact-locked writer that compares the expected deadline and config revision inside the lock.
- A lock confirmation when approved sends are running, with an optional pre-title on `ConfirmPopup` so it does not read "Irreversible", and a failed-card subtitle for `session_ended`.
- Composition tests per read site and per race, plus network and smoke e2e.
- Documented limits: the broadcast invocation is the point of no return; consent is best-effort within a short window; the budget is per session; a send without a journal record is not swept; other lock paths (reset, update, worker restart) ask nothing, though the sweep and checkpoints still hold. The Send freeze and the lock-screen selector are untouched.
