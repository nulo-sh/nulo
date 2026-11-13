# fee-method-emoji-1: recon

Read at `dev` `4fd3d8fcc` (after #1808). One Explore sweep (sonnet) plus the planner's own reads.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| A filter for emoji and check marks | `stripPictographs`, `apps/extension/src/utils/string.ts:94` (`KEYCAP`, `PICTOGRAPHIC`). No second emoji regex: a grep of `apps/` and `packages/` for `Extended_Pictographic`, `\p{Emoji`, `1F300`, `1F600` hits only `string.ts`, its test and a test in `packages/extension-messaging`. | reuse as is |
| The app's display label | Inline in `appChipOf`, `apps/extension/src/components/composite/contract-chip.ts:132`: `sanitizeWireString(stripPictographs(name), 64)`, no chip when it trims to nothing. No named helper. | adapt: extract `appLabelOf` (plan D1) |
| The card's name | `OperationCard.vue:186`: `safeWire(props.dapp?.name, 64) \|\| "the app"`; `safeWire` (`execute/humanize.ts:45`) is `sanitizeWireString` or `""`. | adapt: read `appLabelOf` |
| Control strip and cap | `sanitizeWireString`, `wallet/services/dapp-session/capability-meta.ts:161`: strips `\p{Cf}`, variation selectors and C0/C1, then caps at `maxLen` code points with "…". The chip strips before it caps; no test pins that order (`ContractChip.test.ts:224` passes either way). | reuse as is |
| Component fixtures for the fee row | `OperationCard.fee.test.ts:340-541` (dApp "Swap", wire-shaped app-paid operations, the estimate, legend and failed states, the nameless fallbacks at :525-530). No emoji-named fixture outside `ContractChip.test.ts:218-226`. | reuse: add cases there |
| e2e reading the row | `tests/e2e/network/fee-sponsor-funding.test.ts:291-366`: the sentence by regex (name captured, not typed), the legend's absence, a layout check that overwrites `execute-op-app-name`, the History row `Sponsored, set by ${app}`. The playground declares `nulo-playground` (`apps/playground/src/lib/wallet.ts:23`). No smoke spec reads the row's words. | unchanged; regression gate |
| Capture fixtures | `src/e2e/execute-fixture.ts:20-31` (no emoji name, no failing or empty estimate; `execute/index.vue:263-264` always resolves the fixture's estimate). #1808 patched it for captures and never committed the patch. | capture-only patch (plan D5) |

## Where the declared name prints

| Site | Today |
|---|---|
| `OperationCard.vue:415, 418, 426, 430` (the fee row) | `safeWire`, emoji kept: this lane |
| `appChipOf` (execute and discover windows) | label stripped; press quotes the whole name |
| `tx-detail-helpers.ts:67, 75` (History "Fee method") | as stored, emoji kept: `OWNER-ASKS.md` A1 |
| `tx-enrichment.ts:155` (History "App"), `DappIdentityBlock.vue:30`, connected-apps pages | as stored or `sanitizeWireString`; out of scope, the owner has not seen them with this rule |

## Claims that did not hold

- The brief says the legend shows "otherwise (the failed or unestimated row)". The failed row draws "Fee", "Set by \<name\>" (or "Private Fee Juice · set by \<name\>") and the readout "\<name\> pays" / "You pay"; the legend shows only with no estimate, none running and no failure (`OperationCard.fee.test.ts:425-447`). The plan strips the method line and leaves the label to A2 (D2).

## Open work

- `gh issue list --state all --search "pictograph"`: none. `--search "emoji"`: connection-check and password issues; the one open hit, #605 (a wallet-sdk disconnect), is unrelated. No matching open issue was found; no `Part of`.
- Closed `known-limit` in the area: #792 (a sentence-shaped dApp name read as part of the fee row's words). It is not about pictographs; the plan's Security section says what stripping adds.
