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
- Product reach: a receipt discovered while no popup read the tip (no arrival row yet), or a token with a pending arrival floor, then an unreachable node: the feed shows no incoming row for about a minute. Rows arrive late, none is lost.
- Test design: the seed now writes the scope's arrival row at the receipt's block (`seedArrivalRow`), the state a wallet holds once any feed read the tip, so no tip read runs and the receipt is not an arrival. No timeout raised.
- Confirmation: with the arrival row seeded, the incoming row showed 3 ms after the visit (60 016 ms without, in the same build).
- Gate: Chrome file 64 s (seeded test 21.4 s, was 16.8 s at base), Firefox 115 s (seeded 31.5 s, was 20.5 s), the four `seedTransaction` callers 16/16 on Chrome.

## Phase 1.3

- One writer, `seedFpcs`, serves both the protocol rows and the unnamed sponsor; `seedProtocolFpcs` is built on it.
- `FpcRow.test.ts` gains one case: the row carries `data-fpc-unnamed` only while its title shows the address.
- Gate: Chrome file 73 s (new test 17.1 s), Firefox 182 s with load1 near 200 during the run (new test 32.3 s), `send-keyboard` 5/5 on Chrome.
