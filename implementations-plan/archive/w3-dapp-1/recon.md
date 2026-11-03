# w3-dapp-1 recon

One Sonnet explorer (read-only reuse sweep) at `ed30c2565`, plus the planner's own reads and two probe tests run on the base and then deleted. Paths are repo-relative.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Buffer a window removal that arrives before `create()` resolves | `apps/extension/src/wallet/services/wallet-sdk/verify-admission.ts:162,201-210` (`recentRemovals`, bounded 64, fed by a boot-time listener at `background.ts:139`) and `WindowReservation.adopt` / `consumeRemoval` (`:97-109`). Private to the gate, keyed by reservation. | adapt the pattern inside `WindowManager`, not the code (one listener per handle already exists) |
| Settle an awaited window on a person's close | `window-manager/window-manager.ts:128-142` subscribes inside the post-`create` continuation; `_settleUserClose` (`:223-234`). | adapt: subscribe at `openAndAwait`'s start |
| A test that holds `create()` while `onRemoved` fires for its id | `FakeWindowsAdapter` (`packages/wallet-core/src/testing/fake-browser-api.ts:208-270`): ids from 1000, `closeByUser` fires only for a live id. The parked-create tests (`window-manager.test.ts:304-338`) park *before* the real create, so the id is not live yet. | adapt: call the real `create` first, then fire `closeByUser`, then return |
| Decide whether a queued discovery is still live | `DiscoveryQueue.drain` (`packages/wallet-bridge/src/discovery-queue.ts:103-120`): gone, not `pending`, or `isDiscoveryExpired`. | reuse: extract the check into one private helper both `drain` and `enqueue` call |
| Discovery queue tests | `packages/wallet-bridge/src/discovery-queue.test.ts` (7 tests; `makeHandler(() => undefined)` answers every id as gone, a state production never has for a queued id; chrome badge stub). | adapt: a map-backed handler |
| Whole-print check of a decoded value | `printsWhole` and `readableGrants` (`apps/extension/src/popup/windows/execute/call-surface.ts:280-297`), grants only; `callSurface` (`:138-153`) does not apply it. | reuse for #1380 once OA-1 is answered |

## Facts the plan rests on

- **SDK** (`@aztec-labs/wallet-sdk` 6.0.0, `src/extension/handlers/background_connection_handler.ts`): `handleDiscoveryRequest` sets `timestamp: Date.now()` (the wallet's clock at receipt) and `Map.set`s by the dApp's `requestId`, so a resend of one id overwrites its row with a fresh timestamp (`:258-269`). `rejectDiscovery` drops a `pending` row and sends the dApp nothing (`:294-303`); only `approveDiscovery` messages the tab. `getPendingDiscovery` returns any status (`:453`).
- **Queue callers**: `discovery-flow.ts:120-122` rejects a request `enqueue` refuses; the comment at `:113-119` claims the queued first entry "drains on unlock". `background.ts:760-773` drains on `onActiveProfileChanged`.
- **Dedupe waiters** (`discovery-flow.ts:297-318`): a retry for a pair with a window up awaits that window's settle with no deadline of its own, up to 8 waiters, then is throttled.
- **`openAndAwait` consumers**: `dapp-interaction/service.ts:658` (every dApp window; `INTERACTION_TIMEOUT_MS` = 10 min, `spec.ts:61`) and `passkey/service.ts:158`. Neither compensates for a removal before `create`.
- **#941** (closed known-limit) covers a creation in flight across a worker restart: a different path.
- **Execute strings**: the stdlib decoder builds a `str<N>` one field per UTF-16 unit (`String.fromCharCode`, `@aztec-labs/stdlib` `abi/decoder.ts:90-96`); `call-decoder.ts:167` passes it on unsanitised; `valueText` strips through `safeWire` (`call-surface.ts:202-203`, `sanitizeWireString` at `dapp-session/capability-meta.ts:161`: `\p{Cf}`, variation selectors, C0/C1). A real contract's UTF-8 text arrives byte by byte, so its continuation bytes 0x80-0x9F are C1 controls the print strips.
- **Copy that exists**: `RAW_TITLE` "Can't read the arguments", `RAW_LINE.arguments`, `RAW_ADVICE`, `RAW_NOTICE.arguments` (`call-surface.ts:240-278`); a raw call opens its card's calls section (`OperationCard.vue:251-255`).

## E2E that drive the touched surfaces (no scenario added)

- Locked connect and its badge: `network/connect-locked-queue.test.ts`, `network/connect-locked-queue-sw-restart.test.ts`.
- Every dApp window kind through `WindowManager`: `network/window-placement.test.ts`; a refused connect window: `network/connect-deny.test.ts`.
- The passkey window through `WindowManager`: smoke `toolbar-panel.test.ts`.
- No e2e closes an approval window as its action, or renders a call string with stripped characters (searched `tests/e2e` for `WINDOW_CLOSED|closed by user|windows.remove|waitForPopupClosed|unverified-args|don't fit`).

## Open work

- `gh issue list --state closed --label known-limit` near these files: #941 (restart, above), #606 (verify-window slot), #771 (Allow across a switch), #371; none covers these paths.
- No open issue collides with the three.
