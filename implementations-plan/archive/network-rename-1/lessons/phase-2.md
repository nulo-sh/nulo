# Phase 2: the update replay, the captures and smoke

All runs at retry 0 on this host (load 120-225 on 188 cores, another lead running).

| Run | Build | Result | Wall-clock (vitest Duration) |
|---|---|---|---|
| v1.1.0 → base, Chrome | candidate at 4291a8c98 | 4/4 green | 63.4 s |
| v1.1.0 → base, Firefox | candidate at 4291a8c98 | 4/4 green | 86.8 s |
| v1.1.0 → head, Chrome | candidate at 13698a765 | 4/4 green | 67.3 s |
| v1.1.0 → head, Firefox | candidate at 13698a765 | 4/4 green | 96.4 s |
| v1.2.0 → head, Chrome (control: its row already reads "Alpha") | candidate at 13698a765 | 4/4 green | 66.0 s |
| v1.1.0 → final head, Chrome | candidate at 3f679ea03 | 4/4 green | 69.0 s |
| v1.1.0 → final head, Firefox | candidate at 3f679ea03 | 4/4 green | 111.0 s |
| v1.2.0 → final head, Chrome | candidate at 3f679ea03 | 4/4 green | 76.7 s |

- Captures (Chrome, light and dark, local uncommitted edit; case 1 from v1.1.0 alone, the recorded Mainnet row made active, a fresh popup): base header "Alpha V6", list `["Testnet","Local Network","Alpha V6","Sandbox"]`; head header "Alpha", list `["Testnet","Local Network","Alpha","Sandbox"]`. The edit was reverted after each run (`git status` clean).
- The head replay's case 1 now checks the recorded Mainnet row by id and name in `expectIdentity`, and case 2 its renamed snapshot in `throughTheReset`; on the base build both would read "Alpha V6" where "Alpha" is expected.

## Review loop, round 1

- **Codex** (gpt-6.1-sol, high, new session): **0 material.** Nit: the method's doc restated what its helpers say; keep only the journal invariant. Accepted.
- **Opus 5.5** (general-purpose diff review): **0 material**, five nits. Accepted: a sentinel proving a name-only rename keeps Mainnet's node (dropping the eviction guard reds it); a one-line comment on the read-once snapshot (I2); the replay comment's wording. Rejected: a row with both a retired endpoint and a retired name (no Mainnet endpoint is retired, and `addEndpoint` probes chain identity, so the state is not reachable; add it when one is); re-asserting the events after `waitFor` (one pass emits each row once, and a duplicate before the poll already fails it).
- The fixes touch comments and one unit test; the replays and captures above ran on 13698a765, whose product code differs from the final head by comments only.

## Final gates (3f679ea03)

- Smoke, Chrome, the armed build, retry 0: 62 files passed, 11 opt-in files skipped, 1944 s wall (`bun run test:e2e -- --retry=0` under `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1`; run on 13698a765's armed build, whose product code differs from the final head by comments only).
- `bun run lint`, `bun run typecheck:all`, `bun run test:all`: exit 0 (extension 17465 passed). The replays above reran on a candidate built from the final head.
- Wall-clock differences between runs follow the host's load (120 to 225 on 188 cores); the change adds no e2e scenario, only two name reads.
