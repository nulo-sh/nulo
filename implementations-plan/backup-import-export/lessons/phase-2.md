# Arc 2: implementation log

## Start (2026-10-14)

- Arcs 1 (#246) and 1b (#247) merged into `dev` (squash). Arc 2 branches from `origin/dev` d3dc441 as `backup-import-export-arc-2` (D-orch-4) and opens as one plain PR against `dev` (D-orch-5). P1-05 approved as proposed (2026-10-14, the `## Decision` block on #191, #221 and #147).
- Facts re-verified at d3dc441 (the plan's were read at f15a9b5). F13 holds: `getNodeStatus` calls `_getChainId(primary.rpcUrl)` without the kind hint (now `network/service.ts:752-767`, with a comment stating the gap); `probeNodeStatus` applies `isLocalNetworkTarget` (`:778`). F14 holds: the slice is `non-storage`, `precheckContractAddress` skips `isPxeProvidedAddress`, the cap is `40 * 1024 * 1024` code units (`normalize.ts:34`), its comment at `:21-33`. The `(BUG PIN)` is at `network/service.test.ts:1606`; the dead-URL and public InvalidChain controls the plan asks for already exist beside it. The header dot is a bare `<div>` inside the testid'd `network-button`, so `data-status` goes on the button.

## Phase 2.1 (#147, status)

- `getNodeStatus` passes `network.kind`; the `(BUG PIN)` flipped to "a local-kind network on a non-seed URL whose node answers is Active on both". `Header.vue` computes the status key once and uses it for the dot's class and the chip's `data-status`; `Header.test.ts` pins the attribute.
- Gate: lint 0, `typecheck:all` 0, `src/wallet/services/network/` + `src/components/` 76 files, 1101 tests passed.

## Phase 2.2 (#191, export)

- `backupNetworkState` skips `isPxeProvidedContract(c)` before `getContractInstance`. The string form (not `isPxeProvidedAddress`) because `getContracts` returns strings and a spelling the parse refuses stays work, as on the import side. The `normalize.ts` cap comment now says what is true: the export leaves them out, an older backup still carries them, and its measured 33.8M is why the bound cannot come down. `pxe-provided.ts`'s header said "a backup still carries them"; reworded.
- Old-shape import: `restore-surface.pins.test.ts` already pins the skip of a protocol and a preloaded address with a custom sibling registered; unchanged and green.
- New test: a protocol address and the AuthRegistry address are left out before their instance is read; a custom contract is kept (control). Red with the filter line removed (1 of 22), green with it.
- Gate: lint 0, `typecheck:all` 0, `account-state/` + `importChainSync.test.ts` 5 files, 67 tests passed.
