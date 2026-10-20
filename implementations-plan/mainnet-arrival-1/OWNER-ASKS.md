# mainnet-arrival-1: owner asks

A1 depends on none of these and ships no visible change. OA-1 is answered (P66-01, D). A2's PR stays a draft until OA-2 is signed.

## OA-1: what an existing profile sees when a new default network (Mainnet) arrives (answered)

**Answered, decision page 66, P66-01, 2026-10-19:** D, "a one-time full-screen arrival in the style of the Testnet reset takeover", with the note "though I have conflicts with "create your first" since it's virtually created. I'm afraid the user will think it will submit a transaction." The orchestrator kept the recommendations below where the owner said nothing (plan D-orch-3).


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

## OA-2: the arrival's words

- **Surface.** The arrival (OA-1's D), full screen in place of Home, the first time a profile opens on the build that adds Mainnet, and at every open until the person presses a button. Layout: the reset takeover's, with its top bar (the active network's chip, LOCK), an eyebrow, a title, a body, a box with three checked lines, and two buttons. Behaviour, already decided: "Switch" only moves the active network (no transaction, nothing created on chain; Nulo derives the Mainnet account on the device, as on any switch); "Stay" keeps the person where they are; both end the arrival for good.
- **Constraint from P66-01's note.** No word may suggest that pressing a button creates something on chain or sends a transaction. Neither variant says "create"; both say outright that switching sends nothing.
- **Pictures** (Chrome, the popup's 360×600 at 2×, over Home on Testnet, with a test-planted Mainnet): [A light](screenshots/a2-copy-a-light-chrome.png), [A dark](screenshots/a2-copy-a-dark-chrome.png), [B light](screenshots/a2-copy-b-light-chrome.png), [B dark](screenshots/a2-copy-b-dark-chrome.png). B is A's screen with its text swapped in place, for comparison only.

| Part | A (ships now) | B |
|---|---|---|
| Eyebrow | NEW NETWORK | NETWORK ADDED |
| Title | Mainnet is in your wallet | Mainnet is now one of your networks |
| Body | This version of Nulo adds Mainnet to your networks. You are still on Testnet. | Nulo added it in this update. Nothing has changed. You are still on Testnet. |
| Box label | SWITCHING TO MAINNET | IF YOU SWITCH |
| Line 1 | Sends nothing and costs nothing. It only changes the network you see. | No transaction is sent, and nothing is paid. |
| Line 2 | Shows your Mainnet account, at its own address. | Your Mainnet account is already there, at its own address. |
| Line 3 | Keeps Testnet as it is. You can switch back at any time. | Testnet keeps everything it holds. Switch back whenever you like. |
| Buttons | SWITCH TO MAINNET · STAY ON TESTNET | same |

"Mainnet" and "Testnet" are the rows' names as the person sees them: a renamed or custom current network shows its own name ("STAY ON MY NODE").

- **What ships now.** A, in `apps/extension/src/components/network-arrival/copy.ts`. Nobody sees it in this build, because no default is new; it first shows on the build that adds Mainnet (#80). The PR stays a draft until this is signed.
- **Recommendation.** A. It names what the button does in the reader's terms ("changes the network you see") before the reassurance, and line 2 says the account is shown rather than created or "already there". B's "already there" answers the owner's "virtually created" more literally, but it may raise the question of where the account came from.
