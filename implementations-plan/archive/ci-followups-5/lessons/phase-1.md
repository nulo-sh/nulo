# Phase 1: the job, its tests, the docs

- 2026-10-15, base: merged `origin/dev` at `479ba56d` (the rc.3 move). It touches nothing under `.github/workflows/`, `scripts/ci-cd/` or `CI.md` the plan names (only `scripts/ci-cd/audit-acks.json` and `setup-aztec`); one conflict, `implementations-plan/index.md`, both lines kept. F1-F6 re-checked at the merge: no workflow subscribes to `edited`; the lanes' `types`, `live-labels.sh` and the aggregators' `read-attempt` check are unchanged.
- Step 1: harness extracted to `scripts/ci-cd/gh-step-harness.ts`; `bun test scripts/ci-cd/supersede.test.ts` 8 pass, assertions untouched.
- Steps 2-4: `pr-retarget.yml`, `retarget.test.ts` (9 tests: R1, R2 as four cases, R3, R4 as two tests, R5), B1-B3 in `behavior-gating.test.ts`. actionlint and shellcheck (on the extracted script) exit 0.
- Step 5, red proofs (scratch edits restored by `~/.cache/nulo-backlog/ci-followups-5/mutate.py`, never committed), each `bun test <file> -t <test>` exit 1 on the named test:
  - M1 `max_by` to `min_by`: R1 red. M2 jq `head_sha` filter dropped: R1 red.
  - M3 cancel dropped: R2 "a run in flight is cancelled" red. M4 listed attempt as the post-cancel baseline: R2 "a cancel that hit a newer attempt" red.
  - M5 `exit 1` on a lane with no run: R3 red. M6 every refused re-run counted as done: R4 "a refusal fails the job" red.
  - M7 the poll rewritten lane by lane: R5 red. M8 `edited` added to `pr-quick.yml`: B2 red.
- Gate: `test:ci-gating` 0 (567 pass), `lint` 0, `lint:actions` 0, `typecheck:all` 0, `test:release` 0.
- Deviations: the hoisted lane map is `E2E_LANES`, since `describe("canary lanes")` declares its own `LANES` and would shadow it; the harness takes `overrides` (supersede's `RETRY_PAUSE=0`, retarget's poll pause too).
