# Phase 1: routes

- Four commits, each moving one line to its home and deleting it from `lessons.md`: L6 to the e2e README's `passkey` row (`47a7e2b69`), L9 to `CI.md` § Adding a new gate (`0203a1f2c`), L11 to the README's Post-implementation standard step 3 (`d48b9874b`), L19 to the logging-policy skill (`994c90191`).
- commitlint read a body line starting `only:` as a footer and warned (`footer-leading-blank`); the unpushed commit's message was reworded.
- Gate: `bun run lint` exit 0; `bun run check:plans` 0 findings after each staging; `bun test scripts/ci-cd/plans/` 108 pass; `check-no-local-paths.sh` ok; `git grep` finds each routed text once in its home and no old line in `lessons.md`.
