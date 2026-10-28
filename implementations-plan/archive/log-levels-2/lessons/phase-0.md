# Phase 0: planning consults

## Plan audit, Codex round 1 (gpt-6.1-sol, high, fresh session)

- Verdict: reject, on one gate defect; the design approved (D1 to D3, the session as the supersede signal, warn→error).
- (1) Demonstrated: the stale control already passes on base, since `refresh` propagates the rejection, so "each new case fails on base" could never be met. Accepted: regression cases fail on base, controls pass on both.
- (2) The lock-control citation named the observer, not the writer: `useLockWallet.ts:58-59`. Verified, accepted.
- (3) The demotion covers any failure of a superseded read, not only a lock refusal. Accepted as wording in Security; it is the siblings' rule, no classifier added.
- (4) The arrival supersede case also asserts the newer read's arrival survives the older read's failure. Accepted, same test.

## Plan audit, Opus leg (Plan agent, opus), in parallel with Codex round 1

- Verdict: conditional approve. Every claim checked against the tree; all accepted.
- (1) Demonstrated: the smoke gate needs the armed build from the tree under test (`global-setup-smoke.ts` refuses a missing or unarmed `dist`, and an older armed one would test old code). The gate now builds it first.
- (2) The chaos checker counts a `warn` but fails a run on an `error` (O4, `checkers.ts:728-739`), so warn→error makes a live arrival failure red a chaos run. Kept (D3): a live failure is real, as the siblings' are, and a red run on `Profile locked` is #1304's reopen condition. Recorded in Inferences and in the #1304 comment.
- (3) The ordering inference is provable from the code (`base-client.ts`, `app.vue:350-374`, pre-flush watchers): cited, "moderate" dropped.
- (4) Nits: `clear()` at `:254`; the Outcome's "still" was wrong for the arrival read; `whileLive`'s doc comment; the Security wording for a stale refresh a switch overtook.
- (5) The stale test harness must override `scope`, `staleActive` and `syncActive`.
