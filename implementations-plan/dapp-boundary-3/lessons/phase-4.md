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

## Review

- Codex round 1 (`approve`) and Opus (`conditional approve`): one wording item, the same from both legs, applied in the second arc commit; plan.md § Review verdicts.
- Cross-arc pass (fresh Codex session over both arcs): plan-wording conditions only, applied; `approve` at its second resume.

## `cap-window`, 2026-10-18 (retry 0)

- At the arc's head: Chrome 4 of 5 pass, Firefox 1 of the 4 it runs (reduced motion is Chrome-only). Every failure is one cause: the line under the address row adds 12 px, so the busiest first window (transactions on listed contracts, unrecognized-contracts note) scrolls at 400 × 800 (scroll height 699 vs 687), and on Firefox the scrolling area becomes a Tab stop the two Tab-order tests do not expect. A layout change, so OA-7.
- Measured, uncommitted: the sections 16 px apart instead of 20 px. Chrome 5 of 5, Firefox 4 of the 4 it runs, no test edit.

## OA-7 = B (P45-01), 2026-10-18

- `cap-window` re-pinned, no product change: the fit test pins S2's overflow at exactly 12 px and checks both ends (the hostname in view at rest; Details whole at the end of the scroll; the Confirm row below the area and inside the window; the page never scrolls; the note taller than the overflow, so S1 fits); both Tab-order tests expect Firefox's scroll-area stop first.
- After merging `origin/dev` (18d29f23), retry 0: Chrome 5 of 5 (file 78.9 s), Firefox 4 of the 4 it runs (file 92.5 s).
- Codex (arc session, resumed on the re-pin): `conditional approve`. Accepted: both edges of every box against the area's visible part, the area inside the window, the scroll offset compared to the subpixel, the window measured once its swapped-in fonts load, OA-7's record of where the stop sits, and a suite comment cut to the constraint it keeps. Retry 0 after: Chrome 5 of 5 (file 61.7 s), Firefox 4 of the 4 it runs (file 78.4 s).
