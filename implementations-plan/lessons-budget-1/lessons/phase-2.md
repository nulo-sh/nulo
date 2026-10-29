# Phase 2: the pass and the promotions

- `0d6fd6b34`: every other row of the dispositions table, written from the draft the panel reviewed; the word diff matched the table row for row. `fb2dea422`: P1 and P2. The file equals the reviewed draft byte for byte.
- Result: 7592 B, 31 entries (from 8191 B, 33).
- Gate: `bun run lint` exit 0; `check:plans` 0 findings; `bun test scripts/ci-cd/plans/` 108 pass; `check-no-local-paths.sh` ok; the diff from `87d04118e` holds no account name, launch day or advisory text.

## Review loop, round 1 (2026-10-29)

- Codex (fresh, `gpt-6.1-sol`, high): conditional approve, one finding (clause-level evidence missing on five kept lines). Tracing each clause's commit (`git log -S`) showed four sources dropped by earlier tightenings (#607, #240, #68) and one clause that never had a source (L31's pipe status, from the starting commit); all five now link a source. Cost: about 330 B.
- Opus (`general-purpose`): conditional approve, six findings; five accepted (index hook and status, L32's wrong-target clause, P1's stamp, L28's reason in the plan, recon's Firefox-version source), one rejected (the decision-ids clause stays in README step 3: planners read that README before writing a plan).
- Result: 7940 B, 31 entries, 252 B of head-room.

## Review loop, round 2 (2026-10-29)

- Codex (resumed): approve, no new material finding. The loop converged in two rounds.
