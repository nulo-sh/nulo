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
