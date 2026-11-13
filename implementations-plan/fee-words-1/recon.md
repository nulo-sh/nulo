# fee-words-1: recon

Read at `dev` `43970003b` (after #1809), by the planner; no Explore sweep (two strings through an existing function).

## Where the declared name prints in a fee line

| Site | Today | This lane |
|---|---|---|
| `OperationCard.vue:418, 429, 433` (the window's "set by" lines) | `appLabelOf`, stripped (#1809) | unchanged |
| `OperationCard.vue:421` (failed readout, "\<name\> pays") | `safeWire`, emoji kept | `appLabelOf` (P147-03) |
| `tx-detail-helpers.ts:67, 75` (History "Fee method") | as stored, emoji kept; an empty name prints nothing | `appLabelOf` (P147-02) |
| `tx-enrichment.ts:155` (History "App"), `appChipOf`'s press | as declared | unchanged, by the pick |

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| The app's label | `appLabelOf`, `contract-chip.ts:129`: `sanitizeWireString(stripPictographs(name), 64)`, `""` when not a string or blank. | reuse as is |
| Component fixtures | `OperationCard.fee.test.ts:534-579`: emoji-named app (`"Playground ✅\u{1F680}"`), the estimate, legend and failed states, the emptied-name test. `tx-detail-helpers.test.ts:162-214`: the "who chose the fee" table with origin "Foo". | reuse: edit and add cases there |
| e2e reading the lines | `fee-sponsor-funding.test.ts:353`, History's `Sponsored, set by ${app}`, `app` captured from the window's stripped sentence; the playground declares `nulo-playground`. Nothing reads the failed label. | unchanged; regression gate |

## Capture kit

#1809's capture-only kit, kept in the lane scratch of `fee-method-emoji-1`, never committed: `apply-fixture.py` adds an emoji-named, failing estimate shape to `src/e2e/execute-fixture.ts` and `execute/index.vue`; `apply-network.py` renames the playground's app id and bundle name to "Playground ✅🚀" (its `tx-detail-helpers` flag is dropped: the strip now ships); `fme-captures.test.ts` (smoke) and `fme-capture.test.ts` (network) shoot the frames through `shotSend` under `NULO_E2E_SHOT_DIR`.

## Open work

`gh issue list --state all --search "pictograph"` and `"emoji in:title"`: no open match. Closed `known-limit` "app name": #674 (a whitespace-only name, blank chip) and #792 (sentence-shaped names) are adjacent and stay closed; this lane reads "the app" for a whitespace name on both lines, as the chip already shows none.
