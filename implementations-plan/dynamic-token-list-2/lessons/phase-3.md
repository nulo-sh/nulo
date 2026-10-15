# Phase 3 and the review loop

## Gates (2026-10-15, after merging `origin/dev` at 0ac9e062)

- `audit:vue` exit 0. Armed `build:chrome` exit 0; smoke `tests/e2e/token-list.test.ts --retry=0` 1/1, 12 s wall. Network `e2e:agent tests/e2e/network/default-token-seeding.test.ts --retry=0` 1/1, 179 s wall including the build.
- Mutation checks, each restored after: dropping the floor check in `readTokenList` reds the two composition tests and the `sign.test.ts` floor test; a bare import in `floor.ts` reds the publish closure test; `envelopeMeta` reading `flagged` as `[]` reds the flag test.

## Review loop (Codex `gpt-6.1-sol` high, session 01a1408e; one Opus 5.5 diff review beside round 1)

- **Round 1, Codex: conditional approve.** Accepted: the compatibility test signed a fixed sequence a raised floor would refuse, so it now signs at `SEQUENCE_FLOOR`; the publish closure scan missed side-effect imports and run-time loads, so it now reads them as `import-closure.test.ts` does, with a negative control; four comment trims. Single quotes not scanned: Biome's formatter rewrites them.
- **Opus: no must-fix.** Accepted: no `runPublish` case read a flag, so a test now does. Rejected: a missing served envelope raising the floor (needs `list.json` deleted from `dev`, a reviewed change) and a tested helper for the summary's floor line (the decision is tested; `main` is untested by design). Sent to Codex: a run based on a commit whose envelope `dev` no longer serves misses a delisting, and the conflicted PR can be resolved in GitHub's web editor. It reopens the plan's rejected finding 4 with that new argument.
- **Round 2, Codex: conditional approve.** It confirmed the round-1 fixes and the stale-base path with an in-memory probe. Both legs chose the refusal over raising against either envelope, which leaves the approver's summary stale. `runPublish` refuses before any write when `dev` serves another envelope than the base; the README says to close a conflicted publish PR and re-dispatch.
- **Round 3, Codex: approve**, "No new material findings. Confidence: high." The loop converged.
