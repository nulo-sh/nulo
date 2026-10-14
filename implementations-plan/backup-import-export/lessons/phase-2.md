# Arc 2: implementation log

## Start (2026-10-14)

- Arcs 1 (#246) and 1b (#247) merged into `dev` (squash). Arc 2 branches from `origin/dev` d3dc441 as `backup-import-export-arc-2` (D-orch-4) and opens as one plain PR against `dev` (D-orch-5). P1-05 approved as proposed (2026-10-14, the `## Decision` block on #191, #221 and #147).
- Facts re-verified at d3dc441 (the plan's were read at f15a9b5). F13 holds: `getNodeStatus` calls `_getChainId(primary.rpcUrl)` without the kind hint (now `network/service.ts:752-767`, with a comment stating the gap); `probeNodeStatus` applies `isLocalNetworkTarget` (`:778`). F14 holds: the slice is `non-storage`, `precheckContractAddress` skips `isPxeProvidedAddress`, the cap is `40 * 1024 * 1024` code units (`normalize.ts:34`), its comment at `:21-33`. The `(BUG PIN)` is at `network/service.test.ts:1606`; the dead-URL and public InvalidChain controls the plan asks for already exist beside it. The header dot is a bare `<div>` inside the testid'd `network-button`, so `data-status` goes on the button.

## Phase 2.1 (#147, status)

- `getNodeStatus` passes `network.kind`; the `(BUG PIN)` flipped to "a local-kind network on a non-seed URL whose node answers is Active on both". `Header.vue` computes the status key once and uses it for the dot's class and the chip's `data-status`; `Header.test.ts` pins the attribute.
- Gate: lint 0, `typecheck:all` 0, `src/wallet/services/network/` + `src/components/` 76 files, 1101 tests passed.
