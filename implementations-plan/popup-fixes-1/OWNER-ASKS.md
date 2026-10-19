# popup-fixes-1: owner asks

Two asks, both for arc 2. Arc 1 (#773, #770, #582, #584, #586, #593) touches neither surface and ships now.

## OA-1: Home's ghost token rows (#786)

**Surface**: Home's token card while it waits with nothing to name yet: two grey placeholder rows, shown after 300 ms, replaced by the token rows when they arrive.

**Today**: each placeholder row is about 41 px tall and its two bars on each side touch (their gap asks for a size the scale lacks, so it renders as none). The token row that replaces it is 53 px, so the card grows when the rows land.

**Options** (from the issue):
- **A**: the bars sit 2 px apart, as in a loaded row, and each placeholder row is 53 px, as tall as the row that replaces it. The card no longer grows when the rows land.
- **B**: the bars sit 4 or 6 px apart; the rows grow to 45 or 47 px, still short of 53, so the card still grows on arrival.
- **C**: leave it.

**Recommendation**: A. It fixes both defects the issue names, and it uses the box the working-default rows already use (#654).

**What ships now**: nothing on this surface; arc 2 waits for the answer. Pictures before and after at 360 px in both themes ship with arc 2.

## OA-2: Send and Receive on a token's page (#626)

**Surface**: a token's page, whose hero shows the same Send and Receive buttons as Home's (one component draws both).

**Today**: on both pages the two buttons can only be clicked; Tab skips them and Enter or Space does nothing. The approved fix (#626) makes Home's reachable: two Tab stops after the hero, Enter and Space press them, and a 2 px accent ring shows on keyboard focus (the same ring as the wallet's other buttons). Nothing changes for a mouse or a tap.

**Options**:
- **A**: the token page's Send and Receive get the same fix (two Tab stops, the same ring).
- **B**: Home only; the token page keeps buttons a keyboard cannot reach. This needs a switch on the component that keeps the defect on one page.

**Recommendation**: A. One component, one behaviour, and the wallet's keyboard rules already ask it of every custom control.

**What ships now**: nothing on either page; arc 2 waits for the answer. Pictures of both pages, focused and unfocused, ship with arc 2.
