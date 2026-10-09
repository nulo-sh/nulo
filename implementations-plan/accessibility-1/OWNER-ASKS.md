# Owner asks: accessibility-1

Twelve calls on two decision pages, six each, in the order each page shows them. Every entry changes something a person sees, hears or would notice, so nothing is built before the answer. Each recommendation is the planner's own, labelled as such; the review panel argued how each option is built, never which one to pick. "As is" is always an answer: it drops that part and the rest of the arc still ships. Full component changes, testids and screenshot hooks per option: [options.md](options.md).

# Page 1: Send (Arc 1)

## 1. Where the unit switch, Max and Refresh quote sit in the Tab order

**Surface:** Send, the amount card: the "USDC / USD" unit switch, Max, and "Refresh quote" (which shows only when a USD amount's price has moved).

**Today:** the keyboard cannot reach or press any of the three. A keyboard user cannot type an amount in USD or fill the whole balance.

| Option | What the person sees and does |
|---|---|
| **A. In the Tab path** | Tab goes from the amount to the unit switch, then Max, then Refresh quote when it shows. Enter or Space presses each. Nothing changes at rest. |
| **B. Out of the Tab path** | Tab still skips the unit switch and Max, as it skips the show-password eye. A screen reader can press them; a keyboard-only person still cannot. Refresh quote joins the Tab path. |
| **As is** | No change. |

Both A and B also do two smaller things: Max is skipped (disabled) while there is no balance to fill, and after a keyboard press on Refresh quote, which then disappears, the focus goes back to the amount field instead of the top of the page.

A puts two in-field controls in the Tab path. The wallet's written rule (CLAUDE.md, keyboard and focus order) keeps in-field controls out of it, like the show-password eye; picking A makes these two an exception, and the rule is updated to say so.

**Planner's recommendation: A.** The unit switch and Max are the only way to do two things. Leaving them out keeps the original fault for keyboard users.

## 2. How focus shows on Send's controls

**Surface:** the three controls above (if call 1 adds them), the token card under "Select Asset", and the fee method picker (if call 6 adds it).

**Today:** the token card shows the browser's own ring, which differs between Chrome and Firefox. The other controls never hold the focus.

| Option | What the person sees |
|---|---|
| **A. A designed ring** | A 2 px ring in the accent colour, the same ring the wallet's buttons use. Around the small controls it sits 2 px outside; on the token card it sits inside the row, over the hover tint. Keyboard only, never on a click. |
| **B. The browser's own ring** | The ring each browser draws by default, on all of them. |
| **As is** | The token card keeps the browser's ring, and any new Tab stop from calls 1 and 6 gets the browser's ring too (as B), so the keyboard's place always shows. |

**Planner's recommendation: A.** It matches every other focused control in the wallet, and it reads the same on both browsers. It passes the contrast rule in both themes (4.64:1 or more).

## 3. A press below the destination while the destination holds the focus

**Surface:** Send, right after typing or pasting an address that belongs to one of your accounts or contacts.

**Today:** pressing Max (or the unit switch, Refresh quote, a fee control) while the address field still holds the focus does nothing. The press turns the field into the account's card, 22 px taller, so everything below moves before the button comes up. A second press works. (While the field holds the focus, its suggestion list is drawn over what lies just below, often the token card; a press there picks the suggestion. No option changes that.)

| Option | What changes for a mouse user |
|---|---|
| **A. The field keeps the card's height** | Every first press works. The empty address row is about 22 px taller, so Send's top part moves down that much. |
| **B. Max reacts on the press** | Max fills the amount as the button goes down. The other controls below still miss their first press, and the page still jumps. |
| **C. The field waits for the press to end** | Every first press works, however long the button is held. The field turns into the card when the button comes up instead of when it goes down. Nothing else changes, and the wait itself never changes the destination (but see call 5 if it stays "as is"). A finger press on a touch screen is not covered. |
| **As is** | The first press stays lost. |

**Planner's recommendation: C.** It fixes every control below the field, not only Max, and changes neither the layout nor how a press works. The wallet's popup is a desktop surface, so the touch gap is small.

## 4. Announce the sponsor notice

**Surface:** the fee card on Send and in a dApp's approval window, when the wallet finds the sponsor cannot pay: "The sponsor can't cover this fee right now, so <method> pays it."

| Option | What changes |
|---|---|
| **Yes** | Nothing visible. A screen reader reads the sentence when it appears, and again if the paying method changes. |
| **As is** | A screen reader is not told that the payer changed. |

**Planner's recommendation: yes.** Who pays the fee is the reason the notice exists.

## 5. An Enter elsewhere must not pick a contact

**Surface:** Send's destination field, while it suggests contacts or accounts for what you typed.

**Today:** for a quarter of a second after you leave the field, an Enter pressed on any other control picks the first suggestion and makes it the destination. Type part of a name, press Tab and then Enter quickly, and the money is set to go to the first matching contact, without you picking it. Not every send shows a review sheet before it goes out, so nothing else is sure to catch it.

| Option | What changes |
|---|---|
| **A. Only the field's own Enter picks** | Nothing in normal use: Enter in the field still picks the first suggestion. An Enter on another control no longer changes the destination, and a held Enter picks nothing. |
| **As is** | The fast Tab-then-Enter can still pick a contact. If call 3 is C, the suggestions stay up for as long as a press lasts, so the window grows to the press. |

**Planner's recommendation: A.** The destination is where the money goes; only the person's own choice should set it.

## 6. The fee method picker by keyboard

**Surface:** the fee card's "how the fee is paid" picker, on Send and in a dApp's approval window.

**Today:** it opens only by mouse. Tab skips it, so a keyboard-only person cannot change how the fee is paid. Once open, its menu already works with the arrow keys, Enter and Escape.

| Option | What changes |
|---|---|
| **A. Make it a Tab stop** | Tab reaches the picker; Enter or Space opens it; the arrows move through the methods; Enter picks; Escape closes it and leaves the keyboard on the picker. It shows call 2's focus style. Nothing changes at rest. |
| **B. Later** | Recorded as a follow-up; nothing changes now. |

**Planner's recommendation: A.** The fee method is a real choice on every send; it should not need a mouse.

# Page 2: Home and shared chrome (Arcs 2 and 3)

## 1. Home's two view links

**Surface:** Home: "View history" over Recent activity (also on a token's page) and "View all" over Holdings (shown when there are more than three tokens).

**Today:** both are small grey text that Tab skips, at 2.12:1 (dark) and 1.58:1 (light) against the page; text needs 4.5:1. The nav bar's History and Holdings tabs open the same pages.

| Option | What the person sees |
|---|---|
| **A. Real links, readable** | Both stay where they are, in the drawing's link colour (6.40:1 dark, 5.30:1 light), and turn the accent colour on hover as today. Tab reaches each; Enter opens the page; a ring shows the focus. A Ctrl- or middle-click opens the page in a new tab, as the token rows already do. |
| **B. Remove both** | The two headers lose their links. The nav bar stays the way to History and Holdings. |
| **As is** | No change. |

**Planner's recommendation: A.** The drawing has the links, they cost two Tab stops, and the "History filtered to this token" follow-up needs "View history" on a token's page.

## 2. The back arrow's and the onboarding method tab's focus rings

**Surface:** the back arrow at the top left of every sub-page, and the Password / Passkey tabs on onboarding's "Create wallet" page.

**Today:** neither shows where the keyboard is. The tab's ring is drawn in the same colour as the tab's fill.

| Option | What the person sees |
|---|---|
| **A. One ring each** | The back arrow shows a 2 px accent ring inside its square. The focused method tab shows a 2 px ring in the page colour, 3 px inside its fill. Keyboard only. |
| **As is** | No ring on either. |

**Planner's recommendation: A.**

## 3. Read History's and Settings' title once

**Surface:** the History and Settings tabs. Built after the owner's settings change (PR #56) merges.

| Option | What changes |
|---|---|
| **Yes** | Nothing visible. A screen reader reads "History" (or "Settings") once, from the big title, instead of twice. |
| **As is** | It reads the title twice. |

**Planner's recommendation: yes.**

## 4. Announce the swap to the emoji check

**Surface:** the connect window, when Allow turns it into the emoji check. It keeps the same window title, and on purpose nothing takes the focus, so a stray Enter cannot answer the check. Built after the emoji check's refusal (PRs #55 and #58) merges; the words below are that version's.

| Option | What changes |
|---|---|
| **A. An announcement** | Nothing visible. Shortly after the swap, a screen reader hears "Connection check" and the window's own instruction. The words are the wallet's, never the app's. |
| **A+. The same, with the address warning** | As A. When the window also shows its warning that the app's address uses look-alike characters, the announcement reads that warning too. |
| **B. Move the focus to the "Connection check" heading** | A screen reader reads the heading and the instruction. A keyboard user starts on the heading, so the next Tab goes to "Skip this check next time"; a ring may show around the heading. The focus never lands on a button, and Enter on the heading does nothing. |
| **As is** | A screen-reader user is not told the window changed. |

**Planner's recommendation: A+.** It tells the screen-reader user without changing anything a sighted person sees, keeps the focus off the answer buttons, and does not let the one warning that matters most on this screen go unread.

## 5. The connect step bar's empty half

**Surface:** the thin two-part bar under the connect window's header. On step 1 the second half is empty.

| Option | Before | After |
|---|---|---|
| **A. A visible track colour** (a new colour, used only here) | 1.22:1 dark, 1.36:1 light against the page | 3.30:1 dark, 3.15:1 light (a graphic needs 3:1) |
| **As is** | | |

**Planner's recommendation: A.**

## 6. The status colours in the light theme

**Surface:** the status line on an activity row that has no settled transaction, in the light theme: "Transaction was interrupted" and "Unconfirmed" in amber, a failure in red, "Sent" in green. Dark already passes and does not change.

| Option | Amber | Red | Green |
|---|---|---|---|
| **A. Darker light-theme status text** | 1.56:1 to 5.28:1 | 3.56:1 to 6.00:1 | 2.66:1 to 5.44:1 |
| **As is** | | | |

Ratios are against the page; on a hovered or pressed row they stay at 4.57:1 or more. The small status icons keep today's colours.

**Planner's recommendation: A.**

## Answers

_Recorded here by the orchestrator, with the date, when the owner answers each page._

## Answers: page 2, owner sign-off, 2026-10-09

The owner answered page 2 on 2026-10-09 and signed off at 12:55 UTC, every call on the planner's recommendation, with no notes. Arc 2 builds calls 1, 2, 5 and 6; calls 3 and 4 are Arc 3, which waits for PRs #56, #55 and #58 to reach `dev`.

| Call | Answer | Note |
|---|---|---|
| 1. Home's two view links | **A**, real, readable links | Arc 2, Phase 2.1 |
| 2. The back arrow's and the onboarding method tab's focus rings | **A**, one ring each | Arc 2, Phase 2.2 |
| 3. Read History's and Settings' title once | **Yes** | Arc 3, Phase 3.1; waits for PR #56 |
| 4. Announce the swap to the emoji check | **A+**, the announcement with the look-alike warning when shown | Arc 3, Phase 3.2; waits for PRs #55 and #58 |
| 5. The connect step bar's empty half | **A**, a visible track colour | Arc 2, Phase 2.3 |
| 6. The status colours in the light theme | **A**, darker light-theme status text | Arc 2, Phase 2.4 |
