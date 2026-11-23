# Phase 1 — extract

- Recon (one Sonnet explorer): the smoke specs that reach `finalizeRestore` are `backup-imported-account`
  (the only one with imported keys, so the only one that consumes a rewrap context), `passkey-backup`,
  `import-paths` and `restore-outcome`. A phrase import goes through `importMnemonic`, not `restore`.
  Only the network `profile-chaos` reaches a lock between `restore` and `finalizeRestore`, through
  its `restoreHeld` action; a delete can meet a held restore only at `account-state`, after finalize.
- The chaos hand list was found by searching planner seeds for the shortest prefix that reaches
  `restoreHeld` with each competitor, then joined and checked with `planFromList` on both caps sets.
- Codex pass over the plan and diff at `7eaf9c1dd` (`gpt-6.1-sol`, high, read-only): no material
  finding; three minor ones accepted (plan § Audit verdicts C1-C3).
- `test:all` caught what the profile suites did not: the chaos model pins 25 `service.ts` lines by
  number and fragment (`tests/e2e/helpers/profile-chaos/model.ts`, checked by
  `scripts/e2e/profile-chaos-model.test.ts`). Any edit that moves lines in `service.ts` must remap
  them; the remap here went through a `difflib` line map of the base and new file, asserting each
  fragment on its mapped line, so a fragment that also appears elsewhere cannot bind to the wrong line.
- `audit:vue` at `10e0beb63` caught a second drift: the review round's one-line-shorter finalize
  comment moved `RETIRED_FINALIZE`'s cited line. The remap now runs from the base `model.ts`
  through a fresh map of base → current `service.ts`, and asserts each cited line is byte-equal
  across the two. Rerun `scripts/e2e/profile-chaos-model.test.ts` after every `service.ts` edit.
- The same run timed out `src/e2e/config.test.ts` (5 s) under `audit:vue`'s parallel typecheck and
  lint; it passed alone and in both `test:all` runs. Rerun once, as a load flake.
