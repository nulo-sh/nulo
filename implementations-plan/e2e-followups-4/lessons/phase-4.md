# e2e-followups-4 — phase 4 (docs, issues) and the quality loop log

## Quality loop

- Round 1 started while the whole-suite artifact run (Phase 3 step 3) was still going, a deviation from "after Phase 3's gate": the code under review was final whatever that run showed, and both reviewers were told to run nothing (the smoke teardown kills browsers by extension path).
- **Codex** round 1 (gpt-6.1-sol, high, read-only, session `01a12da3`, on account `alejo-icloud` through the environment's `CODEX_ACCOUNT=best`): `findings`, three doc nits; all accepted (plan § Audit verdicts).
- **Opus** (general-purpose diff review): one material finding, confirmed by `bun run check:plans` (a `path-token` finding on ledger row 53's archive path), and two nits; all accepted, one routed to the D-orch-4(b) issue.
- The helper's key prefix now derives from `FPC_STORAGE_ROOT` (the same string). The suite had already run `send-keyboard.test.ts` before that edit, so the file is rerun on C2 and C1 once the suite ends.
