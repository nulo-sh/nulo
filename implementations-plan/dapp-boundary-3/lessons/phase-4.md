# Arc 2: Form B (P41-01 = B)

## What the tree said

- The address row has no switch: `buildGrant` grants a switchless row as requested, and the row showed only for `canGet === true` (new at `newAccountsRows`, held at `heldEntries`). "Shows for any accounts grant" in P38-08's option B would put the owner's title, "Let this app list all your accounts", on a grant that cannot list (the dispatcher answers accounts and `getAccounts` only for `canGet === true`), so that case is OA-6 and the row keeps its condition (D20).
- The row named the selected account through `heldAccounts`, which the dispatcher built (`heldAccountsOf`) only for this row; with the owner's title it has no reader and is removed end to end (D21).
- The accounts description in `CAPABILITY_LABELS` has no renderer today (`getSafeDisplay` callers read `label` and `shortLabel` only); it is reworded so no surface can disagree with the row.
- Removing `heldAccountsOf` moved `dispatcher.ts`'s digest, which `scripts/type-roles/identifier-sites.expected.json` pins for the `action_operations` unreachable branch. Re-attested before re-pinning: the dispatcher's one `send_transaction` producer still builds a single `add_public_authwit` action, and the pinned hits and evidence are unchanged.

## Guard-removal

- The panel's `canGet === true` back to `!== false`: "the listing line follows the grant" goes red (the `canCreateAuthWit`-only grant shows the line); restored green.

## Gate, 2026-10-18

`lint`, `typecheck:all`: exit 0. `test:all`: extension 13655 passed after the re-pin, wallet-bridge 783 (the six naming tests removed with their producer).
