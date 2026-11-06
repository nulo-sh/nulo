# Phase 1 (arc 1): the restore admission

- **Implementation.** The service change matched the plan. The chaos model's citations moved by a line diff from base: 26 lines at the first commit, one more after the review fix.
- **Base check.** Without the change, (a), (d), (e)'s refusal and (f) fail, and (b) and (c) pass. (e)'s control first read the clock from the new admission, so it could not run on base. It now fixes the clock before the restore, and passes on base.
- **Review loop, round 1.** Codex (gpt-6.1-sol, high, read-only) came back clean with one doc nit. The Opus general-purpose review raised the same doc, (e)'s base dependence, an untested identity-checked drop and two comments. All of them were accepted. Mutation: an unconditional drop now fails (d)'s open seam.
- **Review loop, round 2** (resumed). Codex came back clean: every fix verified, no regression. The loop converged.
- **Gates.** Lint, `typecheck:all`, `bun run test`, `test:all` and `check:plans` all exit 0. Smoke, built armed with `passkey-backup`, `backup-roundtrip` and `restore-outcome`: 6/6 on Chrome and 6/6 on Firefox.
