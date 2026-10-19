# Phase 8: full gate, review loop, delivery

## Review round 1 (2026-10-15), over phases 1 and 2

- Codex (`run-codex.sh`, gpt-6.1-sol, high, read-only; session `01a141e3`): conditional approve. (1) Accepted, fixed in 84e49ca0: the rename control's shared address and `FRESH` were above the field modulus, so `sameFieldAddress` never matched and the control could not catch a gate that blocks renaming a legacy duplicate; with field-valid addresses a mutation that reads the error outside the `addressChanged` branch now reds it. (2) Pre-existing, outside the arc: the submit button bypasses `submitWaitsForShow` while the list loads, on four popups: known limit #528. (3) Pre-existing, already a BUG PIN: an FPC added during the held read is dropped.
- Opus diff review (`Agent`, opus, general-purpose): approve after one test fix (the same as Codex 1). (2) Same as Codex 2 (#528). (3) A Send-page send the cap refused is filed as `transfer` (`failureKind` has no `TooManyPendingError` arm), so it reads "Stopped before broadcast": a visible change P18-11 does not cover, so OWNER-ASKS OA-5, shipped as is. (4) An `onFpcAdded` row from another network can warn falsely: known limit #529.

## Review round 2 (2026-10-15)

- Codex resume (session `01a141e3`): **approve**. The fixture fix holds (field-valid `OTHER`/`FRESH`, the rename control's rows share `OTHER` through `getFpc` and `getFpcs`); no new material finding, no regression. The loop converged at round 2.

## Full gate (2026-10-15/16)

- `test:all`: first run red on `src/utils/zod-jitless.test.ts` (a 5 s cold-import timeout under host load, the known flake #500; the file alone passes in 0.7 s); rerun green. `test:ci-gating` green; `check:plans` 0 findings; final `lint` and `typecheck:all` 0.
- Smoke, retry 0, load-gated (load1 < 150): Chrome and Firefox, `send-fee-privacy` 1, `send-keyboard` 5, `send-outcome-rows` 2, `settings-crud` 9, all green.
- Network, retry 0, through `agent.sh`: `fee-methods` 8/8 (381 s), `NULO_E2E_PROVERLESS=1` `same-token-concurrent-sends` 16/16 (691 s).
- Screenshots: a throwaway smoke spec outside the repo on the armed Chrome build, both themes; the Send page with no token shows no `send-from-type`, so the fee-field shot waits on `send-fee-method-trigger` instead of `openSend`.

## Arc 2 review round 1 (2026-10-16), over phases 1b, 5 and 6

- Codex (`run-codex.sh`, gpt-6.1-sol, high, read-only; session `01a144e6`): conditional approve. (1) Plausible, unverified: an edit of Nulo's sponsor row that lands between the press and the worker's first read (`sequence()`) makes the send enter unsponsored, so the fail-closed rule never fires and the send builds uncapped through the edited contract; a send that is not queued has the same window (the reuse ladder rejects the drifted row and rebuilds). Closing it needs the request to carry the approved payer, a wire change the plan rules out: known limit #569. (2) Demonstrated coverage gap: the re-pointed test did not assert the run's slot and ticket go back; added (every acquired release called, a later send on the same keys unblocked), mutation-checked by dropping the final `release`.
- Opus diff review (`Agent`, opus, general-purpose): approve. (1) Same as Codex 1 (#569). (2) The `queueMode ? undefined` estimate-id change was dead defence (a queued row never has a landed estimate): reverted to the existing line; the integration assertion stays as the behaviour pin. (3) The `feeQueued` doc comment overclaimed for a sponsored queued send: narrowed to a fee the person pays.
- E2E (gate for phase 6): `NULO_E2E_PROVERLESS=1` `same-token-concurrent-sends` 16/16, wall 875 s (tests 712 s; arc 1: 606 s). The converted 18/19 case 40.5 s (before: 31.2 s); the other scenarios ran 0 to 24 s slower at this host load, so the scenario's own cost is about 3 s (a 3 s queued check, then the 15 s held check that replaced the 15 s queued one).

## Arc 2 review round 2 (2026-10-16)

- Codex resume (session `01a144e6`): **approve**, no new finding. It verified the release assertions, the restored estimate-id line (scheduling clears the result; a landed estimate clears the queued state before another event runs) and the narrowed comment, and found no new evidence on #569. The loop converged at round 2.

## Arc 2 final gates (2026-10-16)

- Smoke, retry 0, Chrome and Firefox: `send-fee-privacy` (1), `send-keyboard` (5), `send-outcome-rows` (2), `settings-crud` (9), all pass.
- Network, retry 0, Chrome: `fee-sponsor-funding` 4/4 (108 s of tests); `fee-methods` red 4/8 once, every failure in the `feeJuiceImportedExtension` fixture's wait for the Home gas card while host load rose from 145 to 300 (the arc does not touch that path), then 8/8 on the one rerun (430 s of tests, load 121 at start).
- Network, retry 0, Firefox: `NULO_E2E_PROVERLESS=1` `same-token-concurrent-sends` 16/16 (822 s of tests, 952 s wall; the converted case 49.1 s); `fee-sponsor-funding` 4/4 (133 s), on the head merged with `origin/dev`.
- `origin/dev` moved twelve commits during the e2e queue, three of them touching files this arc changes (`OperationCard.vue`'s payload rows, `send.vue`'s token events, `send.integration.test.ts`); the merge was clean and changed no dependency. Since CI tests the PR's merge ref, the branch merged it and reran the unit gates there.
- `type-role-ban.test.ts` hit vitest's 5 s timeout a second time, at load 446 (alone: 2 s). Like #500's cold imports, the budget is the host's, not the test's.
- The load gate (load1 < 150, polled every 2 minutes) held the eight smoke files for about four hours on this host; gating the builds as well added nothing, since a build is not an e2e run.
