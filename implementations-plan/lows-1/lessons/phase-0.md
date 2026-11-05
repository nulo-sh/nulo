# Phase 0: planning consults

Every consult of the planning panel, its verdict and what changed, in order.

## Round 1 (2026-11-05)

- **Recon:** two Sonnet explorers (reuse sweep; restore-flow mapper). The sweep missed `tests/e2e/helpers/backup-export.ts`'s passkey helper and its callers; the Opus leg found them.
- **Codex, gpt-6.1-sol at high, read-only, fresh session:** reject. Blocking: finalize's ordering against an accepted lock and the admission's identity across a same-id restore were under-specified; D9 did not snapshot pair and scope before the card; D8's entries and failure transitions were unspecified. Also the lock guarantee's boundary (D4), D11's overstatement, Fact 2's line (893), a cited test that does not exist at HEAD, an unsupported rarity claim, and the refusal's wording as an owner ask.
- **Opus 5.5, Plan:** conditional approve. Same D9 gap; the lock guarantee's boundary as residuals; no change for finalize's ordering under the facade lock's hold limit; the pins and chaos transitions the reorders change; D5 is a change against HEAD, to pin and name; widen `SessionEndedError`'s and `ExpiringStash`'s docs.
- **Decided:** the ordering dispute went to Codex's side at first, as an identity capture plus a post-open re-check (D2). Everything else was accepted; nothing rejected. The lock guarantee's residuals are reported privately, not committed.

## Final fresh Codex pass, round 1 (2026-11-05)

- **Codex, gpt-6.1-sol at high, new session:** reject. The post-open re-check could not undo an open without a session-manager change and named no session to close; the admission was captured too late (after the marker delete); the gates lacked the armed smoke build, working directories, chaos and update-replay opt-ins, `--retry=0` and `audit:vue`.
- **Decided:** capture moved before the first await, as `seenRewrap` is; the post-open re-check withdrawn, as a session-manager change beyond the lane (boundary reported privately). Gates rewritten. The round-1 dispute with Opus thereby ends on Opus's side for the open itself and on Codex's for the successor identity.

## Final fresh Codex pass, round 2 (2026-11-05)

- **Codex, resumed:** conditional approve. Conditions: qualify the restore guarantee to the admission gate; keep failure mechanics out of committed files. Both applied; no new finding on the capture, the gates, the tests or proportion.

## Final fresh Codex pass, round 3 (2026-11-05)

- **Codex, resumed:** approve. Both conditions verified on disk; no regression.
