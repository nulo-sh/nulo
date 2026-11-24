# Arc 1: Phases 1 and 2, and the arc's review loop

## Phase 1, a discovery never reuses a held id

- The first draft of the live-session test passed on base, because it asserted forwarding. Upstream forwards a key exchange either way, so it now awaits upstream's `handleKeyExchangeRequest` promise and asserts the session's tab: 9 on base, 7 with the check.
- Closing a verify window in a transport test takes captured `onRemoved` listeners (`closableWindows`). While the window's slot is held, `VerifyAdmissionGate`'s live-window dedupe refuses a second discovery by coincidence, which hides the case.
- Moving four lines in `background.ts` broke a line-number citation in the profile-chaos model (`tests/e2e/helpers/profile-chaos/model.ts`). Only the full unit suite sees this, not Phase 1's directory gate.

## Phase 2, three log lines carry categories

- `@aztec-labs/stdlib`'s `SimulationError` sets no `name`, so `errorName` reads "Error" for a contract revert from the fast path. The class name is matched at the logging site (`failureName`), since the production minifier mangles class names. A revert from the PXE arrives as `ContractAssertionError`, which carries its own name.
- I3 as first written was wrong: an unclassified failure reaches a dApp only as the constant envelope (`error-envelope.ts`), never as its text. The text stays on the failed task, and Developer Mode's request capture records it for a dApp request. D4 rests on the logging policy and stands.

## Review loop (Codex `gpt-6.1-sol`, high, read-only; Opus 5.5 beside round 1)

- **Codex r1**: approve with fixes. Accepted: name a `SimulationError` in the failure line, with a composition-test row; the admission comment states the synchronous invariant (nothing awaits between the checks and upstream recording a discovery) instead of listing the checks; the claim-helper comment keeps only the legacy-profile wildcard.
- **Opus r1**: accepted the citation (already fixed), the I3 and comment correction, a test for a discovery still pending on a locked wallet (fails on base), the helper renamed `heldDiscoveryId` with the real reason in its comment, and three stale comments (`content-admission.ts`, `content-message-relay.ts`, `discovery-queue.ts`) that still cited a duplicate discovery reaching upstream. Two points were left unchanged and routed to the owner with their reasons.
- **Codex r2** (resumed with the fix diff): no new points; **approve**.

## Network e2e, arcs 1 and 2

- arc 1 e2e list: the plan's grep names 36 files. Thirteen are left out: they match "discovery" only in another sense (FPC, note, authwit or balance discovery), or "reconnect" only as a step around what they test, or they are prover-ON canaries or the opt-in update replay: `backup-restore-sw-restart`, `fee-methods`, `fee-sponsor-funding`, `frozen-account-canary`, `incoming-arrival`, `passkey-execution-canary`, `profile-reimport-matrix`, `receive-unregistered`, `same-token-concurrent-sends`, `stale-anchor-recovery`, `tx-sendTx-delegated-authwit`, `tx-sendTx-fields`, `update-in-place`. The run covers the 23 that drive the dApp connect, reconnect, lock and restart paths, in one proverless run per browser at retry 0: `connect-check-window`, `connect-dapp`, `connect-deny`, `connect-every-site`, `connect-locked-queue`, `connect-locked-queue-sw-restart`, `connect-unserved-chain`, `connect-verify-mismatch`, `cold-wake-discovery`, `lock-restart-reconnect`, `restart-closes-check-window`, `verify-hold`, `session-explicitDisconnect`, `session-profileSwitch`, `session-reconnect`, `session-reconnect-flood`, `session-tabClose`, `session-tabNavigate`, `window-placement`, `firefox-background-restart`, `concurrent-sendtx`, `account-switch-isolation`, `inflight-call-background-death`.
- arc 1 gate green at `71ffb6fcb`: the pre-PR gate and `test:all` pass. Network e2e at retry 0, proverless, on the 23 specs above: Chrome 22 files and 35 tests passed, `firefox-background-restart` skipped by design, 832 s; Firefox 22 files and 35 tests passed, `restart-closes-check-window` skipped by design, 1,200 s.
- arc 2 network e2e at retry 0, proverless, on the 23 specs listed above: Chrome 22 files and 35 tests passed, `firefox-background-restart` skipped by design, 879 s (on a local head whose code differs from the pushed one in comments only); Firefox 22 files and 35 tests passed, `restart-closes-check-window` skipped by design, 1,173 s (at `1931a9027`).
