# naming-copy-1 recon

At `origin/dev` `0a659726c`. One Sonnet reuse sweep, plus the driver's own reads and the orchestrator's naming recon. `X` is `apps/extension/src/popup/windows/execute`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Which calls the wallet read | `callSurface` → `CallSurface.kind` (`X/call-surface.ts:137-152`); the mark's own test is `kind === "decoded"` (`X/SendTxSummary.vue:73`) | reuse as is |
| Where the window's copy lives | `RAW_TITLE`, `RAW_LINE`, `RAW_ADVICE`, `LABELS_TITLE`, `rawToggleLabel` in `X/call-surface.ts:239-291` | reuse: the helper goes beside them |
| Joining numbers as "1, 3 and 4" | `joinNames` (`components/composite/import/restore-warning.ts:102-105`) joins with an Oxford comma ("A, B, and C"), in an import module; `Intl.ListFormat` used nowhere (searched `ListFormat`, `" and "`, `joinNames`, `listed` in `apps/extension/src`, `packages/*/src`) | build new: a two-line local join; the owner's copy has no Oxford comma |
| Singular and plural | inline `n === 1 ?` everywhere (`rawToggleLabel`, `stale-network/copy.ts:111-112`, `AmountCard.vue:531`, …); no shared helper (searched `plural`, `=== 1 ?`, `.length === 1`) | follow the inline pattern |
| A caption line in the summary | `Text variant="caption" color="secondary"` (the mark itself); wrapped lines use `height="130"` (`SendTxSummary.vue:72,81`) | reuse |
| Component test harness | `X/OperationCard.summary.test.ts` (`mountCard`, `read`, `afterTheCalls`), `X/execute.fixture.ts` (wire-shaped calls, `HUB_DECODE`, `decodeFixture`), `tests/helpers/shown-text.ts` | reuse |
| A Fee Juice claim call | `CLAIM` in `X/OperationCard.selfpay.test.ts:11-19` (short `0x5` args), `fee-figure.test.ts:9-11`; constants `FEE_JUICE_CONTRACT`, `CLAIM_AND_END_SETUP_SELECTOR` (`packages/wallet-bridge/src/fee-payer.ts:14-17`) | adapt: same constants, 32-byte hex args |
| Light and dark captures | `shotSend` (`tests/e2e/fixtures/shots.ts:19`), opt-in by `NULO_E2E_SHOT_DIR`; `network/tx-sendTx-multicall.test.ts:68` shoots `execute-op-summary` over 3 and 7 playground transfers on a token it never lists | reuse |

## Reach

- `SendTxSummary.vue` has one consumer, `OperationCard.vue:44,303`. `OperationCard` renders in `X/index.vue:647` and in the fee-raised window, `popup/windows/fee/index.vue:258`, whose header reads "The request reads as it did at approval; only the fee block differs".
- No Storybook story renders either.

## Guards the change meets

- `utils/copy-dash-ban.test.ts`: the sentence has no dash.
- `utils/red-text-ban.test.ts`: `secondary` is not red.
- `utils/type-role-ban.test.ts`: `variant="caption"` is a role; no size, weight or font prop.
- `scripts/type-roles/inventory.test.ts`: keys `SendTxSummary.vue`'s `AddressDisplay` sites by file, expression and branch (`identifier-sites.expected.json:1345-1408`); deleting the mark's `v-else-if` leaves every recorded branch as it is. It runs in `bun run test`.

## e2e readers

- `execute-op-call-named` and "Named by the app": no e2e file (grep of `apps/extension/tests`).
- `execute-op-summary-call-head`: `network/tx-transfer-row.test.ts:88`, `/^Transfer \(public\) on /`, a read token: unchanged.
- `network/type-roles-windows.test.ts:287,326-328`: rewrites the title and contract text to test overflow; no text assertion on the suffix.

## Captures

`tx-sendTx-multicall.test.ts` sends three (then seven) `transfer_public_to_public` calls on the playground token, which the spec never lists, so each decodes and is unread: the line reads "…what these calls do." Its `shotSend` writes `multicall-3-summary.png` and `multicall-3-summary-dark.png`.

## Open work

- `gh issue list --state all --search "Named by the app"`: #1328 only.
- Closed known limits (`--label known-limit --search "named app summary"`): none in this area.
- #508 (closed) holds R1, which #1328 reopens on the owner's call; R2 = B and #556 (closed, known limit) stand.
