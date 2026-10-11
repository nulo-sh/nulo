# Phase 2: the docs

## Gate (2026-10-11, commit c638bd7)

- The scoped search for the nine replaced sentences (plan Phase 2 step 2) printed nothing (exit 1).
- A wider sweep (`git grep -i -E "advisory|gate nothing|gates nothing"` over `*.md`, `*.yml`, `*.ts` outside the plans, filtered by nightly or chaos) found only the two reports that stay advisory (`dup-trend`, `rp-host-live`) and the new sentences.
- `bun run lint`: exit 0. `bun run test:ci-gating`: 523 pass (includes `check:plans` and the home-path guard). `bun run test:all`: exit 0 (extension 11233 passed, 4 skipped, 7 todo; every package green).
- One edit beyond the change map: CI.md's new chaos bullet first named the issue number; dropped, since docs state live behaviour, not provenance.
