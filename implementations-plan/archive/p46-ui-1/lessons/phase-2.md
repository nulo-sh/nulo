# Phase 2 — #651 header chips

- The drawn 6px sides fit "TESTNET" with zero slack. At 360 px Chrome laid the text at 53.094 px in a 53.078 px box, so the new appearance check failed by 1/64 px. The page's "53 of 53 px" came from integer `scrollWidth`/`clientWidth`, which hide that. With 5px sides the chip sits at its max-content (text = box = 53.09 px in Chrome, 53.08 in Firefox), and the row keeps about 2px.
- The 6px run is also the red proof: the check fails when the room is short, and 10px sides leave less room.
- Gate: lint 0, typecheck 0, `vitest src/components src/utils/type-role-ban.test.ts` (1128 passed, 1 skipped as before), appearance.test.ts green on Chrome and Firefox. The lock chip is 28 px, as tall as the network chip, in both browsers.
