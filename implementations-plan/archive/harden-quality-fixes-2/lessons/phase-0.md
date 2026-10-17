# Phase 0: planning consults

## Recon (2026-10-16)

Three Explore agents on sonnet, read-only, at `ea8827f9`: a reuse sweep over seven capabilities, a map of the four PR e2e gates and their pins, a map of the 15 confirm sites, the contact handshake, the backup selection and the export fences. Findings are in recon.md; the parent re-checked each issue claim it relied on.

- The step numbering on decision page 21 differs from #541's: the page's steps 1 and 2 are the selection type and the non-bumping fence check (the issue's steps 1-3); its step 3 is the issue's step 4. Read from the page record, not the issue.
- Codex runs with `env -u CODEX_ACCOUNT`: the managed settings export `CODEX_ACCOUNT=best`, and the lane brief asks for the default `~/.codex` login.

## Audit round 1 (2026-10-16)

Codex `gpt-6.1-sol` high and an Opus Plan lens, in parallel, both given plan.md, the competing outline and recon.md with the four standard asks. Verdicts and dispositions: plan.md § Audit verdicts.

- Codex session `01a1457a`: conditional approve, 5 findings plus fact corrections. Its first finding (a nested vitest's fail-once fixture writing into the real job summary) was also found by the planner while waiting, from `observability.test.ts:63`'s spawn, which passes no `env`.
- Before the round the planner baselined at `ea8827f9`: `bun run test:ci-gating` 572 pass; `bun run lint:actions` clean; the confirm, contact, backup and export unit suites (15 files, 482 tests) green.
- Opus Plan lens: conditional approve, 8 findings. Its type trace caught what Codex's did not: dropping `profileType`/`backup` from some union variants breaks five readers the plan never named. Both reviewers independently preferred the popup payload for the contact handshake, so D9 was reversed.

## Final pass (2026-10-16)

- Codex session `01a1458e`, fresh: conditional approve, 1 finding. `JSON.parse` of a decrypted file can return a string, so a file sealed twice stays "encrypted with no profile type" and today's second Decrypt opens it; a selection union must not decide decryptability by `kind` alone.
