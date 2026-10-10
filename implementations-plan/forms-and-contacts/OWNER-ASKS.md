# Owner asks: forms-and-contacts

Decision page 11 (Forms, contacts and design system) already carries this lane's calls, P11-01 to P11-05. The asks below are the questions the plan found inside or next to those proposals, where no signed text fixes what a person will see. Each has the planner's recommendation and a "what ships now" line: what the arc builds while the ask is open. An open ask leaves its part as it is today; the rest ships (SR2).

**Blocking asks.** FA-1, FA-2, FA-4 and FA-7 complete page 11's own proposals, so their phases wait for the answer instead of shipping a reduced version of what the owner signed. Put them on page 11 before it is signed.

Arcs 1 and 2 add no words. Arc 1's visible effects restore what each screen was meant to show (plan.md § UI impact); the form-popup depth is covered by the orchestrator's no-ask record for #210, and the other three need the same record (§ Arc 1 corrections). FA-8 to FA-11 are items the plan leaves as they are; each would change what a person sees, so each is the owner's call.

## Arc 1 corrections (for the orchestrator's record, not a question)

Arc 1 adds no words and no layout. Three of its fixes still change what a screen shows in a case that is wrong today; only #210 has a `no_ask` record. Arc 1 waits for a record of these three (a `no_ask` entry like #210's, or a page item); a part with no record stays as it is (SR2).

| Issue | Surface | Today | After arc 1 |
|---|---|---|---|
| #205 | Settings → Display, Privacy, Developer, Lock, after a write that fails | the toggle shows the value that was not saved, beside "Failed to update setting" | the toggle shows the stored value, beside the same toast |
| #212 | Logs window | the first live line is joined onto the last loaded line; after "Clear logs" the list starts after a blank line | each line on its own line; after "Clear logs" the list starts on the first line |
| #214 | New account, New FPC, Edit FPC | "Alice " beside a saved "Alice" is accepted | the existing "Already exist" warning shows and Save stays disabled; saved names are not changed |

## FA-1 (blocking). #151: where "Importing contacts · N of M" shows

**Surface:** the popup while a contacts import writes rows (P11-01). The import keeps running if the person leaves the Contacts page for another page in the popup.

| Option | What the person sees during a 500-row import |
|---|---|
| **A. A snack at the bottom, like the other import messages** | A snack reading "Importing contacts · 120 of 500" that counts up and stays until the import ends; the existing result snack replaces it. It shows on every popup page. |
| **B. A line on the Contacts page** | "Importing contacts · 120 of 500" under the Contacts title. Leaving the page hides it; the import continues. |

**Recommendation: A.** It is visible wherever the person goes while Lock is disabled, which is what explains the disabled Lock.

**Also: two imports at once.** Today a second import can start from the Contacts menu while one runs. The line then shows (a) the import started last, or (b) both counts added together. **Recommendation: (a).** Blocking a second import would be a further change, not asked here.

**What ships now:** nothing of the running state (plan phase 3.2) until this is answered. P11-01 promises the line, and a disabled Lock with no visible reason is not what the page signs. The fenced sender (3.1) ships with page 11.

## FA-2 (blocking). #151: Lock in another window during an import

**Surface:** a second popup window or the side panel, while the first window imports.

| Option | What happens |
|---|---|
| **A. Only the importing window disables Lock** | The other window locks as usual; the import stops and shows "Import incomplete · N of M contacts written", exactly as when auto-lock fires. |
| **B. Every window disables Lock** | Lock is disabled everywhere until the import ends. Needs a flag in the background. |

**Recommendation: A.** It matches the auto-lock rule on page 11, and the stop is already safe.

**What ships now:** nothing of phase 3.2 until this is answered (as FA-1).

## FA-3. #151: leaving the Contacts page mid-import

**Surface:** Settings → Contacts, a person who moves to another page during an import. Today the row being written when they leave can be reported as an error even if it was saved, the import goes on, and it ends with "Import ended with errors".

| Option | What the person sees at the end |
|---|---|
| **A. The import owns its connections** | Leaving the page does not disturb the import; it ends with the result it really had ("Contacts imported · …" when every row was written). |
| **B. As today** | It can end with "Import ended with errors" for a row that was saved. |

**Recommendation: A.**

**What ships now:** B.

## FA-4 (blocking). #229: how much the hover darkens

At rest, `#c62828` gives 5.2:1 with the label as drawn (`--txt-white` is 95% white); page 11's 5.62:1 is against pure white. Both pass AA (4.5:1).

**Surface:** the two red buttons when hovered, both themes (P11-03 signs "a hover that darkens instead of lightening").

| Option | Hover colour on `#c62828` | Label contrast (the 95% white label) |
|---|---|---|
| **A. 18% toward black (the step the other buttons' hover already uses, toward black)** | `#a22121` | 7.0:1 |
| **B. 10% toward black** | `#b22424` | 6.1:1 |

**Recommendation: A.**

**What ships now:** nothing of phase 3.5 until this is answered: the rest colour alone, under today's lightening hover, would not meet the page's "every state passes AA".

## FA-5. #216, option B only: which fields get the visible note

**Surface:** every text field with a length cap (22 call sites), if page 11 picks option B. The look of the note itself is the one shot `o-216-B` shows.

Today the length warning shows only on fields with a label row (the warning lives in that row); unlabelled capped fields show nothing at the cap. Two consequences to know before picking B:

1. **Unlabelled capped fields.** Option A of this ask: only fields that show the warning today get the note under the field. Option B of this ask: every capped field gets it, including ones that show nothing today.
2. **The detail text.** Today the tooltip on the warning reads "You can’t enter more than N characters". Page 11's option B says "with no tooltip", so that sentence no longer shows anywhere.

**Recommendation: A (only where the warning shows today).**

**What ships now (if B is picked):** A, and the detail sentence is dropped as the page says.

## FA-6. #215: other motion under Disable animations

**Surface:** every popup page with the Disable animations setting on. P11-05 covers shakes and shimmers. The setting today stops transitions; these keyframe animations would still run:

- loading spinners and the header's sync dot;
- the gas-balance and Presto status pulses, the pulsing placeholder icon, the Revoke progress runner;
- the auto-close countdown bar on secret pages;
- the new-activity row glow and the Home balance pop (both already stop).

| Option | What the person sees with the setting on |
|---|---|
| **A. Shakes and shimmers only** | as P11-05 says; spinners, pulses and the countdown bar keep moving |
| **B. Also stop the decorative pulses and the runner** | spinners and the countdown bar keep moving (they show that something is in progress and how long is left) |

Also: onboarding never applies the setting, so motion there ignores it under either option.

**Recommendation: A now; B as its own item if wanted.**

**What ships now:** A.

## FA-7 (blocking). #151: how long Lock can stay disabled

**Surface:** the Lock controls during a long import. An import can run for minutes: up to 512 rows, each with up to three requests, and a sender registration waits on the proving engine. With auto-lock set to never, nothing but the end of the import re-enables Lock.

| Option | What happens on a slow import |
|---|---|
| **A. Disabled until the import ends, as page 11 says** | Lock stays disabled however long the import takes; auto-lock (if set) still ends it. |
| **B. Disabled for up to 2 minutes, then "Lock anyway"** | After 2 minutes Lock works again behind the same "Lock anyway" confirm running transactions use, worded for the import. |

**Recommendation: B.** Locking is a security action; the wallet states today that it is never blocked, and B keeps a way out.

**What ships now:** nothing of phase 3.2 until this is answered (with FA-1 and FA-2). If the page signs A, A ships.

## FA-8. #210: re-opening a popup that is already open

**Surface:** any stacked popups, when code opens a popup that is already open. Today the re-opened popup goes on top but the stack keeps a gap, so a popup under it can stay in front position (not pushed back), and a later popup can share a position with another one.

| Option | What the person sees |
|---|---|
| **A. Close the gap** | The re-opened popup is on top and every popup under it sits back, like any other stack. |
| **B. As today** | The popup under it may not sit back. |

**Recommendation: A.**

**What ships now:** B (arc 1 pins today's behaviour in a test).

## FA-9. #224 and #210: lists that can miss a change made while they load

**Surface:** the New and Edit FPC popups (the FPC list behind the duplicate-name check) and the Send page (its contacts and tokens). If an FPC, contact or token is added or deleted in another window while one of these is loading its list, the change can be missing until the popup reopens; a deleted token can stay selectable on Send. The other popups' lists cannot miss a change this way today.

Also: each popup keeps its own rule for a change it receives (some add an unknown updated item, some ignore it). Making them one rule would change what some lists show.

| Option | What the person sees |
|---|---|
| **A. Re-read when a change lands during the load** | The list matches the wallet after the load; the same rule Send already uses for added tokens. Per-popup rules stay. |
| **B. As today** | A rare missing or stale row until the popup reopens. |

**Recommendation: A** (as its own small change after arc 2).

**What ships now:** B (arc 2 pins today's behaviour in tests).

## FA-10. Network names with outer spaces

**Surface:** New network and Edit network. Today "Testnet " and "Testnet" can both be saved and read the same. Accounts and FPCs refuse this after arc 1.

| Option | What the person sees |
|---|---|
| **A. Same rule as accounts and FPCs** | "Testnet " shows "Already exists" when "Testnet" exists, and a saved name drops its outer spaces. |
| **B. As today** | Both can be saved. |

**Recommendation: A.**

**What ships now:** B.

## FA-11. #151: a contact whose sender registration failed

**Surface:** Settings → Contacts, an import of rows marked as senders when the registration fails in a live session (the proving engine refuses, or no network is selected). Today the contact is written and the sender is not. When the import ends with no other error, the result snack says so ("2 of 5 senders registered", "sender registration failed" or "sender registrations skipped (no active network)"); when a contact also failed, or the import was stopped later, the snack reads "Import ended with errors" or "Import incomplete · N of M contacts written" and does not mention senders. A later import lists that contact as "Already saved", unselected, so retrying its sender means selecting it.

| Option | What the person sees |
|---|---|
| **A. As today** | the contact is saved; the snack reports the senders that did not register, unless another error or a stop replaces it |
| **B. Save the contact only once its sender is registered** | a row whose registration failed is not saved, the snack counts it as not imported, and a re-run lists it as new. With no network selected, no sender row is saved at all |

**Recommendation: A.** The snack tells the person in the common case, and B makes an import with no network save nothing for its sender rows. After arc 3, the row an interruption cuts off is never saved without its sender; rows before it whose sender failed stay saved, under A, as today.

**What ships now:** A.
