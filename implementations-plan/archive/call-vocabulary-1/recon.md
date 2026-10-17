# call-vocabulary-1: recon

Read at `2c0df3b9` (`origin/dev`). One Sonnet explorer (reuse sweep, eight capabilities) plus the driver's read. Paths are relative to `apps/extension/src` unless they start with `apps/`, `packages/`, `scripts/` or `implementations-plan/`.

## Issue claims checked against the tree

| Issue | Claim | Holds? |
|---|---|---|
| #514 | `getTxCategory` calls any `transfer*` a transfer and any `mint_to_*` a mint, on any contract | Yes: `utils/tx-enrichment.ts:105-110`. `getTxTitle` returns "Transfer" / "Mint" (`:117-124`). |
| #514 | The window recognizes exact `(name, arity)` signatures, mints only `mint_to_private` / `mint_to_public` | Yes, and more: the window also requires a registered token, a decode, and the selector and ABI roles to corroborate (`popup/windows/execute/call-surface.ts:104-132`). Its title rule is `rowTitle` (`:144-148`). |
| #514 | Amount extraction also counts `mint_to_commitment` | Yes: `utils/tx-amount.ts:11`. |
| #514 | "Mint to:" is on the detail page | No: the approval window prints it (`popup/windows/execute/CallArguments.vue:65`), as the lead's report corrected. "Mint amount" is the detail page's (`popup/pages/tx/[id].vue:215`). |
| #514 | Callers at `TransactionCard.vue:43,99`, `tx/[id].vue:68,74` | Moved: `TransactionCard.vue:44,102`, `tx/[id].vue:68,74`. The detail page's Calls box names each call with `humanizeMethodName(c.method)` at `:362`, no contract. |
| #575 | The grant card's `call`, `encoded_call` and `add_public_authwit` rows title by `humanizeMethodName` on the name alone | Yes: `popup/windows/execute/OperationActionRow.vue:20,33,47`, no contract either. Only the `add_public_authwit` `call` content is reachable: the bridge's one producer of `send_transaction` hardcodes it (`packages/wallet-bridge/src/dispatcher.ts:657`), and nothing produces `simulate_transaction`. |
| #516 | Two copies of the toggle in the execute window | No longer: `popup/windows/execute/DetailsToggle.vue` is shared by `CallArguments.vue:133` and `OperationCard.vue:279,333` (the code-only half already shipped). The remaining gaps hold: no `aria-controls`, no reduced-motion rule (`DetailsToggle.vue:6,25-31`). |

## Reuse map

| Need | Existing code | Verdict |
|---|---|---|
| The window's title rule | `rowTitle` (`call-surface.ts:144`), `tokenMovementLabel`, `plainMethodName`, `humanizeMethodName` (`utils/tx-enrichment.ts:39,67,72`) | adapt: lift the rule into one `callTitle(method, contract, read)` beside its parts; `rowTitle` delegates |
| "The wallet read this settled call as a transfer or mint" | `transfers` on a call, written only by the wallet's own send (`wallet/services/execution/transfer-executor.ts:458`); the mint gate in `txAmount` (listed token, recorded class equal to the token's, arity 2; `utils/tx-amount.ts:29-53`); `findTransferSignature` (`utils/token-transfer-vocabulary.ts:60`) | adapt: factor the listed-and-pinned token lookup out of `txAmount`, add the transfer signature beside it |
| A settled call's method is bound to what ran | `tx-request-builder.ts:198-216` records the artifact's name (by selector for an `encoded_call`) and the called class; the default-entrypoint path records the dApp's name and no class (`:460-464`) | reuse: the class pin excludes the unbound path |
| The grant's reading | `grantRows` in `OperationCard.vue:148-157`, one `CallSurface` per `add_public_authwit`, in action order | reuse: pass each action its grant's reading |
| `aria-controls` with a parent-owned panel | `CapabilityDisclosure.vue:10,19,27` (`useId`, `aria-controls` only while open); its test `CapabilityDisclosure.test.ts:63-67` | reuse the form |
| Reduced-motion pin | `utils/a11y-css.test.ts:13-29` (`reducedMotionRules`); rule form `CapabilityDisclosure.vue:82-86` | reuse |
| In-flight titles | `utils/journal-state.ts:457`, `RecentActivityView.vue:189`, `pages/journal/[id].vue:79,105`: `humanizeMethodName(title)`; the journal record keeps no contract (`wallet/services/operation-journal/spec.ts`) | out of scope (plan D5) |

Absence trail: no other settled-side classifier (`grep -rn "getTxCategory\|=== \"mint\"\|\"faucet\""`); no test asserts the activity glyph; no e2e asserts "Mint", "Minted", "Mint (", "Transfer Ownership", or a settled dApp row's title (`grep -rn` over `apps/extension/tests`). The e2e that read titles read the journal's (`network/scope-refusal.test.ts:131-139`) or the createAuthWit window's (`network/tx-transfer-row.test.ts:107`, `network/tx-sendTx-delegated-authwit.test.ts:103`); none changes.

## Pins the change must keep

- `scripts/type-roles/identifier-sites.expected.json:42,64` quote two comments of `OperationActionRow.vue` as evidence: keep both texts verbatim. Entries for `tx/[id].vue` key on branch texts such as `tx && userCalls.length`: keep those branches.
- `utils/copy-dash-ban.test.ts`: the " — spender " / " — consumer " / " — message hash " texts in `OperationActionRow.vue` are reviewed as they are; the change does not touch them.

## Collisions

- `popup/pages/tx/[id].vue`: fees-display-1 edits its fee row (`TxFeeRow`, `:91-124,301-313`); this lane edits the header title, the Calls box and the token load (`:68,74,82,362`).
- `popup/windows/execute/OperationCard.vue`: fees-display-1 (fee card) and consent-display-1 (label marking) may edit it; this lane adds one computed and one prop binding near `:148-157,255`, and two `controls` bindings at `:279,333`.
- Merge `origin/dev` before the PR. No closed `known-limit` issue covers the area (`gh issue list --state closed --label known-limit --search "label activity title vocabulary"`).
