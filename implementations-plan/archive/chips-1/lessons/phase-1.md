# chips-1 phase 1: the name

- The seed and `getChainName` renamed; 22 expectation lines in 10 files changed to "Alpha". `cap-chain-mismatch.test.ts`'s banner check became `toContain("Your wallet is on Alpha.")`: with the full stop it still refuses "Alpha V6", which a bare "Alpha" would accept.
- `bun run lint` failed once: the shorter name let biome join a `for` line in `networks/index.test.ts`; `biome format --write` fixed it. The 24 warnings and 4 infos are on the base too.
- Gate: lint 0, `typecheck:all` 0, 7 files and 278 tests green, the `git grep` lists only `apps/extension/store/listing.md`.
