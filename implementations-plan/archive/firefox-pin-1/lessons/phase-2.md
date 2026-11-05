# Phase 2: the pin on 158

- Pin `stable_158.0`; `install-firefox.ts` installed it. The driver test plants `stable_999.0` beside the pin in place of Puppeteer's own revision, now equal to it; its `puppeteer` import became type-only (Biome `useImportType`).
- Green on 158 at retry 0: the Phase 1 five-file list 21/21 (231 s, 20 launches `[firefox] 158.0`), presto-host-permission + toolbar-panel 6/6 (130 s, 6 launches). The contract test passing there is I1's and I3's proof.
- Static gates at `4901ab3a4`: lint, typecheck:all, test (947 files, 16166 tests), test:all (every workspace green, 177 s), test:ci-gating (691 pass), check:plans (0 findings).
- Full smoke pass 1 started at `4901ab3a4` (shard 1/6: 50 passed, 4 skipped, 435 s, 30 launches `[firefox] 158.0`), then stopped to fold the code review; the three passes rerun at the final head.

## Fix loop round 1

- Codex `approve` with one low (a doc comment split from `PxeHostState`); Opus `conditional approve` with that and three more (plan.md § Audit verdicts).
- Firefox's `nsIReplacedHttpResponse.responseBody` is a byte string; assigning JSON text truncated each UTF-16 unit, so `✓` became a control byte. Red first: the contract test with `note: "präsent ✓"` in the second page's body failed `JSON.parse: bad control character` on 158; encoded as UTF-8 it passed on 158 and Chrome.
- An override set outside BiDi skips `prepareResponseStart` (`NetworkRequest.sys.mjs:346-355`), so Puppeteer never sees `responseCompleted` for an answered request; no spec waits on network idle. Recorded in FIREFOX.md.
- The Firefox stderr line `InternalError: unsafe filename: data:application/javascript…` (the page-error relay's frame script) prints on every green launch too; it is not a failure.

## Fix loop round 2

- Codex `approve` over `4901ab3a4..6129a71d7`, one low: the FIREFOX.md sentence claimed a network-idle wait never settles, which overstates it (idle can be reported before any answered request, or under a concurrency allowance). Narrowed to "stays in Puppeteer's in-flight count". The loop converged at round 2.

## Full smoke pass 1 at `6129a71d7` (84c1e1b5a only changed docs): one red, a fourth difference

| Shard | Result | Wall-clock |
|---|---|---|
| 1/6 | 50 passed, 4 skipped | 375 s |
| 2/6 | 50 passed, 1 skipped | 477 s |
| 3/6 | 1 failed, 35 passed, 5 skipped | 413 s |
| 4/6 | 41 passed, 8 skipped | 511 s |
| 5/6 | 54 passed, 1 skipped | 385 s |
| 6/6 | 45 passed, 5 skipped | 484 s |

Total 2645 s; every launch `[firefox] 158.0`. The red: `import-errors-scroll.test.ts:230`, `expected 101.80000305175781 to be 102`. On its own the test fails 3 of 3 on 158 and passes 2 of 2 on 153.0.4. A probe of the scroller read: on 158, scrollTop 101.8, scrollHeight 399, clientHeight 297, `scrollTopMax` 101.8, children heights 56 + 342.8; on 153, scrollTop and `scrollTopMax` 102 with the same heights; on Chrome, scrollTop 102, children 56 + 342.77. So the content ends at 101.8 and 158 keeps that fractional end, where 153 and Chrome snap it to a whole pixel. `CollapsingHeroLayout.vue` sets `scrollTop = scrollHeight - clientHeight`, which the browser clamps to its end, so the product lands right; the test's end is the rounded bound. This test never got this far on 158 before: at the base it stopped on the refused `setFiles`.

The plan stops the arc on a fourth difference. Codex r3 (plan.md § Audit verdicts) agreed the fix is a bounded test-only amendment (D7, proposed) and that approval comes first. The proposed patch, applied in place and reverted afterwards, passed the whole file 4/4 on 158, 153.0.4 and Chrome. It is not committed.

## The gates D7 does not touch, run while the arc waits

- **Chrome smoke**, full, retry 0, six shards in sequence: 273 passed, 0 failed (283 + 365 + 365 + 309 + 365 + 267 = 1954 s).
- **Firefox network**, retry 0, on 158. Two deviations from the plan's gate command:
  - `agent.sh` refuses a full run without `NULO_E2E_PROVERLESS=1`, because fifteen files are gated on it, so the gate ran proverless, as CI's shards do.
  - The unsharded run outran its 7000 s bound after 102 of 133 files (203 tests, 0 failed). Its one orphaned geckodriver group was reaped by its run id, and the other 31 files ran on their own: 29 passed and 2 skipped, 35 tests passed and 2 skipped, 951 s.
  - Together: 133 files, 0 failed, every launch (148 + 30) `[firefox] 158.0`.
- D7 changes only `import-errors-scroll.test.ts`, a smoke file. The network result therefore stands for the final head. The Chrome smoke needs only that file rerun, which the patch trial did (4/4).

## D7 approved; the gate at the final head

- The orchestrator approved D7 on 2026-10-28. It landed as `24c5d7dde`, and `origin/dev` was merged as `8acc54ff9`; the merge left the drivers alone, and its one fixture change was `fixtures/dom.ts`'s `waitForHash`.
- Static gates at `8acc54ff9` were green: lint, typecheck:all, test:all (extension 16219 passed), test:ci-gating (691 pass), check:plans (0 findings). D7's file on Chrome passed 4/4 (60 s).
- The full Firefox smoke ran three times at retry 0 on 158, six shards in sequence. Pass 1 started at `8acc54ff9`; `c775544a2`, a comments-and-docs-only commit, landed during its shard 2. Every launch printed `[firefox] 158.0`:

| Pass | Shards (passed) | Failed | Wall-clock |
|---|---|---|---|
| 1 | 50, 50, 36, 41, 54, 45 = 276 | 0 | 2929 s |
| 2 | 50, 50, 36, 41, 54, 45 = 276 | 0 | 2852 s |
| 3 | 50, 50, 36, 41, 54, 45 = 276 | 0 | 3038 s |

- D7's test passed on 158 in every pass (shard 3).
- The answerer's contract test measured 6.5 s on Firefox 158, and 3.6 to 4.5 s on Chrome.
- The Chrome smoke (273/273) and the Firefox network suite (133 files, 0 failed) ran before the merge. The merge changed no driver file, so per the orchestrator the PR's CI lanes are the authority on the merged head.
