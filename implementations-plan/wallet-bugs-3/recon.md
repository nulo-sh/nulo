# wallet-bugs-3 recon

One sonnet explorer (the two UI issues) plus the driver's own trace of #1627, at base `4b250dfe4`.

## #1627, balance batch failure loop

- `apps/extension/src/wallet/services/token-balance/balance-job-queue.ts`: `syncBatch` (236-265), `failBatchOnProjectorError` (422-440), `releaseOwnedTaskPointers` (442-451), `writeSyncFailure` (208-234).
- Throw sources inside `writeSyncFailure`: `repo.get`, `repo.prepare` (`WalletLockedError` when the profile has no row keys, `apps/extension/src/wallet/storage/sealed-entity-storage.ts:213-217`), `commit` (`whileHeld` rejects when the keys changed, `:259-261`), and the emit. Row keys are kept across lock and switch (`profile/service.ts:318-324`).
- Tests: `balance-job-queue.test.ts` has no projector-throw case; its `makeTaskService` mirrors the real "finishing a finished task throws". `balance-job-queue.order.pins.test.ts` pins the success path's order only.
- Scratch reproducer at the base: one `failTask` call for a two-row batch, the other task unfinished, both pointers released (demonstrated, then reverted).

## #1653, execute payload row

- `apps/extension/src/popup/windows/execute/OperationCard.vue:392-403` (template), `.row` (866-875), `.call_row > *` (877-881), `@media (width < 359px)` (915-931); house idiom `.leaves_count { flex-shrink: 0; white-space: nowrap }` (792-795).
- `AddressDisplay.vue`: `meta` role (mono 13 px), `trimAddress` 8+4 glyphs, or `@<contact>` / account name; names capped at 25 in the UI (`utils/contact-name.ts:9`, `NewAccountPopup.vue:125`, `EditAccountPopup.vue:109`).
- `OperationCard.long-strings.test.ts`: wire-shaped fixtures (`0x` + 64 hex), postcss `declarationsOf` helper, call-row case at 136-140.
- `tests/e2e/network/type-roles-windows.test.ts`: `payloadPastCard` (305-322), `stretchPayload` sets the title to 64 glyphs and the caption to 25 W (325-343), `contained` branch (414-420), `shot` capture through `NULO_E2E_SHOT_DIR` (`tests/e2e/fixtures/shots.ts`).
- Prior decision: type-roles E1 made the call row's caption breakable to keep long text inside the card (archived `type-roles/plan.md`).

## #1535, fee priority row

- `apps/extension/src/popup/components/modules/send/FeePriorityRow.vue` (76 lines, plain JS, `modelValue` + `update:modelValue`); test `FeePriorityRow.test.ts` (5 cases); parent `FeeSettingsCard.vue:163,508`.
- The one house roving tablist: `apps/extension/src/components/composite/AuthMethodTabs.vue` (native `button role="tab"`, `aria-selected`, roving `tabindex`, ←/→ only, `nextTick` focus), test `AuthMethodTabs.test.ts`. No shared roving helper exists; nothing in `packages/design` implements tabs.
- Focus ring precedent for tabs: `onboarding/pages/create.vue:317-339`; `button { outline: none }` globally (`packages/design/src/base.css:237-242`).
- e2e touching the row: `send-keyboard.test.ts:373-392` (hover border), `network/popup-escape-layered.test.ts:173-201` (`page.focus` + Enter), `fixtures/send-burst.ts:50` (click).
