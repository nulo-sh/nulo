# fetch-fee-window-1 recon

Base: `origin/dev` at `3af5f7840`. One reuse sweep (Explore, sonnet) plus the planner's own reads. Paths are under `apps/extension/src/` unless they name a package.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Private fetch options (no cookies, referrer, HTTP cache; redirect refused) | Inline in `wallet/services/token-list/service.ts:211-218` (all four) and `wallet/services/price/service.ts:373-380` (no `redirect`). No helper anywhere. | build new: `privateFetchInit` in `packages/wallet-core/src/utils/` beside `read-capped.ts` |
| Capped body read | `packages/wallet-core/src/utils/read-capped.ts` (`readBodyCapped`, `ResponseTooLargeError`), barrel `utils/index.ts:20` | reuse as is |
| Bounded fetch-and-read helper (`fetchBoundedText`) | none; searched `fetchBounded`, `fetchText`, `readBodyCapped` callers (3: the two services and `packages/aztec-runtime/src/utils/fetch.ts:63`) | not built (plan D2) |
| Source-scan test | `utils/price-refresh-ban.test.ts`, `wallet/services/legal/call-sites.test.ts`, helpers `scripts/type-roles/source-scan.ts` (`REPO_ROOT`, `sourceFiles`) and `source-code.ts` (`codeLines`) | adapt |
| Wrong-profile guard | Inline in `popup/windows/execute/index.vue:329-333` and `popup/windows/fee/index.vue:125-128`; no typed error (searched `WrongProfile`, `ProfileMismatch`, `wrong profile`, `otherProfile`) | build new: `assertRequestProfile` + `WrongProfileError` |
| Wrong-profile end remap | `execute/index.vue:314` and `:542-543`; absent in `fee/index.vue:103,304` | build new: one rule beside it |
| Short-lived account and network clients | `execute/index.vue:322-375`, `fee/index.vue:119-147` (both disconnect in `finally`); `resolveOperations` in `execute/operation-display.ts:21` | adapt: `resolveForProfile` wraps it |
| Decode-or-unavailable for calls | `execute/display-calls.ts:51` (`undecodedAll`); copies at `execute/index.vue:443-455`, `fee/index.vue:151-162`, `execute/operation-display.ts:84-92` | adapt: `decodeCallsOrUnavailable` |
| Decode-or-unavailable for grants | `readableGrants` (`execute/call-surface.ts`); copies at `execute/index.vue:415-429`, `fee/index.vue:166-176` | adapt: `decodeGrantsOrUnavailable` |
| JSON window opener | `execute/index.vue:585-590`, `fee/index.vue:217-222`, `components/JsonViewer/JsonViewer.vue:87-92` (rendered only with a `requestId`, which no caller passes: `DataViewerPopup.vue:33`, `windows/json/index.vue:58`). Window utils: `utils/own-window.ts` (`moveToOwnWindow` moves the popup itself), `utils/close-current-window.ts`; neither fits | build new: `utils/json-window.ts`; delete the unreachable opener |
| Approval window shell | `composables/useDappApprovalWindow.ts` (connect and disconnect lists, `beforeunload` close, profile guard) | reuse as is, unchanged |

## Conventions

- wallet-core utils: one module per concern, `export *` in `utils/index.ts`, colocated vitest (`bun --bun vitest run`).
- Service tests inject `fetchFn`; price via its harness (`price/service.test.ts`), token list via a composition harness (`token-list/service.composition.test.ts`).
- Window component tests mock every client with `vi.mock` and the payload hook (`fee/index.test.ts:62-200`; `execute/index.test.ts` with `tests/helpers/approval-window-harness`). Execute already pins its wrong-profile endings (D13, D14, D14-lock at `execute/index.test.ts:343-406`); fee pins only the overlay (`fee/index.test.ts:330`).
- Captures for a PR: PNGs under `implementations-plan/<plan>/screenshots/`, linked by raw URL at a commit SHA (PR #1480).

## Tests and e2e that guard the area

- Unit: `price/service.test.ts:123` pins `cache`, `credentials`, `referrerPolicy`, not `redirect`; `token-list/service.composition.test.ts:106-120` pins all four.
- Live: `price/real-data.test.ts` (`COINGECKO_REAL_TESTS=1`, local only) fetches the endpoint with no options.
- Smoke e2e: `tests/e2e/token-list.test.ts:100` asserts no cookie, referrer or cache validator on the wire.
- Network e2e: `tests/e2e/network/tx-sendTx-default.test.ts:128` drives a dApp send through the fee question; `tx-sendTx-reject.test.ts:65` presses `execute-show-json-btn`; `hero-prices-unavailable.test.ts` drives the price failure path with CoinGecko refused.

## Collisions

- Open issues touching `execute/index.vue` outside these lines: #1417, #1494, #1495 (fee rows, preview retry), #1380 (argument rendering). #1472 overlaps this lane (plan D10). #1464 touches the token-list seeding through config, not the fetch.
- No closed `known-limit` issue matches `fetch redirect` or `wrong profile fee window`.
