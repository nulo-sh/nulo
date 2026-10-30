# chips-2 phase 4: smoke, captures, review loop

## Review loop

- Round 1, Codex (gpt-6.1-sol, high, read-only, session `01a18e75`) over `git diff 9ce6bb0bd...HEAD` (head `7e9e8cf75`), the plan and ledger, the adversarial ask and the standard's two rules: `VERDICT: clean | findings: 0`. It checked the archive bytes, `/terms/v1.2/` and `/v1.2.1/` generation, that a 1.2 acceptance stays current and a 1.1 one still meets 1.2, the two test edits' exact equality, the launch gate on both placeholders, the store wording, and the Lock button's handler, name, hidden icon and focus ring.
- Beside it, the Opus 5.5 diff review (`general-purpose`): `VERDICT: clean | findings: 0`. It compared every changed assertion with its base (stricter or exactly shifted, none loosened), ran `StaleNetworkTakeover.test.ts` (22/22), checked `.lock`'s cascade and the stretch, every manifest consumer, and the § 4 block. It noted a known cost of D1 that predates this arc: until the promote, a prerelease cut from `dev` links `nulo.sh/terms/v1.2.1/`, which 404s (Terms 1.2 and privacy 1.2.2-1.2.6 took the same path).
- Converged: round 1 yielded no material finding.
