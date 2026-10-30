# chips-2 phase 4: smoke, captures, review loop

## Review loop

- Round 1, Codex (gpt-6.1-sol, high, read-only, session `01a18e75`) over `git diff 9ce6bb0bd...HEAD` (head `7e9e8cf75`), the plan and ledger, the adversarial ask and the standard's two rules: `VERDICT: clean | findings: 0`. It checked the archive bytes, `/terms/v1.2/` and `/v1.2.1/` generation, that a 1.2 acceptance stays current and a 1.1 one still meets 1.2, the two test edits' exact equality, the launch gate on both placeholders, the store wording, and the Lock button's handler, name, hidden icon and focus ring.
- Beside it, the Opus 5.5 diff review (`general-purpose`): `VERDICT: clean | findings: 0`. It compared every changed assertion with its base (stricter or exactly shifted, none loosened), ran `StaleNetworkTakeover.test.ts` (22/22), checked `.lock`'s cascade and the stretch, every manifest consumer, and the § 4 block. It noted a known cost of D1 that predates this arc: until the promote, a prerelease cut from `dev` links `nulo.sh/terms/v1.2.1/`, which 404s (Terms 1.2 and privacy 1.2.2-1.2.6 took the same path).
- Converged: round 1 yielded no material finding.

## Gates

- Full smoke, armed builds at `7e9e8cf75`, retry 0: Chrome 62 files, 274 passed, 28 skipped, 1680 s; Firefox 66 files, 278 passed, 24 skipped, 2728 s.
- After-captures: the takeover chips are 75.1×30 and 37×30 (the padlock chip), equal heights.
- `origin/dev` moved by three PRs (#1396, #1377, #1398) and merged clean. On the merged head: lint, `typecheck:all`, `test:all` (156 s) pass; `legal-acceptance`, `network-arrival` and `stale-network` smoke pass at retry 0 on Chrome (209 s) and Firefox (290 s).
