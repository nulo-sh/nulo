# Phase 1: the runs at P, 2026-11-03

Both candidates were built at `P` = `55b2ad17b` (manifest `1.1.0.1`, 10 s and 11 s). `git diff --stat 3b845ef02 P -- . ':(exclude)implementations-plan'` is empty, so no build input differs from the planning base. `origin/dev` had moved to `ea282b7bc` (#1625) by the build; Phase 3 merges it. Chrome 155.0.8059.79 (Puppeteer 25.14.0), Firefox 158.0. `git status --porcelain` was empty before run 1 and held only the rewritten recording before runs 2-4. All at retry 0, no rerun.

| # | Run (UTC) | Outcome | Wall-clock |
|---|---|---|---|
| 1 | Live, Chrome, `NULO_E2E_UPDATE_RECORD=1`, 18:06:07-18:09:19 | **red** at the close: the egress guard | test 119.4 s, vitest 177.8 s |
| 2 | Live, Firefox, 18:11:06-18:15:35 | **red** at the close: the egress guard | test 181.0 s, vitest 248.0 s |
| 3 | Replay, Chrome, 18:15:46-18:16:53 | 4 passed: 28.0 s, 13.5 s, 9.6 s, 11.9 s | vitest 66.5 s |
| 4 | Replay, Firefox, 18:17:07-18:18:43 | 4 passed: 37.6 s, 20.8 s, 14.7 s, 16.4 s | vitest 94.4 s |

## The red, runs 1 and 2

- Both fail the same way: `Error: egress guard: update-in-place.test.ts: <browser> tried 1 host(s) outside the machine that no list declares: lb.drpc.live:443`, thrown by `closeAfterEgressCheck` (`tests/e2e/fixtures/egress-guard.ts:393`) from `ctx.close()` in `inPlaceUpdate`'s `finally` (`tests/e2e/fixtures/update/in-place.ts:186-192`).
- Cause, demonstrated on both browsers: `egress-guard.ts:71` derives `LIVE_NODE_HOST` from the candidate's `TESTNET_RPC_URL`, and `DECLARED_REFUSALS` (`:85-99`) declares only that Testnet host. #1622 moved that constant to dRPC's keyless host. The keyed load-balancer host that v1.1.0 seeds as its Testnet default is no longer declared, so the guard refuses the release's request to it (a `CONNECT host:port`, no path) and fails the close. On 2026-10-28 the derived host was that keyed host. When the release sends the request is inferred, not proven by the host-only error: before populate moves its endpoints to loopback.
- The guard's error comes from a `finally`, so it replaces any error the update or verify step threw. Whether either live body passed is unknown.
- Not a flake: the pinned v1.1.0 zip fixes the host it seeds, the candidate's constant fixes the host the guard declares, and both browsers fail on it.
- The replay does not trip it: both replays passed with the new recording.

## The recording

- Written at 18:08:59 UTC by run 1, during populate, after `recordingProblems` and the moved-host check passed (`network/update-in-place.test.ts:290-297`, `:410-413`). Kept, as the plan says for a red after the file changed.
- SHA-256 `217c3d5081d2013021198b68b8657180bf07b5198c41dc0f58bf3466ed1538fd`, 38 keys. Tag `v1.1.0`, browser `chrome`, 5 dials, all loopback, no `nulo:e2e:` key. Its plaintext names 5 URLs, all loopback, and no `drpc`.
- Key families against the old recording (39 keys): one differs, `nulo:core:incoming-balance-outbox` 1 → 0. That row is an outbox the wallet drains, so its count depends on timing. Both replays read the new recording whole.
- Its dApp session was made during run 1's populate, between 18:06:07 and 18:08:59 UTC, so it expires 7 days later. The replay refuses it from 10 minutes before: from 2026-11-10 17:56 UTC at the earliest.

## The panel on the red

- Lead's lean: one diagnostic live run with the host declared in an uncommitted edit, reverted, to learn whether the masked body passes.
- Codex (resumed plan session): option A, no diagnostic. The edit changes the guard's acceptance and repeats a failing scenario under it, which the brief's "reported, not patched" and "no change to the scenarios" forbid whatever its label; the fix lane must rerun both live scenarios anyway. The recording stands on its own checks and both replays. **Accepted**, on the brief's wording. Codex's two findings (the undeclared host; the `finally` masking the body) go to the issue.
