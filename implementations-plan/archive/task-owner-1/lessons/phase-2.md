# Phase 2: the scan, the suites, the no-regression run

- `task/root-task-creators.test.ts` pins the seven creator files and refuses a literal `undefined` owner. Checked by hand: replacing the transfer executor's owner with `undefined` turns "no call passes a literal undefined as its owner" red at `transfer-executor.ts:210`; reverted, green.
- The first `audit:vue` and `test:all` runs were red on one test: `scripts/type-roles/inventory.test.ts`, the digest of `auth-registry/service.ts` pinned for the `action_operations` unreachable branch. Re-attested: the diff in that file only adds owner arguments to three `startNewTask` calls; the producer hits and the evidence lines are unchanged (the hits assertion passed). Re-pinned the digest in `identifier-sites.expected.json`.
- Gate, all exit 0: `bun run lint`; `bun run audit:vue` (typecheck, tests, lint, build); `bun run test:all` (extension 1057 files, 18998 passed); `NODE_OPTIONS=--dns-result-order=ipv4first NULO_E2E_PROVERLESS=1 bun run e2e:agent tests/e2e/network/profile-switch-sweeps-transfer.test.ts`, 1 passed at retry 0 (126 s).

## Review

- Codex (gpt-6.1-sol, high, read-only, one pass over the plan and `5a2b43ec1..HEAD`): **approve**, no actionable point. It ran 11 focused files (386 tests) and traced owners, refused handles, coordinator callers and the re-pinned digest.
- Opus diff review (`general-purpose`): conditional approve. Three points, each verified in the tree and accepted:
  - The test "a profile set while the start's pull is in flight is never replaced by the pull's answer" stopped failing if the pull's `??=` regressed to `=`: B's root was refused, so the switch to A had nothing to clear. It now asserts B's root is tracked. Checked by hand: with `=`, it turns red; reverted, green.
  - `batchOwner`'s comment said the owner is read before anything is awaited; `ensureInitialized` comes first. It now says "read once before the Terms check".
  - `RefusedTask`'s comment said the creator runs "until its own fence ends the work"; the balance queue, the registry sync and the token parse hold no fence. It now says the creator "runs on unchanged and records nothing".
- No fix grew the design; targeted verification: the task and execution suites (1690 tests) and lint, green.
