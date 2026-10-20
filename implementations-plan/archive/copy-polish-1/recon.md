# copy-polish-1 recon (at 993b3efc)

One Sonnet Explore agent plus direct reads. Paths under `apps/extension/` unless rooted.

## The failed token preview (#803)

- `src/popup/windows/execute/OperationCard.vue:504-510`: the failed preview is `<Flex :class="$style.prop" direction="column" gap="2">` holding the orange "Couldn't resolve token metadata" (`register-token-meta-error`) over the tertiary "Verify the contract address before approving.". No test pins either sentence (`index.test.ts:493-498` checks the state only).
- `OperationCard.vue:739-752`: `.prop` is the card's label and value row (`justify-content: space-between`, `padding-top: 12px`). Its nested `:last-child { text-align: right }` is a descendant rule, specificity (0,2,0), reaching every last child at any depth; a second `> :last-child` rule sets `min-width: 0` and `overflow-wrap: anywhere`. The preview's second line is the column's last child, so it is right-aligned. Shown in `implementations-plan/archive/consent-display-1/screenshots/window-after-light.png`.
- `OperationCard.vue:685-688`: `.group` is `width: 100%; padding-top: 12px`, "so nothing hangs off the right-aligned value column": the `.prop` box without the value column.
- `index.vue:111,660`: `tokenMetadataUnread` disables Confirm, so Reject is the only way out (the issue's claim holds).

## Every warning that shares the cause

- `OperationCard.vue:637-641`: the opaque authwit warning (`execute-authwit-opaque-warning`, about 70 characters) is the only child of a `.prop` row, so it is both first and last child and right-aligned; in a 400 px window it wraps, and the second line hugs the right edge.
- No other warning sits under a `.prop`. `ArgsNotice` (`CallArguments.vue:111-113,149`) sits in a column block, not a `.row`; `CallArguments` renders inside `.group` or `.call`, never `.prop`. `IncomingTrustPopup.vue:206` has no right-align rule. Repo-wide, `text-align: right` appears only on value classes (`TxFeeRow`, `detail-page.module.css`, `journal/[id].vue`, `tx/[id].vue`, `settings/display.vue`) and the two execute value columns.
- No element under a `.prop` sets its own `text-align`: `Text` has only an `align` prop adding `ta--<x>` (0,1,0), which the descendant rule would override; `AddressDisplay` and `OperationActionRow` set none. So collapsing the descendant rule into `> :last-child` changes no computed alignment today (text-align inherits from the value column).
- Not a warning, same misuse: the loading row (`OperationCard.vue:473-476`, a `Spinner` and "Loading token metadata…" in a `.prop` row; `Flex` sets no default `justify`, `packages/design/src/core/Flex.vue:58-60`) puts the text at the right edge.

## The restore warning (#746 OA-2)

- `src/components/composite/import/restore-warning.ts:27-36` (`heldAccountsText`) writes "… Add the network with chain ID 1337 to restore it." (plural "… to restore them."). Rendered by `ImportFullBackupForm.vue:49` on onboarding `src/onboarding/pages/import.vue:160-170` and the popup `src/popup/pages/import.vue:221-231`; `useRestoreAgain.ts:298` passes no held list.
- Exact-string pins: `restore-warning.test.ts:52,58,64,70,76,82`, `ImportFullBackupForm.test.ts:179`. The export page's "add that network again to restore it" (`full.test.ts:529-537`) is a different warning (OA-6, OA-7; out of scope).
- An imported account enters only from an account file (`src/popup/pages/settings/accounts/import.vue`, picker "Choose an account file"; no key paste field), so the clause names a file the person once held.
- #744 (closed `known-limit`): reopen "if … the owner picks wording for that case".

## E2E and pictures

- No e2e renders the failed preview or the held sentence. `network/authwit-variants.test.ts:123` opens the opaque window and approves it; `network/register-token.test.ts` and `network/type-roles-windows.test.ts:251` render the resolved card; smoke `restore-outcome.test.ts:248` and `import-errors-scroll.test.ts:228-258` assert `restoreWarningText(...)` with no held list, so they follow the change.
- `tests/e2e/fixtures/send-page.ts:224` `shotSend(page, name, focus)` writes both themes when `NULO_E2E_SHOT_DIR` is set. Chrome opens dApp windows at 400×600. Precedents: consent-display-1 copied a scratch spec into `tests/e2e/network/` for one run (an address no contract holds fails the read); backup-restore-1 captured the held warning with an uncommitted smoke spec that seals imported keys into an exported backup (`tests/e2e/helpers/backup-seal.ts`). Both committed their pictures under the plan's `screenshots/`.
- Smoke runs (`bun run test:e2e`) claim no ports; `agent.sh` runs only the network config.
