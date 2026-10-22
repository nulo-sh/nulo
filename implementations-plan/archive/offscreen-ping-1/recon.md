# offscreen-ping-1 — recon

Base: `origin/dev` at `5711a1bc3`. Two Sonnet explorers (a reuse sweep, an e2e and docs mapper), every claim below re-read by the planner. `OFF` = `apps/extension/src/wallet/utils/offscreen.ts`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| "This worker heard the document answer" | none: `OFF` holds `offscreenPromise`, `ensureInFlight`, `pendingClose`, `passSeq`, `documentEpoch`, `firefoxOffscreenFrame` (L10-13, 52, 130, 146, 178, 328). Searched `adopt\|heardFrom\|pongSeen\|lastReady\|healthCheck` over `apps/extension/src/wallet`, `packages/{aztec-runtime,extension-messaging,wallet-core}/src`. | build new: an answer token in `OFF` (plan D8) |
| Lifecycle points that change the document | `closeOffscreen` (L214), `createRetiringEarlier` (L255), `createOffscreenFirefox` (L295), `onOffscreenReady` (L92), the PONG acceptor in `isOffscreenHealthy` (L188) | adapt: issue or clear the token there |
| Per-request outcome on the worker side | `BaseServiceClient.settle` → `onTerminal(record, tag)` (`packages/extension-messaging/src/core/base-client.ts:273-289`); statuses `timeout`/`timeout_fired` (L143), `send_failed`/`sendMessage_threw` (L181-194), `success`, `rejected`, `disconnected` | reuse |
| A hook every PXE client shares | `PxeServiceClient` (`apps/extension/src/wallet/services/pxe/client.ts:64`) is the class all nine worker-side constructions use (`account-state`, `execution`, `fpc`, `incoming-transfer`, `note`, `network`, `profile-deletion`, `token-balance`, `token` via `shallow-port.ts:36`); `PxeServiceClientBase.onTerminal` (`packages/aztec-runtime/src/pxe/client.ts:206`) calls `super` first | adapt: override `onTerminal` in the extension subclass |
| Document epochs | `offscreenEpoch`, `onOffscreenRetired` (`OFF` L150-160), consumed only by `DEFAULT_PXE_CLIENT_FACTORY` (`execution/service.ts:149-153`) for abandoned simulations | leave alone: it moves on create start (L140-145), so it is not "the same document" |
| Typed transport errors | `RpcTimeoutError`, `RpcDisconnectedError` (`packages/extension-messaging/src/errors.ts:50, 69`); dApp mapping in `wallet-sdk/error-envelope.ts:131-154` | reuse `RpcTimeoutError` for the READY deadline |
| Late-answering document harness | none at any level. Closest: `packages/aztec-runtime/src/pxe/client-abandoned.test.ts` (never-settling `sendMessage`, `answerLate`), `OFF`'s test fake (`offscreen.test.ts:56-79`, listener bag + `deliver`) | build new, from those two |
| e2e that asserts no replacement | none. `pxe-host-state.test.ts` counts one visible host; `firefox-background-restart.test.ts` pins a new host after a background kill; smoke `sw-resilience.test.ts` kills the worker | no new scenario (plan D7) |

## What happens today

- **Every PXE request pings.** `PxeServiceClient.onReady` (`client.ts:81-83`) → `ensureOffscreenRunning` → `getContexts` (L308-317) → `isOffscreenHealthy` (L181-205, 3,000 ms, L15) → a miss closes through `trackedClose` (L352-355) and creates with a 10,000 ms READY budget (L16, L367).
- **A request already sent to a closed document is never rejected early.** Its pending entry settles only by its own timer (90 s default, `offscreen/client.ts:22`; 30 min for `proveTx`, `clearChainState`, `clearProfileState`, `aztec-runtime/src/pxe/client.ts:74, 141`), a response, a send failure, or `disconnect()`, which no production code calls. `retireEpochsThrough` touches only abandoned simulations.
- **A READY timeout rejects with a string.** `rejectOffscreenPromise("Offscreen is not responding")` (L116; typed `(reason: string) => void`, L13). It leaves `awaitReadyWithinDeadline` (`base-client.ts:295-313`) as the raw string, with no `onTerminal`. Traced callers: `AccountStateService.viaPxe` and `NoteService.readNotes` log it and throw `Error("PXE request failed")`; `NoteService.getSyncedBlock` returns it to the popup as `Error("Offscreen is not responding")`; the execution coordinator fails the task with the string, and `toWalletResponseError` gives a dApp the unclassified constant (`error-envelope.ts:214`) where a timeout gives `RPC_TIMEOUT`. No production code matches the text; `offscreen.test.ts` pins it at L262, 294, 335, 383, 426, 472, 574, 657.
- **Readiness-phase timeouts never reach `onTerminal`** (`base-client.ts:134, 295-313`), so they are not evidence about the document.
- **The keepalive is unused on the worker side.** The offscreen `Service` sends `OFFSCREEN_KEEPALIVE` every 20 s while it runs a request (`packages/extension-messaging/src/offscreen/service.ts:80-87`); nothing listens.
- **Chrome's document survives a worker restart; Firefox's frame dies with the background page** (`ARCHITECTURE.md` §6, L147). The first request after a Chrome worker restart therefore pings a document the new worker never heard.

## The broadcast guard

- `node.sendTx` is called once, in `ExecutionCoordinator.sendTxTask` (`execution-coordinator.ts:299`), pinned with its order by `wallet/services/legal/call-sites.test.ts:22-30` (scans `apps/extension/src` only).
- No code in `packages/aztec-runtime/src` sends a transaction: `pxe/service.ts:486-488` says so ("never a broadcast — `sendTx` lives on the node client"); grep `sendTx\|\.send(\|sendTransaction\|addTx\|submitTx\|broadcast` found nothing else.
- Retries on the PXE path all follow a typed refusal the service sent before running the op: store-key recovery (`aztec-runtime/src/pxe/client.ts:288-357`), scope registration (L268-278); the offscreen-side stale-anchor retry (`pxe/service.ts:486-492`) re-runs a prove, never a send. Nothing re-sends after a timeout or a transport failure.

## Sender gates (forgery surface)

- PONG and READY are accepted from `isLiveOffscreenSender` (`OFF` L71-76): this extension, URL path exactly `src/offscreen/index.html`; Firefox also needs the live frame's random `?instance=` generation. Chrome checks no generation (one document allowed).
- `src/offscreen/index.html` is not web-accessible: the source manifest declares none (`manifest.test.ts:63-65`) and `pxe-host-state.test.ts:38-46` checks the built one. A forged PONG needs code running in this extension.
- The document answers PING only when `servicesReady` and the sender is internal (`OFF` L88-90; `apps/extension/src/offscreen/index.ts:22-28`); READY is sent once, after init (`index.ts:113`).

## Tests to extend, and their traps

- `offscreen.test.ts` (3 describe blocks, 723 lines): module state is never reset between cases and there is no reset export; the microtask pin `probedAt` = 4 (L495), `getContexts` counted once (L90), PING sent / not sent (L595, L610). A case that models a zombie after an earlier case's READY needs the adoption cleared first.
- `pxe/client.test.ts` mocks `ensureOffscreenRunning` and spies `request`, so it cannot see terminals; `base-client-late.test.ts` (`HookedClient` recording terminals) and `client-abandoned.test.ts` are the shapes to copy.

## e2e and docs

- Recorded medians (`apps/extension/tests/e2e/shard-timings.json`, Chrome / Firefox): `incoming-transfers` 37 / 47 s, `execute-scope-account` 46 / 56 s, `pxe-host-state` 25 / 28 s, `firefox-background-restart` – / 41 s; smoke `sw-resilience` 58 / 59 s, `sw-restart-network` 19 / 23 s.
- No instrument for pings, closes or READY timeouts remains (pxe-limits-1 reverted its `globalThis.__pxl` probes).
- To update with the change: `ARCHITECTURE.md` §6 L144 ("If a document exists, it pings it via `isOffscreenHealthy()`…"). No README or skill describes the ping policy.

## Collisions

- **#399** (closed `known-limit`): a close could retire the epoch a concurrent create started; "reopen if … the offscreen lifecycle changes". This plan adds no close, create or epoch change, so it does not reopen it.
- **encryption-at-rest-1 A3** edits `incoming-transfer` and `token-balance` services; this plan touches neither construction site (the hook lives in the shared subclass).
- **fix-pxe-offscreen** (archived) accepted "the readiness check can recreate a document needlessly, which costs efficiency only"; #1035 shows it also fails work in flight.
