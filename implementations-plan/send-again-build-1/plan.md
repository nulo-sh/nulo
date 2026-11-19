---
plan: send-again-build-1
tier: light
driver: claude-code
claude_model: opus
codex_model: sol
code_review: off
explainer: off
eli5_mode: skipped (orchestrator-owned)
base: dev at 0d5afc774
status: in progress
---

# send-again-build-1: "Same as last time" leaves for the visit once used or skipped (#1880)

The owner's note on the 1.3.0 candidate: "The "same as last time" suggestion on "Send" should ONLY last 1 send. Or we should have a better logic? It's a bit annoying." Page 193, signed 2026-11-19 20:48Z, picked **P193-03 = S0′**: "today's per-payee row, but once you use it or skip it (type an amount, change the token or the side) it is gone for the rest of that visit, and the next visit to that payee offers it again. It stores nothing." Every option on the page was drawn with the form opening on the amount field; that ships too, as an accessibility call (below). Bounded work: one page, one PR, opened as a draft that lands after 1.3.0 is published.

**UI impact** (signed on page 193):
- Before: after a payee is picked the row takes the focus; it hides only while the form holds that send's token, amount and arrival side, and comes back once any of them changes.
- After: the form opens on the amount field (the token row when there is nothing to spend); the row shows as today until the person presses it, types an amount, picks another token or changes the arrival side, and then stays gone for that payee until Send opens again.

## Assumptions

- **Ask A1, `held` stays.** The build spec says the comparison "can go". It stays: the signed rule is "today's per-payee row" plus the leave-on-use, and today's row hides while the form already holds its values. Dropping it would offer a press that changes nothing (a payee whose last send equals the amount kept from the previous payee), a visible change nobody drew.
- **Ask A2, the From side is no skip.** Page 193 says "the side"; the build spec names the arrival `SideChoice`, and today's rule never compares From.

## Decision ledger

- **D1, page state keyed by payee.** A reactive `Set` of lower-cased payee addresses in `send.vue` (`lastSendTo` matches case-insensitively). It dies with the page, so each mount, a new visit, starts clean: no `chrome.storage` key, no session key, no store, no stored shape.
- **D2, marked from the person's controls, never from a watch.** The page writes the token, amount and side itself: the first token and its sides on each identity load, a deleted token's successor, the empty list's first token, `?tokenId=`, the token watch clearing the amount, the unmount reset. A watch on the values would read each as a skip. The marks: the press (`applySendAgain`); the amount card's new `edit` event; the arrival `SideChoice`'s `update:modelValue` (a radio's `change` only); a token pick (D3).
- **D2a, the amount's mark is the card's `edit` event, not its `update:modelValue`.** The build spec named the model update; the build showed it cannot carry the rule. A dollar figure reaches the model only when its 250 ms conversion lands, and one that reads as no amount never does, so the row survived a typed USD figure (demonstrated: the USD case in T2's describe reds with the model hook). The model update also carries the card's own writes (a blur's rest, a re-clamp, a fail-closed clear when the quote is lost). `AmountCard` alone tells a person's change from its own writes, so it emits `edit` from its keystroke and paste handlers in both fields and from Max in both modes; the unit switch is no edit. Considered: the model update plus a native `input` listener falling through the card's root (implicit, rests on the card's DOM and attribute fallthrough).
- **D3, the token pick is reported by the picker.** The pick happens in `SelectTokenPopup`, which writes the global `cacheStore.activeTokenIdx`; the page sees only the change. The popup's opener payload already carries `onAdded`; it gains `onPicked`, called only when a pick changes the active token, and `SelectTokenCard` passes the page's handler through as it passes `onTokenAdded`. An imported token's pick spends the row of the payee whose form it was made on, captured before `pickAddedToken`'s list read, and only once it actually switches. Rejected: telling page writes apart inside the `activeTokenIdx` watch (a flag set before each page write goes stale when a write changes nothing, and misreads the person's next pick of that id).
- **D4, a mark counts only while the form is shown.** `backToPerson` clears the payee before the card unmounts; a late card write (a blur's rest on removal) must not mark an empty payee.
- **D5, focus (accessibility call under the owner's 2026-10-19 delegation).** `focusForm` loses its row branch: the amount, else the token row, tested as "the amount input holds the focus", not "focus is inside the page". The row stays a Tab stop (Shift+Tab back past Max and the token row) and a pointer target.

**The re-clamp case** (`AmountCard.vue`, the `tokenDecimals` watch): the card rewrites a surviving amount when a token change cuts its decimals, and that write emits `update:modelValue`. Under the model hook it could not have spent a row on its own: an amount survives a token change only through `keepFormFor`, set by the press and by an imported token's pick, both the person's own acts that spend the row already, and every page-side switch (identity load, deletion, empty-list arm, `?tokenId=`) clears the amount in the same flush (`if (!keep) amountTerm.value = null`), so the card's child watcher reads no amount. Under D2a it emits no `edit`, so it never counts (pinned in `AmountCard.test.ts`).

## Tests (red first where they pin new behaviour)

`apps/extension/src/popup/pages/send.integration.test.ts`, "Same as last time, over the real amount card":
- **T1** (the case at 1444, one line): on entering the form the amount input has the focus, not the row.
- **T2**: typing an amount passes the row over; clearing it does not bring it back. In USD mode a dollar figure passes it over at once, before its conversion lands; the USD press cases become "a press with nothing typed" (same token, another token), since a typed figure now spends the row and the "conversion still pending" press is unreachable.
- **T3**: a token pick and an arrival change each pass it over; a page-side token switch (the active token deleted elsewhere) does not.
- **T4**: Ana's row pressed, then Ben's amount typed: back on Ana's form her values are no longer the form's, so only the press keeps her row away; Ben's offers nothing either.
- **T4a**: a token imported on Ana's form whose list read lands on Ben's form spends Ana's row, not Ben's.
- **T4b**: with nothing to spend and the header focused, the form opens on the token row.
- **T5**: Send mounted again under the same Pinia, the next visit, offers the pressed payee's row again (fails a mark kept in a store).

`SelectTokenPopup.test.ts`: a pick of another row calls the opener's `onPicked` once with the token id; a pick of the selected row calls nothing. `SelectTokenCard.test.ts`: the payload carries `onPicked`. `AmountCard.test.ts`: a key in either field and Max in either mode are each one `edit`, the unit switch none; a blur's rest, a re-clamp and a page write each write the amount and emit no `edit`.

Each behaviour case was run red on the code before it: T1-T4 and the component pins on the base, T4a and T4b on the first commit, T4 with the press's mark removed. T5 and the `edit` negative control are controls that pass on both; the deletion control in T3 reds under a watch on `activeTokenIdx`, the USD case under the model hook.

E2E, no spec added or edited: `network/fee-methods.test.ts` (presses the row on the next visit) and the smoke `send-keyboard.test.ts` (reads where the form opens), each on Chrome and Firefox, since focus moves.

## Validation

`bun run lint`, `bun run typecheck:all`, `bun run test`, `bun run test:all`, `bun run check:plans`; smoke `cd apps/extension && bun run test:e2e -- tests/e2e/send-keyboard.test.ts --retry=0` (then `NULO_E2E_BROWSER=firefox`); network `NODE_OPTIONS=--dns-result-order=ipv4first bun run e2e:agent tests/e2e/network/fee-methods.test.ts` (then Firefox).

## Review and delivery

Bounded work ([`README.md` § Post-implementation standard](../README.md#post-implementation-standard) at `0d5afc774`, step 2's bounded form): one Codex pass (`gpt-6.1-sol`, high) over this plan and the completed diff, adversarial on a page write counted as a skip, an edit not counted, the focus landing nowhere with nothing to spend, a press after a skip; then targeted verification of material fixes. Captures (360 px, 2x, light and dark) are pushed in one commit and removed in the next. One draft PR against `dev`, `Closes #1880`, never marked ready; the close-out commits archive this plan in the same PR.

## Audit verdicts

Codex, one bounded pass over the plan and the diff at `97dd4759e` (`gpt-6.1-sol`, high): "Changes needed: one demonstrated payee race, one focus edge case, and a missing regression control." All three accepted, each verified against the tree and fixed with its test (red first):
- **Delayed import spends the wrong payee** (medium, demonstrated): `pickAddedToken` awaited the list read without the payee, so an import made on Ana's form whose read landed after Back and Ben marked Ben. Fix: the payee is captured before the await (D3), T4a.
- **Focus fallback** (low, plausible): `focusForm` tested "focus inside the page", so a header holding the focus kept it when the amount refused; dropping the row branch made it reachable with a row offered. Fix: D5's check, T4b.
- **The press was not proven to spend** (low, coverage): `held` hid the row after a press anyway. Fix: T4 reworked.
- Comment notes taken: the spent set's comment cut to its constraint; `onTokenPicked` states its contract; a test comment restating its line dropped. `focusForm` keeps one line, the amount's refusal, which the code cannot say.

## Seeds

- `/goal`: ship S0′ for "Same as last time" on Send as a draft PR closing #1880.
- `/loop`: poll the draft PR's required checks; fix a red at its cause.
