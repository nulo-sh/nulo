# Phase 1: arc 1, the smoke identifier sites

Every attempt, measurement and deviation of arc 1, in order.

## 2026-10-16 setup

- Merged `origin/dev` (4aa06020) into the lane branch; the only conflict was `implementations-plan/index.md` (both new lines kept).
- Baseline suite wall-clock (CI, first attempts, `.claude/skills/e2e-testing/SKILL.md` § Runtime budget): Chrome run 38890651617 12 min (shards 6, 8, 9 min), Firefox run 38889987097 17 min (shards 9, 8, 16 min).
- Base timing (D9) is a local run of `type-roles.test.ts` at d738b790, restored from git over the committed head, then the head run on the same host. The host is shared: every e2e run waits for load1 < 150.
- `e2e:agent` rebuilds `dist/<browser>` without the smoke arming, so the network gate runs after the smoke runs and the armed smoke build is rebuilt after it.

## Facts checked in the tree

- No code in the wallet writes a call's `chunkNonce`; only `TxDebugPanel.vue` reads it, and the stored-row codec keeps call fields verbatim (`transaction/spec.ts` `TxCallRowSchema`). The seed renders a branch only stored data reaches.
- The journal and the auth registry read storage on every call (`EntityStorage.getValues`), so a raw row shows on the next mount without a restart.

## Phase 1.2: the incoming feed held for 60 s

- Attempt 1: Activity's `activity-incoming-hash` read "none" right after the visit, with the public receipt stored. Attempt 2 waited for the row (15 s): still none. A timing pass showed the row at 60 005 ms, while the received detail answered in 239 ms.
- Cause: Activity and Home's recent widget assign incoming rows only after the arrivals coordinator's `load`, which reads `getArrivalState`. With no arrival row for the scope, that reads the chain tip through the offscreen PXE, and with Testnet refused the node client retries in 1, 2, 3 s cycles until about 60 s (57 refused requests, 46 from the offscreen document, in one pass). The received detail reads the record alone.
- Product reach: a receipt discovered while no popup read the tip (no arrival row yet), or a token with a pending arrival floor, then an unreachable node: the feed shows no incoming row for about a minute. Rows arrive late, none is lost. Filed as #579.
- Test design: the seed now writes the scope's arrival row at the receipt's block (`seedArrivalRow`), the state a wallet holds once any feed read the tip, so no tip read runs and the receipt is not an arrival. No timeout raised.
- Confirmation: with the arrival row seeded, the incoming row showed 3 ms after the visit (60 016 ms without, in the same build).
- Gate: Chrome file 64 s (seeded test 21.4 s, was 16.8 s at base), Firefox 115 s (seeded 31.5 s, was 20.5 s), the four `seedTransaction` callers 16/16 on Chrome.

## Phase 1.3

- One writer, `seedFpcs`, serves both the protocol rows and the unnamed sponsor; `seedProtocolFpcs` is built on it.
- `FpcRow.test.ts` gains one case: the row carries `data-fpc-unnamed` only while its title shows the address.
- Gate: Chrome file 73 s (new test 17.1 s), Firefox 182 s with load1 near 200 during the run (new test 32.3 s), `send-keyboard` 5/5 on Chrome.

## Phase 1.4

- Never-happens proof (Chrome, local only): with Receive's state dropped from the seeded test, the coverage test failed naming `apps/extension/src/popup/components/popups/ReceivePopup.vue|account.address.slice(0, 6)||0` and logged 58 smoke-owned live, 32 network-owned, 15 unreachable. Restored before the green runs.
- Review fixes, Chrome check (load1 rising from 136 to ~190): the file-scoped `registeredExtension` launch timed out on the service worker's liveness signal (30 s, `fixtures/extension.ts:264`) before any spec code ran, so its five tests failed and the coverage test named the four sites only the Send/Settings test reads. Every arc test on a per-test launch passed (seeded 19.7 s, new 15.7 s). A launch flake under load, not the arc; the green runs follow.
- D9 head timing, final tree, one stamped run per browser (stamps uncommitted; host shared, load1 up to ~340 during the Chrome run). File wall: Chrome 108 s (base 65.7 s), Firefox 142 s (base 84.8 s). Seeded test: Chrome 22.5 s (base 16.8 s), Firefox 33.0 s (base 20.5 s). New test: Chrome 36.3 s, of which about 26 s is its launch under load, Firefox 22.3 s.

  | Step | Chrome s | Firefox s |
  |---|---|---|
  | S1 Home + Receive, Accounts | 0.6 | 2.1 |
  | S2 seeds + background restart | 5.4 | 8.5 |
  | S1+S3 Activity + tx | 0.6 | 0.6 |
  | S3 receipt + journal | 0.5 | 0.4 |
  | S4 token page + metadata | 0.9 | 0.6 |
  | S3+S4 import + New token | 0.3 | 0.8 |
  | S5 explorer None | 1.0 | 1.4 |
  | S6 debug panel | 0.5 | 0.7 |
  | S7 authwits (two visits) | 0.5 | 0.7 |
  | S8 stale takeover | 0.7 | 0.7 |
  | S9 contact on Send | 0.9 | 1.8 |
  | S10 contacts import | 0.4 | 0.7 |
  | S11 FPC seed + settings forms | 1.2 | 2.3 |
  | S12 hidden account + import | 7.4 | 6.3 |
- Gate on the final tree: three green runs per browser at retry 0, Chrome 106, 104, 119 s and Firefox 186, 183, 196 s wall (each started at load1 < 150); `rows`, `send-outcome-rows`, `navigation`, `home-links`, `received-fee-privacy`, `token-list`, `send-keyboard` 24/24 on Chrome after the `storeRow` refactor. A two-hour background limit stopped the first sequence before the third Firefox run started; it ran on its own after.

## Merge of dev before the PR

- `origin/dev` was 11 commits ahead; only `implementations-plan/index.md` conflicted (send-fees-ux kept, the archived ui-followups-p18 line dropped). #594 added two inventory sites marked `(component test)`, which the D1 predicate would have counted as smoke-owned (60 instead of 58) and failed the coverage test on. `siteSuite` now gives that marker its own owner. #594 also changed the network windows spec, so D7's network gate re-runs on the merged tree.
- Merged tree: smoke `type-roles.test.ts` green on Chrome (80 s) and Firefox (167 s), 58 smoke-owned, 37 network-owned, 2 component-test. The network windows spec failed once on Chrome, 3/4: #594's discovered-authwit test read `execute-discovered-consumer` and `-caller` right after the details mounted, while each `AddressDisplay` was still empty (its text lands after an async contact lookup), so D7 reported "1 hidden" for each. Before D7 those empty elements were judged and passed, a false green. Fix: wait for both to be visible, the box D7 reads, before the sweep. Firefox was 4/4 on the same tree.
- Codex round 3 showed the same race reaches the spec's other `AddressDisplay` states, so the per-testid wait became `waitForStateSites`: before a sweep, each live site of the state needs an element with a box (the test D7 reads). A Chrome run started on the per-testid version was let finish, so its services tore down; the final runs follow.
- That Chrome run (per-testid version) passed 4/4 in 403 s. The chained wait for it never released: `pgrep -f "agent.sh m2-net-chrome"` matched its own shell's command line, so the final runs sat idle until the two-hour background limit. Wait on a log line or a pid, never on `pgrep -f` of a string the waiting shell carries.
- Final network runs with `waitForStateSites`: 4/4 on Chrome (344 s) and Firefox (301 s).
