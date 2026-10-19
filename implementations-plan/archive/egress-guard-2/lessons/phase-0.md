# Phase 0: plan consults

## Codex audit, round 1 (2026-10-19)

gpt-6.1-sol, high, read-only, session `01a15231`. Verdict: conditional approve, 6 findings, all checked against the tree and accepted.

1. Medium, Facts overstated. F2 (`current` is also undefined while a suspend drains, a re-arm runs, after a failed re-arm and after `stop()`; still set through the browser close), F4 (no arm reaches back to an earlier request; pages are not attached), F5 (135 launches cover the first 82 Chrome files only; smoke counts are per file and untimed; `passkey-retry` has no kill or swap, confirmed: `freshExtensionPerTest`, no `stopBackground` or `interceptRpc`), F6 (the `undeclared` test needs `lb.drpc.live` declared). Fixed in place.
2. Medium, I1 too strong; I2 has a reverse direction (a miss whose proxy attempt lands after a suspend began is not counted) and also applies at the first hold. D5 confirmed: no grace, and timestamps or window records cannot recover the order; a causal fix is a drain or a worker-only release, a protocol either way. I1 narrowed, I2 rewritten, D5 now files a known limit if Phase 3 never shows the race.
3. Medium, shutdown: `current` stays set while the browser closes (I4). Disposition: keep observation through the close (clearing it first would hide a genuine miss), a unit control for it, and the Phase 3 trace records close start and `node.stop()`.
4. Low, D1's rationale blamed per-target counting for an aggregate-counter flaw. Rewritten. `watch` stays one registration; the host-wide match is stated.
5. Low, proof criteria: the red run counts only with the held diagnostic; one unit test with a held failure and an undeclared host together; `NULO_E2E_RETRY=0` on every network command (verified: `vitest.e2e.network.config.ts:24-28` retries twice by default); the interception log cannot name an omitted target. Applied.
6. Low, Phase 2 left drift: README's opening line and `FIREFOX.md:71` ignore the CRS hosts; the stand-in is not on the live launch; the cold-wake steps include the scratch page; 50-350 ms is a measurement; `LIVE_NODE_HOST`'s "one outside host"; a remedy for the held failure. Applied.

## Opus Plan leg (2026-10-19)

`Agent`, opus, Plan, read the plan after Codex r1's edits. Verdict: conditional approve, 11 findings, all checked and accepted.

- #1 High: counting through the browser's close keeps a false red with no coverage miss behind it (Chrome detaches its sessions, Firefox closes the observer's window, while `current` stays set until `node.stop()`). `passkey-retry`'s lone smoke record fits it. Disagrees with Codex r1 #3. Decision D8: the count stops at the close, reusing `ownGuardedLaunch`'s `closed` flag; the rule judges the launch while its tests run, as `failures()` already does. Codex to verify.
- #3 Medium: nothing committed proves the real launch is watched; a dropped `watch` would switch the check off silently. Disagrees with Codex r1 #5 ("no new permanent e2e scenario"). Decision D4 revised: one control-spec case on its own launch (Chrome rejects the close, Firefox resolves), about one launch per browser per suite. Codex to verify.
- #2 trace fields; #4 the held failure's remedy; #5 F5; #6 CI smoke retries twice (verified: the PR smoke workflows pass no `retry`, `_extension-smoke-e2e.yml:55-58`); #7 `held` optional so seven exact assertions stand; #8 two more mutations; #9 fold the canary rerun; #10 A1 is a process point; #11 skill drift (close list, smoke-only refusal, the live launch throws without `liveLeg`). All applied.
- Verified F9 (no page or playground node client): `src/wallet/runtime.ts:513`; no `TESTNET_RPC_URL` or node client under `apps/playground/src`, `src/popup`, `src/onboarding`.

## Codex rounds 2 and 3 (2026-10-19, session `01a15231` resumed)

- Round 2: D8 (count stops at the close) and D4 (one control-spec case) hold. Conditional approve, 2 findings: attribution and recurrence claims still too strong; Phase 1's gate named two of four mutations. Both applied.
- Round 3: approve, high confidence.
