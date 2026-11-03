# w3-dapp-1 status

- 2026-11-02: recon done (1 Sonnet explorer); #1460 and #1461 probes red on `ed30c2565`; #1380 trace verified.
- 2026-11-02: plan drafted (tier light, two arcs; #1380 behind OA-1); panel round 1 started.
- 2026-11-02: Codex r1 reject (8 findings, all accepted): receipt timestamps over arrival order, row ownership, re-queue through the rule, detach-aware buffer, OA-1 corrected with option E.
- 2026-11-02: Opus r1 conditional approve; plan revised (incoming liveness, resend dropped first, debug levels, extraction names, arc 2 audit:vue, OA-1 reach); final Codex pass next.
- 2026-11-02: Codex final r2 reject (ownership by origin); revised to SDK object identity, the queue owns every reject; r3 next.
- 2026-11-02: Codex final r3 approve. Plan committed; arc 1 starts (auto-continue).
- 2026-11-02: arc 1 phase 1 code in (1003743fb red tests, e660abf83 fix); lint, lint:actions, typecheck:all, test:all green; Codex arc r1 conditional approve (log level, detach test order).
- 2026-11-02: review loop converged (Codex arc r2 approve; Opus folded). Smoke e2e green at 0dcec23fc: Chrome passkey-paths 3/3 (24 s), Firefox passkey-paths + toolbar-panel 9/9 (165 s).
- 2026-11-02: network e2e green at 0dcec23fc: Chrome 5 passed, 1 skipped (221 s); Firefox 6/6 (270 s). Final-head lint, lint:actions, typecheck:all, test:all green. Phase 1 ✓; PR next.
- 2026-11-03: arc 2 opened on w3-dapp-1-a2 off dev at ea282b7bc; OA-1 answered E; plan widened (D5, D6), OA-2 filed; Codex arc 2 plan r1 conditional approve, all 4 folded.
- 2026-11-03: arc 2 phase 2 code in (0ef779bad red, c334716d3 fix); test:all green (186 s). Review r1: Codex approve, Opus conditional; fixes 8bbf0f564 (title keeps the decoded name, NFC, right-to-left as A, OA-3 filed); Codex r2 next.
- 2026-11-03: Codex r2 approve (converged). Network e2e at 8bbf0f564, retry 0: Chrome 6/6 (327 s), Firefox 6/6 (583 s).
