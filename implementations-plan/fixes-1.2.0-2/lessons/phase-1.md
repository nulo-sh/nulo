# Phase 1 (arc 1): the batch cap at 25

- Probe, 2026-11-03 19:09 UTC: 25 `aztec_getNodeInfo` and 25 `aztec_getBlockNumber` entries to both free dRPC origins: HTTP 200, every entry answered.
- Tests first: the four moved cases (`seeds.test.ts`, `node-factory.test.ts`, two in `scripts/seed-identity.test.ts`) were red on `dev` (3 per request), green after the change. The package adapter test keeps its injected 3 (D7).
- Gate on the final head: lint, `typecheck:all`, `test:all` exit 0; `check:plans` 0 findings; `check:seeds` live printed OK for Testnet and Alpha at 25.
- Review: Codex r1 clean; Opus review alongside it found no material defect, one comment word ("accepts" where the probe shows 100 accepted; now "allows", dated) and an evidence gap for heavy responses. A probe of 25 `aztec_getContractClass` entries for the largest protocol contract class (6,437 bytes each) answered HTTP 200 on both origins in one 160,917-byte body; a full multi-contract send through the wallet was not run. Codex r2 clean.
- Commitlint refuses an upper-case letter anywhere in the subject ("dRPC"), so the PR and commit say "free node endpoints".
