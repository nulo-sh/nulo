# sheet-1: owner asks

Each ask names the surface, the options, what each looks like, a recommendation, and the form the arc ships now without waiting. The PR's light and dark screenshots draw the "now" form.

## OA-1: the ledge and the 1 px line together, light theme

- **Surface**: every `PopupCard` sheet in the light theme (Receive, Select token, every Confirm, the Send review, every form).
- **Why it is asked**: P33-07 E gives the card a 6 px ledge above its accent edge; P33-09 A gives the light theme a 1 px line above the card. Page 33 drew them apart (the harness's two rules replace each other), and in light both use the outline colour `#c9c5bd`.
- **Options**:
  - **a. Both.** The 1 px line runs the card's full width directly above the accent edge; the 6 px ledge sits above it, shifted 6 px left. They are one colour, so the line shows on its own only in the last 6 px at the right edge, where the ledge stops: a 1 px tick.
  - **b. The ledge alone.** The ledge already draws the edge between the white card and the light wash; no tick.
  - **c. The line alone.** The light theme drops the ledge; the sheet reads flatter than the dark one.
- **Recommendation**: b. Moderate confidence: the line was drawn for the old sheet, which had no ledge.
- **Ships now**: a, the literal sum of the two picks.

## OA-2: overlays that are not the popup sheet, light theme

- **Surface**: the dApp windows' "request cancelled / expired" overlay (`DappCancelledOverlay`, a centred card on the near-black scrim) and the Terms acceptance sheet (`LegalAcceptanceSheet`, its own bottom sheet on a near-black scrim).
- **Why it is asked**: P33-09 A was drawn over Receive. These two are other components with their own scrims; changing them is beyond the three picks.
- **Options**: **a.** keep today's near-black scrim in light; **b.** give both the light scrim (the page background at 70 %), the Terms sheet also the 1 px line.
- **Recommendation**: b for consistency, once drawn. Low confidence: the Terms sheet is a blocking wall, where a darker scrim may be the point.
- **Ships now**: a, unchanged.

## OA-3: a double-click's second press inside the sheet its first press opened

- **Surface**: every `Popup` sheet, on pointer input; no screen changes.
- **Why it is asked**: a double-click on a control that opens a Confirm can answer that Confirm, without a deliberate second press. This happens today. Measured on Chrome (plan F11): with ten contacts, a 120 ms double-click on a contact's delete icon, in the row under the Confirm's answer, deleted the contact. Today that row sits in the list's upper middle; after this arc it is the bottom row. The arc also newly exposes a passkey profile's Export full backup: Download Backup sits under "Download anyway", so the second press writes the unencrypted backup (plausible, not reproducible on CI). Refusing that press changes how a click reaches a sheet, beyond the three picks.
- **Options**:
  - **a. Nothing.** Clicks reach sheets as today.
  - **b. The guard (plan D11).** Inside a sheet that opened after the first press, a double-click's later presses do nothing, the close area included. A single press, a keyboard activation, and a double-click begun inside the sheet work as today. A second press slower than the system's double-click interval still passes.
  - **c. Arming.** Every sheet's controls stay disabled, and look disabled, for 0.8 s after it opens, as the Send review's "Send now" does today.
- **Recommendation**: b. Moderate confidence: it removes the class for one boolean, and a person sees nothing unless they double-click.
- **Ships now**: a. Arc 1's Phase 0 files the issue that tracks it, with b's design and the Contacts reproducer; no arc in this plan closes it.

## OA-4: consequences of content height that page 33 did not draw

- **Surface**: every `PopupCard` sheet.
- **Why it is asked**: page 33 drew four sheets at rest in the 600 px popup. Content height also does four things the drawings do not show:
  1. A sheet whose content changes height moves its top edge: Select token grows and shrinks as a search filters.
  2. A snack can cover a sheet's last row where the sheet has no bottom action row (Accounts' "New account", Select token's last token); sheets with a bottom action row lift the snack above it, as today.
  3. With two sheets stacked, a taller sheet beneath shows above the shorter one on top, through the top sheet's scrim.
  4. In a tall frame (the side panel, an own window, the onboarding tab) a short sheet leaves more scrim above it. In the onboarding tab a sheet spans the tab's width.
- **Options**: **a.** accept them as content height makes them; **b.** name the one(s) to redraw, for a later arc.
- **Recommendation**: a. Moderate confidence: each follows from P33-08 A's "every sheet sits at its content height".
- **Ships now**: a. The PR's stacked capture shows 3.

## For the record: page 30's question, "which pop-ups use full height?"

None needs it. Every sheet is a card over the page; the setting only added empty card below the content (and the side panel always forced it on). No sheet is a full-screen view: the full-screen views are the routed windows (the approval, fee, JSON, logger, capabilities, connect and connection-check windows) and the stale-network takeover, none of which is a sheet. The one sheet with a scrolling list inside, Import contacts, keeps scrolling at content height. Inventory: `recon.md` § Popup inventory.
