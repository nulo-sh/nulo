# ui-leftovers-1: status

- 2026-10-17 14:21Z: planning. Recon done (one Sonnet sweep, two browser probes); plan, recon and owner asks drafted (OA-1, OA-2); Codex and Opus plan audits running.
- 2026-10-17 14:33Z: Codex and Opus audits returned (both approve with changes); accepted findings applied; Codex verify round running.
- 2026-10-17 14:34Z: Codex verify round: approve, no new material finding. Plan committed; awaiting orchestrator approval.
- 2026-10-17 14:59Z: dev 623fc97f merged (#650). #583 B amendment written as Phase 6 (D5); Codex round on it: approve with changes, A1 and A3 folded, A2 rejected with reason. Phase 0 gate (install, lint, typecheck:all) pass; armed builds Chrome and Firefox ok.
- 2026-10-17 15:09Z: Phase 0 pass. Before shots (Chrome, armed build) of the five surfaces and the two-chip ladder (matches #650's table). Base times, local: navigation Chrome 29.0 s / Firefox 47.8 s; rows Chrome 61.7 s / Firefox 110.5 s.
- 2026-10-17 15:11Z: Phase 1 (#635) gate pass: lint, typecheck:all, `test BalanceView amount.callers` (70/70). Red proof: the token-page case fails on the base component.
- 2026-10-17 15:21Z: Phase 2 (#639) gate pass: lint, typecheck:all, `test Header` (52/52), navigation by the smoke recipe on Chrome (8/8) and Firefox (8/8). Deviation: the plain-click control clears the selection first (Chrome keeps a selection through a click inside it; lessons/phase-0.md).
- 2026-10-17 15:24Z: Phase 3 (#628) gate pass: lint, typecheck:all, `test journal-state tx-enrichment RecentActivityView` (211/211).
- 2026-10-17 15:30Z: Phase 4 (#618) gate pass: lint, typecheck:all, `test token-aggregate holdings BalanceView` (106/106). Red proof: the unavailable case fails on the base page.
- 2026-10-17 15:33Z: Phase 5 (#634) gate pass: `test toast ToastManagerBase` (50/50), lint, typecheck:all. After-shots and the arc gate move past Phase 6.
