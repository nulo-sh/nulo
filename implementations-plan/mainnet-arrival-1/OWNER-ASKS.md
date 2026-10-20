# mainnet-arrival-1: owner asks

A1 depends on none of these and ships no visible change. A2 is built only after OA-1 is answered and its pick is quoted in A2's PR.

## OA-1: what an existing profile sees when a new default network (Mainnet) arrives

- **Surface.** The popup of a profile created before the build that adds Mainnet, the first time it opens after the update. A profile created or restored on that build gets Mainnet as a new profile does (which network a new profile starts on is #80's call); it sees no arrival.
- **Today.** Nothing: the new default never reaches an existing profile (#875). After A1 the network is added to the profile's list on its first open and nothing else changes.
- **Options** (drawn by the orchestrator on the decision page; this plan does not draw them):
  - **A, listed with nothing moving (ships now).** Mainnet appears in Settings → Networks and in the network switcher; the active network, Home and every screen stay as they were. No new state, no new screen.
  - **B, switch once with a notice.** The first open moves the active network to Mainnet and shows a one-time notice. Needs the one-time record field and the notice; the switch runs from the popup when the person sees it.
  - **C, ask once on Home.** A one-time card or sheet on Home offers to switch to Mainnet or stay. Needs the one-time record field and the card; dismissing it is final.
  - **D, a one-time full-screen arrival** in the style of the Testnet reset takeover (`StaleNetworkTakeover`): an eyebrow, a title, a box of what changes and what stays, a primary and a secondary button. Needs the one-time record field and the takeover's layout extracted into a shared component.
  - **E, the new-profile reference.** An existing profile ends up exactly as a new profile on that build: the same active network and the same list, shown however the owner picks for B to D.
- **A Mainnet added by hand.** A person who added Mainnet as a custom network before the update keeps that row as they made it: no second Mainnet row (one row per chain), no Nulo endpoint added, and no arrival (the wallet did not add anything). The alternative is to show the arrival to them too, saying Mainnet is now a default. Recommended: no arrival.
- **A new profile interrupted at birth (B to D).** If the worker stops in the milliseconds between a brand-new profile's first two seed writes on the Mainnet build, that profile reopens looking like an older one and shows the arrival once. Telling the two apart needs one more stored marker. Recommended: accept it (a new person sees the arrival once).
- **Precedence (every option but A).** The arrival is the least urgent full-screen surface: it waits while the migration or integrity barrier, the Testnet reset takeover or the Terms sheet shows, and appears after them. The alternative is arrival before the Terms sheet.
- **Delivery (B to D).** At most once: the arrival is marked seen when the popup reads it, so a popup closed in that instant never shows it (the Testnet reset's "Testnet is ready" toast works this way). Or until answered: it shows at every open until the person presses a button, which adds one acknowledgment call. Recommended: until answered for D and C (the arrival names a choice), at most once for B (a notice).
- **What ships now.** A (A1: the record and the pass; no default is new in A1's build, so nothing appears at all).
- **Recommendation.** D with "Switch to Mainnet" and "Stay on <current network>", never switching by itself: a person moved to Mainnet silently sees empty balances and may not notice which network a send uses; a full screen that names both networks once is proportionate to an event that happens once or twice in a wallet's life, and reuses the reset takeover the owner liked.
