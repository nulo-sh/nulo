# fee-copy-build-1: recon

No recon agents: the change map is the four prototypes' files plus the readout's callers, read directly at `0dc22a9c5`. fee-copy-1's notes (the render lane, local) hold the measurements; what this build relies on is restated here.

## The prototypes (local branch of the render lane, read by hash, never checked out)

- `4eeff67ab` W2: `AppFeeLine.vue`, the `.line` span removed and the stop made unconditional.
- `f8265d50f` U1: `contract-chip.ts` `uncheckedLines`, the name's line alone when a name follows.
- `6fc9d22da` M2: `pages/tx/[id].vue` splits the joined label at ", set by " into the method and a caption (`Text variant="caption" color="tertiary"`, 2 px below); the helper unchanged.
- `af51819d4`: the Fee method row as the App row (`align="start" gap="16"`, key `app_key`), today's words.
- `fc6cfe2cb` plus the spec commits up to `6bebf72b8`: the capture kit (a `pfpc` and `pfpc-long-names` fixture in `src/e2e/execute-fixture.ts`, `?estimate=running|failed` on the fixture route in `execute/index.vue`, the spec `tests/e2e/fc1-captures.test.ts`). Never shipped.

## Surfaces

- `AppFeeLine.vue` is mounted by `OperationCard.vue` for an app-paid operation; the name slot is `appLabelOf`'s label in the name role (`execute-op-app-name`).
- `uncheckedLines` feeds both unverified chips in `contract-chip.ts` (a contact-named one, `ownName`, and "Unknown contract"); the site press is `appChipOf`'s own lines.
- `describeFeePaymentMethod` (`tx-detail-helpers.ts`) has one consumer, `pages/tx/[id].vue:103`. Its labels: "Public Fee Juice", "Public Fee Juice (with claim)", "Sponsored", "Private Fee Juice", "External FPC", "Unknown (n)", "Set by {app}" (an app's method the wallet cannot prove, or a dApp row with no recorded chooser), and "{method}, set by {app}" for Private Fee Juice, Sponsored and Public Fee Juice (with claim) an app chose.
- `FeeCostReadout.vue` is mounted by `FeeSettingsCard.vue` (Send, the approval window's `OperationCard`, `ChangeAuthwitsRegistryPopup`, `RevokeAuthwitsPopup`) and by `OperationCard` directly with `failed` only. `amountTyped` is passed by Send alone.

## The readout's last branch on Send

- `useFeeEstimation`'s engine sets `isEstimating` true at `schedule`, before its debounce, so a sendable amount always shows the bar, the figure, the queued line or the failure.
- `requestEstimate` (`send.vue:832`) cancels, leaving no estimate, when: the Terms are not current; the address, side or fee settings are missing; `amountValidation` is not valid (`send-amount.ts`: `empty`, `decimalsUnknown`, `invalid`, a parse reason such as `tooManyDecimals`, `belowMinimum`, `balanceUnknown`, `exceedsBalance`).
- `exceedsBalance` (`send.vue:379`) counts only a read balance (`updatedAt !== 0`); the amount card then shows "More than your balance" (`AmountCard.vue:90`) and the button "Fix the amount" (`send-labels.ts`).
- An empty amount sets the button to "Enter an amount". In USD mode an unreadable dollar text writes an empty token amount (`AmountCard.vue` `scheduleConvert`), with the field's "Not an amount" hint; the Fee sheet covers the field, so no conversion runs while it is open.
- Tests reaching the branch: `send.integration.test.ts:1306` (amount cleared after a failed estimate), `:1373` (typed over the balance), `:1382` (a landed amount the balance falls below).

## E2E reading these surfaces

- `network/fee-sponsor-funding.test.ts:353-366` reads `tx-detail-fee-method` as `Sponsored, set by ${app}`; its sentence reads (`:301-321`) are the non-private branch, unchanged.
- `rows.test.ts` (the long-host case) and `type-roles.test.ts` (the tx-detail sweeps) open the History page of seeded dApp-origin rows (`feePaymentMethod` 0, no chooser: "Set by …", one line), so they cross the re-spaced row.
- No e2e spec reads the private sentence, `contract-chip-line` or the readout's caption.
