# fu2-home-1: owner asks

Both asks concern arc 2's surfaces only: the header's network chip and Manage Networks. Arc 1 (the switch toast, Receive, the new-account toast, the Get started card) touches neither. Measurements: [recon.md](recon.md) § Measured (Chrome).

## OA-1 (arc 2): a word for the red dot

- **Surface**: the header's network chip (its name for screen readers) and the active row in Settings › Networks.
- **What happens**: the dot has three colours. Grey while the wallet reads the node, green once it answers, red when the node does not answer or answers for another chain. P93-44 names two words, "Connected" and "Waiting for the network".
- **Options**
  - **A (ships now)**: green reads "Connected"; grey and red both read "Waiting for the network". Manage Networks keeps its green "active" dot beside the word.
  - **B (recommended)**: red reads "Cannot reach the network", the takeover's own wording for a node that does not answer, and the active row's dot in Manage Networks takes the header dot's colour, so the word and the dot beside it agree.
  - **C**: A, and red reads "Not connected".
- **Why it is asked**: a third word is copy the page did not sign.

## OA-2 (arc 2): room for the full name at 360 px

- **Surface**: the header on every popup page at 360 px.
- **What happens**: P93-44 B signed "The chip fits the full name at 360 px". Alpha (39 px) and Testnet (53 px) already fit. "LOCAL NETWORK" needs 101 px, and with the account address whole the row leaves 90, so it reads "LOCAL N…". The chip's 120 px cap is not what cuts it: the row is 11.3 px short. The signed picture shows the name whole only because its prototype pushed the lock chip into the right margin (5.5 px from the edge instead of 16).
- **Options**
  - **A (recommended)**: take the room on the right: the gap between the account and the chips from 12 to 8 px and the header's right padding from 16 to 6 px (14 px, 2.7 px to spare). The avatar stays on the page's 24 px column; the lock chip sits where the signed picture shows it.
  - **B**: use the narrow row's spacing from 360 px up: left 16, right 12, gap 8 (16 px, 4.7 px to spare). The avatar moves 8 px left of Home's content edge.
  - **C (ships now)**: keep today's spacing. "LOCAL N…" stays cut at 360 px; Alpha and Testnet show whole.
- **Why it is asked**: each option moves the header on every page, and the chip's 8 px sides were the owner's call (#1363). With A or B the 120 px cap also goes.
- Both widths stay measured in Firefox before arc 2 ships an answer.
