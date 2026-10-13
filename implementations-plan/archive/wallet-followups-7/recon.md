# Recon: wallet-followups-7

Base: `origin/dev` at e900f710 (carries #347's dispatch hold and #353's ingress byte budget). Two Explore agents on Sonnet (a reuse sweep and a pipeline-depth measurement), then the planner read every cited line. Paths are repo-relative; `ext/` is `apps/extension/src/`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Canonical address spelling | `AztecAddress.fromStringUnsafe(x).toString()` already built in `parseTokenInterface` (`ext/wallet/services/token/service.ts:682`); `fieldAddressKey` / `sameFieldAddress` in `packages/wallet-bridge/src/field-address.ts:16-31` | reuse-as-is: the parse's own `AztecAddress`; no new normalizer (searched `canonicalAddress\|normalizeAddress\|canonicalize` over `apps packages`) |
| Every add path through one parse | popup `NewTokenPopup.vue:191` → `addToken`; dApp `execution/service.ts:962` → `addTokenAuthorized`; seeder → `previewTokenMetadata` (`service.ts:755`) → `addSeededToken` | reuse: canonicalize once in `parseTokenInterface` |
| Token lookup by contract | `findToken` `service.ts:811-813` (`===`); 14 other `contract ===` sites (`tx-amount.ts:49`, `tx/[id].vue:82`, `received-display.ts:65`, `activity-rows.ts:91`, `RecentActivityView.vue:139,506`, `app.store.ts:614`, `incoming-transfer/service.ts:2483`, `balance-identity.ts:17`, …) whose other side is a canonical `toString()` or another stored row | adapt `findToken` only; canonical storage fixes the rest |
| Per-session cap + refusal | `MAX_HELD_PER_SESSION = 32` and `Hold.admit()` (`ext/wallet/services/wallet-sdk/verification-hold.ts:22,57-62`); `refuseOverHeldCap` (`background.ts:625-638`) answers `TooManyPendingError` (-32005, `error-envelope.ts:162-171`) at `debug` | adapt: the count stops at settle today |
| Per-session decrypt serializer | `serializeDecryption` (`background.ts:716-722`) over `KeyedLock` (`packages/wallet-core/src/utils/keyed-lock.ts:28`); `Lock.queue` is private (`lock.ts:19`), no depth getter | adapt (see plan D3) |
| Leak-proof "call settled" point | `chainSendTxWithVouching` returns `handlerChain`, which settles on every path, `run` called or not (`queued-wait-vouching.ts:15-37`) | reuse-as-is |
| In-process ingress harness | `background.connect-window.test.ts` (mocked handler, `h.send` → `onWalletMessage`, the 32-held test at :936); `background.transport.test.ts` (real handler, real key exchange) | reuse: extend the first |
| Token add composition harness | `ext/wallet/services/token/service.composition.test.ts` (8 `parseTokenInterface` cases over a fake PXE) | reuse |

## Measurements

- **Deepest legitimate pipeline in the tree: 5 calls in flight per session** (`apps/extension/tests/e2e/network/concurrency-rapid-fire.test.ts:26-34`, five unawaited `getChainInfo` clicks). The playground awaits each call (no `Promise.all`, no polling in `apps/playground/src`); `concurrent-sendtx.test.ts` puts 2 in flight; `send-chaos.test.ts` awaits its actions one by one. The SDK's batch is sequential and its PING is a plain control message outside the decrypt and dispatch queues.
- Existing bounds: `MAX_HELD_PER_SESSION = 32` (unconfirmed sessions only; its own record says "no data"), `EXECUTION_ORIGIN_CAP = 8` and `EXECUTION_LANE_CAP = 32` (`ext/wallet/services/execution/execution-lane.ts:110-111`), `MAX_QUEUED_PER_SESSION = 8` queued rows (`queued-journal.ts:47`), `RECONNECT_TOKENS = 3` per origin per 20 s (`verify-admission.ts:22-23`).
- **#354 probe (demonstrated in-process, 2026-10-13).** The connect-window harness, run from a scratch copy outside the repo: a trusted (no-check) session, the head call held in dispatch the way a call waiting on a person is, then 64 calls each carrying a distinct 4 MiB argument. Result: 1 dispatched, 63 waiting, 0 refused, heap +256 MiB after a forced GC. Same shape at the decrypt stage (head decrypt held, 64 × 4 MiB ciphertexts): 63 waiting, heap +252 MiB, back to +4 MiB once drained. Retention is linear in the count; the browser's own arrival rate was not measured.

## Collisions and absences

- `NewTokenPopup.vue:44` duplicates the duplicate check with `t.contract === v` on the typed value (a visible message; see `OWNER-ASKS.md`).
- Backup restore writes token rows verbatim (`service.ts:913-934`, `TokenSchema.contract` is `z.string()`), and balance rows copy the token's spelling (`balance-identity.ts:17`): canonicalizing one table at restore would split the pair.
- No network e2e asserts an Activity mint figure (searched `mint_to\|txAmount\|activity.*amount` under `apps/extension/tests/e2e/`); #334 proved it with unit tests plus `token-add-auto-trust` and `holdings`.
- No closed `known-limit` issue covers either area (searched "token address case", "secure message queue memory session").
- Not in the lane: #322, #349, #338, #339–#341, #103, #108, #112, #172, #118, #188, #218, #219, every `owner-decision` and `blocked:external` issue.
