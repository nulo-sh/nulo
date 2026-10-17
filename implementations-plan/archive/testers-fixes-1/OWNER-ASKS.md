# Owner asks: testers-fixes-1

Each ask names what ships now; the arc builds that form and does not wait for an answer.

## OA-1: how long a success toast with an action stays (#584)

- **Surface.** Two success toasts carry a "View" button: "Received 10 USDC · Private · Account 1" (a new arrival) and "Transaction submitted" after a send.
- **Options.**
  - **A. Two seconds, like every success** (P28-06 A as written). The View button is on screen for 2 s unless the pointer or focus rests on the card, which holds it open.
  - **B. A success with an action stays 6 s, as today;** "Address is copied" and the other plain successes close after 2 s.
- **Recommendation.** B: a button needs time to be reached; two seconds suits a confirmation, not an offer to act.
- **Ships now.** A.

## OA-2: the token page's hero tap (#586)

- **Surface.** The token page (Holdings, then a token) shows the same hero as Home. A tap on its amount shows every digit of a balance cut at 20 characters, then copies it and toasts "Balance is copied". On Home the same tap copied "0" whatever the hero showed; that one goes (P28-03 A).
- **Options.**
  - **A. Keep it on the token page.** Once text is selectable (#580), a drag on the figure selects it and no longer fires the tap; a plain tap still copies.
  - **B. Remove it there too.** Both heroes are display only, and a balance past 20 characters shows cut, as it does until tapped today.
- **Recommendation.** B: it reads the decision ("the hero is display only") for every hero, and a hidden tap that copies is easy to fire by accident.
- **Ships now.** A: no sign-off names the token page.

## OA-3: the done page's second sentence (#581)

- **Surface.** The onboarding done page's "Pro tip" reads "Click the puzzle icon in your browser's toolbar, then pin Nulo for quick access. That's how you'll open the wallet from now on."
- **Options.** **A.** Keep the second sentence. **B.** Drop it; the tip is the decided sentence alone.
- **Recommendation.** A: it says why the pin matters, and it names no browser.
- **Ships now.** A.

## OA-4: back to a list page while its rows load (#582)

- **Surface.** Back from a sub-page now lands where the person left the page. Home, Holdings, Activity and the detail pages fetch their rows after the page appears, so a back that left one far down lands only as far as the rows drawn at that moment, often the top.
- **Options.**
  - **A. Restore once, when the page appears.** Settings and its sub-pages land exactly; a list page lands short while its rows load.
  - **B. Keep restoring as the rows arrive,** until the person scrolls, taps or types, or a short cap passes. The list page lands right, but it jumps down once its rows load.
- **Recommendation.** A for now. B needs a watcher with its own stop rules and makes the page move by itself; a tester report of a short landing is the reason to build it.
- **Ships now.** A.

## Note, no answer needed: the lead's take on #580

Selectable by default is right. Error text, a value with no copy button and the version line for a bug report must be copyable, and each control turning selection off stops the highlight flash that made `body { user-select: none }` tempting. The secret reveal is not widened: it shows the phrase in an input, which was always selectable. Over text the pointer becomes the text cursor, as on any web page.
