# Behaviour alignment: the dedupe program's owner calls

## Outcome

- **Date**: —
- **Status**: completed in part.
- **Shipped**: Four of the five behaviour changes the [harden-dedupe](../harden-dedupe/plan.md) program left to the owner, and the deletion of a never-wired activity protocol: History scoped by network (`apps/extension/src/utils/activity-rows.ts`), contact-name uniqueness on the trimmed name (`apps/extension/src/utils/contact-rules.ts`), `new-password` autocomplete on two password pairs, and reduced motion with a visible toolbar focus ring (`apps/extension/src/popup/pages/toolbar-button.module.css`).
- **Open items**: an edited Local Network that reads "InvalidChain" and drops out of full backups, plus the smaller neighbours found along the way, tracked in [follow-ups](../../follow-ups.md).
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The program kept every refactor behaviour-preserving and set aside each user-visible change it found as an owner call. Each call was built to stand alone, one commit over test-only pins of what must not change, so any one could be dropped with the gates still green. The owner took four of the five, and the deletion:

- **History hides other networks' cancelled and failed operations**, by Home's rule: a row stamped with a network other than the active one is skipped, an unstamped row shows on every network, and with no active network nothing is filtered. Its transactions and incoming transfers were already scoped. No toggle and no new copy.
- **Contact names compare trimmed on both sides**, still case-sensitive, in the New and Edit contact popups. The contact service stays permissive, and the contacts import keeps its exact matching, since normalizing names at staging needs decisions of its own.
- **`autocomplete="new-password"`** on the import-full-backup and create-profile password pairs, as the other new-password forms already had.
- **Reduced motion and focus.** The OS reduced-motion setting stops the input shakes and the fee and amount shimmers; the toolbar buttons show RowAction's inset accent ring on keyboard focus.
- **The activity protocol is deleted**: the causal coordinator and its wallet-core model, which were never injected into the runtime. Profile siloing is live by other means ([account-profile-siloing](../account-profile-siloing/plan.md)).

An empty-amount change proposed with the History call was dropped: finished cards already hide an empty amount, and no production path writes one.

## Why

- History listed rows that its own detail page refuses as not found, while Home already hid them.
- The popups checked uniqueness on the raw input and saved the trimmed name, so "Alice " saved a second "Alice". Trimming both sides also catches stored names with outer spaces from imports and restores.
- On Firefox, whose login manager runs on extension pages, a saved password was autofilled into the field that sets Create profile's new password. With the token no new-password field fills, and a `current-password` field still does. Chrome's password manager does not act on extension pages, so Chrome shows no change.
- People who ask their OS for less motion still got shaking fields and sliding placeholders, and the base stylesheet's `button { outline: none }` hid keyboard focus on six toolbar buttons. A wrong password is still marked by its red alert and `aria-invalid`.
- Nothing imported, bundled or wrote the activity protocol's storage roots, so deleting it orphans no data.

## What shipped

- `journalRows` in `apps/extension/src/utils/activity-rows.ts` applies the same network check as `journalRecordInScope` in `apps/extension/src/popup/components/modules/general/RecentActivityView.vue`.
- `sameContactName` trims both sides; addresses still compare ignoring hex case. `apps/extension/src/popup/components/popups/EditContactPopup.vue` shows each field's "Already exist" once anything is edited, because either field's duplicate blocks the save: a blocked save always shows the warning behind it.
- `apps/extension/src/components/composite/import/ImportFullBackupForm.vue` and `apps/extension/src/popup/components/modules/settings/new-profile/NewProfileCredentials.vue` carry the token on both fields; the backup's decrypt field is unchanged.
- `prefers-reduced-motion: reduce` blocks sit in `apps/extension/src/components/composite/shake.module.css`, the export page's own shake (`apps/extension/src/popup/pages/settings/security/export/full.vue`) and both skeleton shimmers (`apps/extension/src/popup/components/modules/send/fee-shared.module.css`, `apps/extension/src/components/composite/send/AmountCard.vue`); `<Skeleton>` already honoured the query. jsdom evaluates neither media queries nor `:focus-visible`, so `apps/extension/src/utils/a11y-css.test.ts` pins these rules in their sources.
- `packages/wallet-core/src/activity/index.ts` exports only `packages/wallet-core/src/activity/scope.ts`, and `packages/wallet-core/src/utils/keyed-lock.ts` names only its live adopters.
- No copy, glossary term, test id, storage shape or migration changed.

## Lessons

### fixture-addresses

About half of all field elements are not the x coordinate of a Grumpkin point, so they are not Aztec addresses: no account can exist there, and a private transfer to one aborts in simulation with "Cannot resolve a constrained tagging secret for an invalid recipient". The wallet refuses such recipients and contacts through `isValidAztecAddress` (`apps/extension/src/utils/aztec-address.ts`), and placeholder addresses rarely pass it: `0x${"a".repeat(64)}` exceeds the field modulus, while `0x2${c.repeat(63)}` passes for `c` from a to f. Check every fixture address with `isValidAztecAddress` before a test depends on it.

### firefox-focus-visible

Headless Firefox reported a toolbar button as focused but not matching `:focus-visible` until its page took focus: Gecko matches `:focus-visible` only in the focused document. An e2e that asserts a keyboard focus ring on Firefox calls `BrowserDriver`'s `prepareKeys` first.
