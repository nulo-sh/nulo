# Amounts that read as another number

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: Activity amounts come from decimals the wallet knows (`apps/extension/src/utils/tx-amount.ts`, `knownDecimals` in `apps/extension/src/utils/token-amount.ts`), and the Send amount field reads its text whole (`apps/extension/src/components/composite/send/amount-field.ts`).
- **Open items**: the surfaces that still read a token without a decimals getter, the mints outside the standard shapes, the listed-token mint rule and the unlisted-token lookup, tracked in #103, #104, #105 and #106. The restored-token trust is done: a full-backup restore trusts each restored token that has no trust row.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

The wallet never changes an amount's magnitude by guessing; what it cannot state exactly, it does not state. The plan covered two places that could show a number that is not the amount, and one that could send it.

- Activity amounts are stated only in decimals the wallet knows, or not at all.
- The Send amount field never turns text into an amount the person cannot see.

## Why

A dApp's mint of an 18-decimal token read as a garbled figure in History, and a sent transfer's detail page showed its raw integer while the token list loaded. The card formatted with decimals 0 or a hard-coded 8 whenever it could not name the token. In the field, a typed comma vanished and a pasted "1,234" could silently become another magnitude. A wrong figure on a screen that moves money is worse than no figure.

## What shipped

- **Activity amounts.** The activity card and the transaction page, sent or received, state an amount only in known decimals (`hasDecimals`, `knownDecimals`, one `txAmount` per record) or show none. A listed token's standard mint reads its minted amount, compact past eight characters, with fee calls left out. An unlisted token's mint, a second mint call, any other shape and unusable decimals show no figure. A sent transfer's page reads its own record. A symbol is sanitized, and one that is not text shows as none (`displaySymbol`). The first-receive prompt names no amount.
- **The amount field.** `readAmountText` and `nextAmountText` read the text whole. A typed comma is the decimal point, re-read as grouping when a "." follows. A paste that reads one way keeps its text and rests in the wallet's form. A paste that reads two ways ("1,234") or none ("1e5") is kept, blocks Send, says why under the field and leaves the USD line at the unit rate. Max marks its text as the wallet's rest, and the USD field takes the same rules.
- **Binding.** The token input is bound one way, so a real keystroke reads its own prior text, and a rewrite keeps the caret where the person typed (`caretAfter`).
- **Dropped.** An exact reading of a paste into the field's own rest needs the paste's selection, so it was left out, and so was overtyping the comma point with ".".

## Lessons

### Real keystrokes

A scripted event skips the microtask checkpoint a real keystroke gets. The token input carried `v-model` beside its own input handler, and in a browser Vue flushes between the two listeners of a user-dispatched event, so the card read its own earlier write as the prior text and kept the comma. Every jsdom test dispatches from script, so all passed while real typing failed; the proof is a browser run, and the e2e-testing skill carries the rule.

### Add-add

A branch cut from the head of a stack that `dev` later took as a squash commit meets that stack's files as two unrelated adds when `dev` is merged in, here a dozen add/add conflicts. Resolving each against the true base and checking that the merge brought exactly the difference between the squash commit and `dev` kept the result honest; [lessons](../../lessons.md) carries the entry.
