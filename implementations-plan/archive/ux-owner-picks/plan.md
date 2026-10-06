# Five UX decisions from the feedback program

## Outcome

- **Date**: —
- **Status**: completed.
- **Shipped**: compact amounts in `apps/extension/src/utils/amount.ts`, one scoped token lookup in `apps/extension/src/composables/useScopedTokens.ts`, a loading token card in `apps/extension/src/popup/components/modules/send/SelectTokenCard.vue`, and the "Send failed" label for a wallet send whose outcome the journal cannot tell, in `apps/extension/src/utils/journal-state.ts`.
- **Open items**: none.
- **Seeds retired**: none; this record carries no seed prompts.

## Decision

Build the five UI decisions chosen from the feedback program's follow-ups in one change, with each surface signed off after it was built:

- An amount too long for its row keeps every whole-number digit, shown as a truncated compact form (K, M, B, T, or a greater-than-cap marker past the top tier), on every capped amount whose token the wallet knows. Callers that guess decimals keep their old cut, because compacting them would turn a dApp's mint of one 18-decimal token into the cap marker. `Intl.NumberFormat` compact notation was rejected: its suffixes vary by locale, so a length cap cannot be guaranteed.
- Home and History build received rows with one builder over one scoped token lookup, as a pure function inside the builder so neither caller can bypass it.
- Send's token card waits, inert, for the current identity's tokens (an empty row, then a skeleton after 300 ms) and never shows the previous identity's token. The page owns the fetch and the card only renders the state.
- With no saved choice every fee card starts on Nulo's sponsor, never one added by hand, and picks none where Nulo's is missing.
- A wallet send that failed after it may have reached the node reads "Send failed", with hedged context that it may still go through, because the journal cannot tell which.

The two hero amounts shrink until every character fits, down to 60%, before the compact rule shortens them, and while Home counts the size only shrinks. Send's loading card is named "Loading tokens". Outside Send, a fee card drops a sponsor it chose by default once an edit makes that row custom.

## Why

Every capped surface showed a wrong number for huge amounts, and Home and History disagreed about the same receipt, because each had its own lookup and formatter. A test that renders both rows now fails if either stops using the shared lookup. The fee default and the failure copy carry security weight: who pays by default, and whose fault a failure reads as.

The change was held to the chosen surfaces, and sign-off was recorded per surface rather than inferred from approval of the plan, in line with the repository's rule that UI changes need explicit owner sign-off.

## What shipped

- The compact rule, truncating rather than rounding, with small-value dust still reading as below the minimum.
- The scoped-token composable, used by Home's recent activity and History, plus a parity test that renders both rows.
- The Send loading state, one Tab stop once loaded.
- The sponsor default and its drop-on-edit rule, and the hedged failure label (later outcome-specific labels cover the cases the journal can tell apart).
- e2e coverage on both browsers for the surfaces that read a hero amount or the incoming row.
- Dropped: a test hold on the first identity reply, because Firefox runs no preload script in extension pages; the block runs unheld and is deterministic on the local network. A capture of a fee card with Nulo's sponsor missing was also dropped, since the e2e cannot reach that state without a product hook; unit tests pin it.

## Lessons

### Chain zero

The local network's chain id is 0, so a truthiness guard on the chain id skipped the very chain every network e2e runs on: History's token load returned early and never named a received row's token there, whatever the timing. The composable scopes on the network object, as Home does, and tests compare the chain id with `undefined`.
