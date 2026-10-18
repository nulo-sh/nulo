# Owner asks: owner-feedback-1

Four asks. OA-1 and OA-2 hold arc 2 (the landing, #767): it opens only once both are answered. OA-3 (#762) and OA-4 (#760) ride arc 1, which ships their "what ships now" forms if they are still open. Every other change in this lane quotes the owner's words from its issue (#760, #761, #762, #765).

## OA-1. #767: the landing notice's sentence

**Surface:** nulo.sh, the notice between the public record and the final call to action (`apps/landing/index.html:191-200`). The tag reads `Early days` (owner's words).

**The sentence, as the owner wrote it:** "Nulo and Aztec are in its early days. Use small amounts you can afford to lose, or the test network, and tell us what breaks." Two choices in it:

1. **The closing clause** (decision page shots-p47 renders the three forms, desktop and phone):
   - **A.** "…, and tell us what breaks." (the owner's)
   - **B.** "…, and tell us what you find."
   - **C.** "…, and send us what you notice."
2. **"its" or "their"** for two subjects: **A.** "in its early days" (verbatim) or **B.** "in their early days".

**Recommendation:** clause B and "their". B asks for feedback, as the owner wanted, without promising breakage. "Their" agrees with "Nulo and Aztec".

**What ships now:** nothing. Arc 2 is held, and the landing keeps "Preview build" until both answers land.

## OA-2. #767: the two other places the landing says "preview"

**Surface:** the footer's last item, `preview build` (`apps/landing/index.html:228`), and the notice's screen-reader name, `aria-label="Preview notice"` (`:191`). The owner said "it's not a PREVIEW", but named no replacement for these two.

| Option | Footer | Screen-reader name |
|---|---|---|
| **A. Follow the tag** | `early days` | "Early days notice" |
| **B. Drop the footer item** | (removed; the footer keeps `nulo.sh` and its links) | "Early days notice" |
| **C. Leave them** | `preview build` | "Preview notice" |

**Recommendation: A.** One name for the notice everywhere; C keeps the word the owner rejected.

**What ships now:** nothing (held with OA-1).

## OA-3. #762: the "transfers disabled" warning on the fixed token page

**Surface:** the token page, the warning "Private and public transfers disabled" (`apps/extension/src/popup/pages/tokens/[id].vue:292`). It shows only for a token whose contract allows neither transfer. Today it sits under the balance and its actions, above the activity, and scrolls with the whole page.

| Option | When the recent activity scrolls |
|---|---|
| **A. Scrolls with the activity** | the warning slides up under the fixed balance, as Home's recovery and restore banners do |
| **B. Stays fixed** | the warning stays under the balance; the activity gets less room |

**Recommendation: A**, Home's pattern; the warning still shows first on arrival.

**What ships now: B**, your words read literally ("keep the hero / balance fixed, and only scroll the recent activity"). The flagged-token banner above the balance stays fixed either way, for the same reason.

## OA-4. #760: the fee method of a send paid by a sponsor you added and renamed

**Surface:** the transaction page, the "Fee method" row. A sponsor you added by hand shows on Send under the name you gave it (Nulo's own two methods cannot be renamed, so they always read "Private Fee Juice" and "Sponsored").

| Option | The row reads |
|---|---|
| **A. The method** | "Sponsored", the word the page already uses for any sponsor |
| **B. The name** | the sponsor's name as it is today; it changes if you rename the sponsor later, since a transaction does not keep the name |

**Recommendation: A.** It names the method, as the row's label says.

**What ships now: A.**

## OA-6. #766: the app-set fee block with no amount to state

**Surface:** the execute window's fee block when the app sets the fee payment method and no estimate runs or has landed: a failed estimate, or an operation the wallet never estimates. The signed sentence (P47-02 C) names an amount, so it cannot read here.

| Option | The block reads |
|---|---|
| **A. The shipped legend** | "Fee payment method set by {app}" |
| **B. The sentence's second half** | "Payment method set by {app}." |

**Recommendation: A.** No new words; it is the line you saw on page 47 as the shipped form.

**What ships now: A.**
