# Phase 5 (arc 3): the offscreen route

- `openChainStore` now only opens; `readStoreStamp` reads the stamped rollup (refusing another schema or an unparseable stamp, as before) before the route is built, and `initStoreVersionStamp` checks and writes after the node answers. A stamp naming the zero address gives the route no rollup reference, so no candidate is refused for it.
- `createChainRuntime` builds a routed node with the store's rollup, then reads identity and rollup through it inside the close-on-throw; a built runtime that fails its floor seeding is disposed (its PXE stopped), not only its store closed.
- The floor is seeded from `pxe.getSyncedBlockHeader()`; the not-synced diagnostic keeps the genesis floor, any other error fails the build.
- Pins live in `ChainRuntimeRegistry` per (profile, chain), handed to every runtime built for the pair, and dropped only when the profile is erased (`disposeProfile`); a corrupt-store purge or an endpoint edit keeps them.
- Until Phase 6 step 2, the background's view reads (`view-executor.ts`) and `readChainTip` stay on the primary URL.

## Runs

- 2026-11-05, mutation checks on the new chain-runtime tests (seven mutations of `chain-runtime.ts`: no seeding, no stamp to the route, no close on throw, every seed error swallowed, `peekMatching` ignoring the list, fresh pins per build, pins kept on erase): each red, restored after.
- 2026-11-05, Phase 5 gate on the a3 working tree over `e67349ca7`: `bun run lint` 0 errors (after `biome format` on the touched files); `bun run typecheck:all` 0; `(cd packages/aztec-runtime && bun --bun vitest run src/pxe --retry=0)` 296 passed, 2 skipped; `bun run test` run 1: two reds, the projection tests in `network/spec.test.ts` and `network/service.test.ts` still expecting `rpcUrl` (a deliberate shape change, updated); run 2 exit 0 (17481 passed).
