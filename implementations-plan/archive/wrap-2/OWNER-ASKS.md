# wrap-2: owner asks

## A1. Sign the chain banner's before/after pairs (blocks the merge, not the arc)

**Answered, 2026-10-30: signed.** The owner, to the orchestrator's condition "signed if only line breaking changes in the capabilities banner": "wrap-2: same, all good." The orchestrator checked the 360 px before/after pair on head 30f9db7f1: only line breaking changed in the banner's title, sentence and action. Option (a) ships.

- **Surface:** the capabilities window's chain banner, in both states: "Connecting on <dApp chain>" with "Switch wallet to <dApp chain>", and "Wallet switched to <dApp chain>".
- **What changes:** a network name wider than the banner breaks at the banner's edge in the title, the sentence and the action, instead of running past the window's edge and being cut. With seed names nothing changes (measured to the pixel). No copy, row or control changes.
- **Why the action too:** the action repeats the name. Measured, wrapping only the title and the sentence leaves the banner overflowing (a plausible 25-character name: 39 px past at 240 px), so the action's name must break too. Its own words ("Switch wallet to") stay whole.
- **Basis:** P89-01 = A (decision page 89, signed 2026-10-28): a long name wraps inside its box and is not shortened.
- **Options:**
  - (a) wrap the name in all three places (what ships now; recommended);
  - (b) drop the name from the action ("Switch wallet"), so only the title and the sentence wrap: a copy change;
  - (c) no change: the name and the action stay cut at 360 px with a name the field accepts.
- **Pictures:** `screenshots/1365-before-*` → `1365-after-*` (Chrome, 360 and 240 px), linked from the PR body.
