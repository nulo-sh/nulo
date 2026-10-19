# connect-split-1 owner asks

The owner's decision on #859 (2026-10-19) covers the split itself: Allow answers the discovery and its window closes; the emoji check opens its own window when the page starts the key exchange. The arc ships each ask's "what ships now" form in a draft PR; the PR leaves draft only after the owner signs OA-1 to OA-3 (OA-4 is the orchestrator's first). Pictures: base and head, light and dark, Chrome, in the PR body.

## OA-1: the two windows after the split (sign-off)

**Surfaces.** The discover window (`popup/windows/discover`) and the verify window (`popup/windows/verify`).

**What ships now.**
- Discover window: as today before Allow, minus the two-segment bar under the header. After Allow it keeps today's look ("Connecting on <chain>", the Allow button loading) until it closes (OA-2).
- Verify window: today's check ("Connection established", the grid, They match / They don't match), minus the bar, in a window of its own. It opens where a reconnection's check opens: 400 wide, at the top right of the browser window the person used last, which is where the discover window opened unless the person moved a window.

**Options.** A: ship as above (recommended: it is the decision, with nothing added). B: keep a step indicator in one or both windows (the owner picks what it shows; the lane brief removes it unless the owner picks otherwise).

**Pictures.** Discover before Allow, base vs head; verify for a new connection, base vs head; each light and dark.

## OA-2: after Allow, when no check follows yet

**Surface.** The discover window after Allow.

**What ships now (A).** The window keeps its "Connecting on <chain>" look while the wallet saves the connection and answers the dApp (milliseconds; up to the discovery's minute when the app already has two checks open and this one waits for room). Then it waits for the dApp to start its check: the check window opens on top of it, and it closes beneath. If the dApp has not started its check 1.5 s after the wallet answered it, the window closes, and the check opens later in its own window when the dApp starts it. The "Connection request expired" page goes: a dApp that starts its check after the Allow ran out (about a minute after it asked) has its connection ended, and the wallet shows nothing.

**Options.**
- A (recommended): as above. A dApp that connects at once never shows its own page between the two windows, and a dApp that only lists wallets leaves nothing open after 1.5 s.
- B: the window closes the moment Allow is pressed. Every first connection then shows the dApp's page, and the browser's focus goes back to it, for the time the check window takes to appear (measured in the PR) before the check window opens.
- C: as A, with other words while the window waits after Allow (for example "Allowed"); the owner picks the words.
- D: as A, plus a notice window when a check arrives after the Allow ran out (not recommended: a page could then open a wallet window long after its Allow).

**Note, unchanged by this lane.** Allow writes the app into Connected apps before any check. A dApp that only lists wallets therefore stays listed, and its next visit skips Allow and shows its check as "Reconnected". The close-out files this as an issue unless the owner's answer here covers it.

**Pictures.** Discover after Allow (the "Connecting on <chain>" state), light and dark; the PR body gives J1's and J2's measured times (Allow to check window, Allow to the discover window closing).

## OA-3: closing the discover window after Allow

**Surface.** The discover window after Allow.

**What ships now.** Closing it before the wallet has answered the dApp (it is waiting for room among the app's open checks, or saving the connection) cancels the connection, as today. Closing it after that only closes it: the check still opens when the dApp starts it. Today that later close also cancelled, because the window was going to become the check.

**Options.** A (recommended): as above. B: closing it at any time before the check opens cancels (the wallet also drops the reserved check). C: closing it after Allow never cancels.

**Pictures.** None: no screen changes.

## OA-4: one check window per page (for the orchestrator)

**What the lane asks.** "A page cannot open more than one check window at a time", and "a remembered reconnection must stay as it is". Today an app may hold two check windows at once, so one page can show two: one per chain, or a new connection plus a second discovery that the saved connection turns into a reconnection.

**What ships now (B).** No per-tab limit: admission is as today, two check windows per app and eight in all, one per Allow. The arc first shipped A, a per-tab limit of one. Review showed A breaks the second ask on exactly the page #859 is about: an Allow the page never uses holds its tab's slot for about a minute, so when a wallet picker lists wallets again, the saved connection's answer waits behind it, and Nulo is missing from the picker or appears up to a minute late. The two asks conflict on that page, and B keeps the reconnection as it is. That one page can hold two checks (and frames of several allowed apps share a tab) is filed as a known limit.

**Options.** B (recommended): as above. A: the per-tab limit of one, with the cost above. A': a per-tab limit that lets a newer discovery replace an unused Allow (not recommended: the wallet cannot tell which of a page's discoveries it will connect on, so it can end the one in use).

**Pictures.** None: no screen changes.
