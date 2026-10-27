# Phase 3: #1241

- Change: the depth-1 case asserts `git config --local --default "" --get remote.origin.promisor` is empty after the gate runs; the fixture origin's `uploadpack.allowFilter` gains its reason.
- Mutation: `--filter=tree:0` put back into `prepareDev`'s fetch; on host git 2.43.0 the pin fails (`Expected: ""`, `Received: "true"`), the other 12 cases pass. Reverted.
- Gate: `permalinks.test.ts` 30/30 runs green on host git 2.43.0 (13 pass, 0 fail each); 30/30 in `oven/bun:1.4.2-alpine` with git 2.56.0 from Alpine edge, worktree mounted read-only; `bun run test:ci-gating` 686 pass, 0 fail; `bun run test:release` 341 pass, 0 fail.
