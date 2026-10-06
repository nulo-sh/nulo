# Frontend UX fixes

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: A batch of reported popup fixes: an initials avatar (`apps/extension/src/components/composite/general/AccountAvatar.vue`), a masked Send recipient card (`apps/extension/src/components/composite/send/RecipientCard.vue`), an address input that reads from its start (`apps/extension/src/components/composite/general/AddressInput.vue`), and a tab-order fix across the shared widgets.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Take six reported UX fixes as one batch, ordered from low risk to broad blast radius, and verify with component tests, the smoke e2e and a human keyboard and visual pass.

- **Settings row.** The Identity row's title is the static label "Profile" instead of the profile name, which still shows on the page it links to.
- **Contact forms.** The reported doubled border under the address input was to go, by dropping the top border of the sender row beneath it.
- **Account indicator.** The `vault` icon is retired everywhere in favour of an initials avatar, first a disc coloured by a plain string hash of the address and now a flat square with initials only. It is decoration beside the name and address and carries no security weight. A single-emoji identicon was rejected as too few bits to resist grinding.
- **Send recipient.** A card shows the avatar, the name and the address masked to its first and last eight characters, with an optional one-tap reveal of the full address, selectable for copying, on the Send screen itself, before submit.
- **Address input.** A long `0x` address reads from its start at rest, by resetting scroll on blur, without mutating the value.
- **Tab order.** Fix the root causes of a broken Tab sequence.

## Why

Send had no later confirmation surface, so the recipient card's reveal is the verification surface. Reveal is optional, not forced, to keep the flow light; the card makes the reveal prominent and binds the exact term that submits, so what is displayed and what is submitted cannot diverge. The tab-order bug class was a positive `tabindex` anywhere on a screen, which splits the whole document's order into two passes.

## What shipped

- **Keyboard model.** No positive `tabindex` remains anywhere. Custom widgets such as `Toggle` and the dropdown items are focusable with `tabindex` 0 (or -1 when disabled), operable by Enter and Space, and navigated by a data attribute instead of a `tabindex` literal. The create-profile method choice is one roving tablist. Show and hide password buttons are `tabindex="-1"` across unlock, change password and the import forms, a deliberate field-to-field tradeoff recorded in the repository rules.
- **Shared code.** `getInitials` moved into `apps/extension/src/utils/string.ts` and is shared with the contact service.
- **Send polish.** Review of local builds produced further refinements to the Send surface: the square avatar, ellipsis truncation, an address input that pins its start on blur, de-stacked paddings and a worded "Invalid address" hint.
- **Review fixes.** A disabled dropdown item and a clipboard error path were fixed after review, with tests.
