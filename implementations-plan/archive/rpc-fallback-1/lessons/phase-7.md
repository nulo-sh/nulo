# Phase 7 (arc 3): the send path

- **Step 1, its own commit (`6dbb3a7d0`):** the pending poll reads its recorded endpoint through the single-attempt client, and `reportEndpointFailure` went with its tests. The new test holds a recorded endpoint dark and shows the other pending polls ticking again after one attempt; it was red on the retrying client.
- **The pick.** `PxeService.pickSendEndpoint` (a `Methods` entry, `rpc: true`, `ipxe: false`, `requiresNetwork: true`, the hand-written allowlist, a strict zod check of both hashes, the generation fence) holds only the profile barrier's read side and calls `registry.sendRoute(network).pickForSend`. `PxeFactory` gained `createRoute(network, pins)`; the test fakes take `NO_ROUTE` (`pxe/pxe-factory.testing.ts`) or a local throwing stub.
- **Deviations, recorded as D33:**
  - The pick reads the runtime only when it was built for the request's endpoint list (`peekMatching`, not `peek`); otherwise it takes a route over the request's list holding the pair's pins. A runtime from before an endpoint edit would otherwise send through an endpoint the person had just removed. It still never builds or rebinds a runtime.
  - The background refuses a picked URL the network does not list before anything is recorded or sent (`execution/service.ts`). A composition test shows it, red with the check removed.
  - The auth registry reads a grant's, a revoke's or a toggle's receipt only through an endpoint the network still lists, from the journal row or from an activity row the profile owns (`TransactionService.recordedEndpointOf`). A restored activity row's endpoint is backup data, and an ownerless row may be another profile's. With none it fails closed: `grantNotInBlock` for a grant, an error naming no URL for the revoke or toggle itself.
- The coordinator reads the anchor through `tx.data.constants.anchorBlockHeader.hash()`, which is poseidon on the bb WASM. The composition fakes (`service.composition.test.ts`, `tests/helpers/fee-race-in-process.ts`) stub `hash` to stay bb-free (COMPOSITION-TESTS D6).
- The dApp `wait` polls the picked endpoint's client (`sentThrough.node`), never the build's routed node: the background route keeps no pins, so a moved wait would read a pending hash elsewhere.
- The type-roles inventory digest of `auth-registry/service.ts` was re-attested (producer hits unchanged) and re-pinned twice.
- The descriptor table's surface pin moved from 26 to 27 methods (deliberately), and `pickSendEndpoint` is listed as SW-only.

## Runs

- 2026-11-05, Phase 7 gate on the working tree over `dd5db2446`:
  - `bun run lint`: 0 errors.
  - `bun run typecheck:all`: 0, after typing the journal field as the class (a `Pick` defeats `services.get`'s inference).
  - aztec-runtime `src/pxe src/routing src/adapters`: one red, the 26-method descriptor pin, updated to 27. Then green.
  - The Phase 6 suites: 938 passed.
  - The Phase 7 suites (`execution`, `transaction`, `operation-journal`, `network-reset`, `legal`): 1971 passed. `legal/call-sites.test.ts` still finds one `node.sendTx`.
  - `bun run test:all` run 1: 7 red. The type-roles digest moved again, and the cross-profile isolation harness had no journal stub; both fixed. Run 2: exit 0, the extension at 17514 passed.
