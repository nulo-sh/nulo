# ruleset-hygiene-2: phase 0 (planning) consults

## Consult 1: Codex plan review, round 1 (2026-10-13)

- Call: `run-codex.sh <prompt> <worktree> high read-only gpt-6.1-sol`, default `~/.codex` login (`CODEX_ACCOUNT` unset). Session `01a136fe-f602-7530-9f75-96892800f111`. The host runs Codex in approve-for-me mode.
- Verdict: reject, seven findings. All verified against the tree and accepted; the plan's Audit verdicts list each with its fix.
- Notable: the Phase 3 grep matched the plan's own text (reproduced: `git grep -n 'CLAUDE.md#where-open-work-lives'` hit `plan.md:82`); `check:plans` reads the index, so an unstaged skill escapes it; "Never log" sits at `CLAUDE.md:194-196` (Codex cited `:191-194`, close).

## Consult 2: Codex plan review, round 2 (resumed, 2026-10-13)

- Same session, `resume-codex.sh` at `high`. Verdict: conditional approve. C1 to C7 resolved; one new Medium (C8): the cumulative `-U0` diff against the base contradicted "only the phase's lines". Verified and fixed in place; no third round.
