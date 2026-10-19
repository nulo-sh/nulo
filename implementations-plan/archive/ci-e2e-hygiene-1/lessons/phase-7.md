# Phase 7: `dup-trend` runs jscpd from the lockfile (#555)

- Phase 7 ran before phase 5's inventory, so no install ran during an e2e run.
- Gate at 676e507f: `bun install --frozen-lockfile --force` 0. The lockfile diff adds jscpd and its six platform packages only. `audit:dup` prints the report. `lint` 0, `typecheck:all` 0, `test:ci-gating` 0. The local audit gate in enforce mode reported 41 acknowledged and 0 unacknowledged.
- After each `origin/dev` merge (be8ae1c5, 58a5f88b), the frozen force install passed and `bun.lock` still differed from `dev` by jscpd only.
