# Arc 2: Phases 3 to 5, and the arc's review loop

## Phase 3, discovery paced per tab

- The checks on a well-formed envelope live in `admitEnvelope`, in their order, which keeps the admission closure within the cognitive-complexity budget of 15; no acceptance was added.
- Five added lines in `background.ts` moved the profile-chaos model's line citation of `discoveryQueue.drain(` (384 to 389). Only the full unit suite sees it.
- `session-holders.test.ts` lists every field of the handler state; the pacing gate joined its not-session-owned list.

## Phase 4, finished dApp roots kept

- The transport test counts forwarding on the SDK listener under fake timers, and `vi.setSystemTime` moves the bucket's clock without firing the discovery flow's timers.
- The batch test needs no PXE: `getChainInfo` reads only `getNodeInfo`, so the real dispatcher, `ExecutionService` and `TaskService` run with a canned node.

## Phase 5, two local changes

- The identity check reads `getPendingDiscovery`, so a handler stand-in without it throws in every approving test. Each wallet-sdk stand-in answers it with the object last handed to `onPendingDiscovery` and never removes a row; its `approveDiscovery` still decides whether an approval lands, so every earlier test keeps its meaning.
- A test of the reconnect site needs the queued handshake's own row gone and another tab's row pending under its id when a verify window frees; the other tab is on another site, so its discovery waits on a connect window and is not itself admitted.
