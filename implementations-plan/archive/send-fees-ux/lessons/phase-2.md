# Phase 2: #340, the cap refusal's words

- 2026-10-15: `journal-state.ts`: `too_many_pending` leaves the `dapp_execute` arms of `nothingSentLabel` (it falls through to `kindLabel`) and `kindLabel`, which gives it "Refused before sending" / "Too many sends were already waiting. Nothing was sent."; `failedSubtitleFor` joins it to `wallet_refused`. The stale "reads as the app send it refused" comment is gone.
- Tests: the `test.each` over `pending` and `queued` expects the new label, line and card subtitle; a `wallet_refused` control keeps its own line.
- Gate F: lint 0, typecheck:all 0, test 0 (795 files, 12864 tests).
