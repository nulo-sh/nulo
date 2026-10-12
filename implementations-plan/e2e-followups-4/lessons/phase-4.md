# e2e-followups-4 — phase 4 (docs, issues) and the quality loop log

## Quality loop

- Round 1 started while the whole-suite artifact run (Phase 3 step 3) was still going, a deviation from "after Phase 3's gate": the code under review was final whatever that run showed, and both reviewers were told to run nothing (the smoke teardown kills browsers by extension path).
- **Codex** round 1 (gpt-6.1-sol, high, read-only, session `01a12da3`, on account `alejo-icloud` through the environment's `CODEX_ACCOUNT=best`): `findings`, three doc nits; all accepted (plan § Audit verdicts).
- **Opus** (general-purpose diff review): one material finding, confirmed by `bun run check:plans` (a `path-token` finding on ledger row 53's archive path), and two nits; all accepted, one routed to the D-orch-4(b) issue.
- The helper's key prefix now derives from `FPC_STORAGE_ROOT` (the same string). The suite had already run `send-keyboard.test.ts` before that edit, so the file is rerun on C2 and C1 once the suite ends.
- **Codex** round 2 (resumed `01a12da3` with the fix diff): `clean`. The loop converged in two rounds.

## Docs

- `.claude/skills/e2e-testing/SKILL.md`: § Build-armed tests, a spec that seeds what a node gives holds the node from before the profile exists; the `NULO_E2E_ARTIFACT_RUN` row says an artifact run arms no guard and no stand-in; § Reproduce like CI, the local release-shaped smoke recipe (it did not exist; Phase 1 composed it from `_build-extension.yml` and `_extension-smoke-e2e.yml`); flake-ledger row 53.
- `implementations-plan/lessons.md`: nothing promoted. The lesson is e2e-domain and lives in the skill (D-orch-7: the file is at its budget).

## Issues

- Deduped with `gh issue list --state all` on "fpc sponsor duplicate", "addFpc address", "sponsored duplicate row", "two sponsored", "FPC already", "protocol FPC hand-added" (nearest: #214, name checks only) and on "artifact smoke unguarded", "artifact run egress", "smoke-against-artifact live", "NULO_E2E_ARTIFACT_RUN", "egress guard artifact", "live testnet smoke" (nearest: #171, closed by #276, source builds only).
- **#316** (`ux`, `owner-decision`): adding Nulo's own sponsor address by hand makes Send list two Nulo sponsors (`addFpc` checks no address; `buildFeeMethods` dedupes nothing).
- **#317** (`ci`): the artifact smoke runs every spec unguarded against the live Testnet node. A comment links the chain-endpoints plan's Ask A1 and D4, which kept artifact runs unguarded on purpose and deferred a hermetic artifact run to its own issue; Opus's `send-fee-privacy.test.ts` observation is in its body.
- No neighbour issue: Phase 1's and Phase 3's whole-file and whole-suite runs showed no neighbour red.
