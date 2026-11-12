# fee-window-1 recon (at `1593cf027`)

One Explore sweep (sonnet) plus direct reads. Paths are repo-relative; `send/` is `apps/extension/src/popup/components/modules/send/`.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Fee figure and its grammar | `utils/fee-estimation.ts:112-131`: `FeeDisplay`, `feeDisplay`, `feeFigure` (`~X FJ`), `feeText` (`~X FJ ($Y)`); `components/composite/FeeAmount.vue` renders the grammar and takes its role from the caller's class | reuse-as-is |
| The fee's own role | `send/FeeCostReadout.vue:120-129`: `.fee_value` composes `type--meta` (13 px mono) in `--txt-primary`, `.fee_usd` composes `type--fiat` at 11 px in `--nulo-secondary`; the approval window's fee row | reuse the same roles (D1, D9) |
| Strikethrough a fee, spoken as words | `send/FeeCostReadout.vue:85-95`: the sponsored row strikes the fee in `<s>`, marks the visual `aria-hidden` and speaks a `visually_hidden` sentence ("Screen readers skip a strikethrough") | adapt (same pattern) |
| Visually hidden text | `send/fee-shared.module.css` `.visually_hidden` | reuse-as-is |
| Amber dot | `popup/components/modules/settings/endpoints/EndpointStatusDot.vue`: 7 px round span, `aria-hidden`, amber is `var(--yellow)`; carries `data-testid="endpoint-status-dot"`. No dot glyph in `packages/design/src/core/glyphs.ts`. `token-contract.ts` names `--yellow` as `amber` in `textColors` | build new, 5 CSS lines (D4) |
| A `detail` type role | none: `packages/design/src/token-contract.ts:130-153` has `caption` (body 11/400), `meta`, `fiat`, `time`, `button-md` (13/700, upper), `button` (14/700), no `detail` | use `caption`, as the signed frames do (D6) |
| A two-line button | `components/composite/DappApprovalFooter.vue`: `confirmDetail` prop, `.detail { display: block; margin-top: 4px }`, read with the label as one name; only consumer `windows/fee/index.vue:302` | adapt |
| Button growth | `packages/design/src/ui/Button.vue`: `.medium { min-height: 40px; padding: 0 14px }` (no fixed height), `.wrapper { white-space: nowrap; overflow: hidden }` | reuse; the detail line opts into wrapping (D7) |
| Fit proof in a browser | no smoke spec or fixture opens the fee window (`grep fee-raised\|fee-confirm\|windows/fee` over `apps/extension/tests`, `scripts`); the armed execute fixture (`src/e2e/execute-fixture.ts`) serves only the execute window. `network/tx-sendTx-default.test.ts:146-237` opens the real window over the sandbox | extend that spec (D8) |
| Captures | `tests/e2e/fixtures/shots.ts` `shotSend` (both themes under `NULO_E2E_SHOT_DIR`); the spec already shoots `fee-window-raised` | reuse-as-is (D10) |

## Readers of what changes

- `send/FeeRaisedCard.test.ts`: `fee-raised-method`, `fee-raised` ("Fee went up"), `fee-raised-was`, `fee-raised-now`, `fee-raised-priority`, the block's child order.
- `windows/fee/index.test.ts:210-244`: the same ids, `fee-confirm-btn` text, `dapp-approval-confirm-detail`.
- `components/composite/DappApprovalFooter.test.ts:84-93`: the detail and the one-name `textContent`.
- `tests/e2e/network/tx-sendTx-default.test.ts:182-203`: `fee-raised` visible, `Was …`/`Now …`, `fee-raised-method`, `Send for ${pinnedFeeText(fee)}`, the shot.
- `apps/extension/scripts/type-roles/surfaces.expected.json:347-353`: inventory id `windows-fee`, state label "fee went up" (a label, not copy; unchanged).
- Out of scope, untouched: "Fee went up. Review" on Home/History (`RecentActivityView.vue:353`), `SendReviewSheet`, the execute window's Confirm.

## Open work

- `gh issue list --state all --search "fee went up"` and `--search "Send for"` (2026-11-12): no open issue owns P116-20 or P116-21. #1796 (review sheet toast) and #1336 are other surfaces. Page 116 names #1571 for both items: closed, and it records other questions (the execute window's six). No `Closes`, no `Part of`.
- Closed limits: #381 (`known-limit`): the Send page's re-ask line can show the new fee and the cap as the same six-decimal figure. It does not reach this window, which asks only on a rise of at least one readout unit (`fee-reask.ts` `feeRiseAsks`).
