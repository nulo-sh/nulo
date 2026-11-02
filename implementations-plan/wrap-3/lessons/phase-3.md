# wrap-3: arc 2 (phase 3)

## Runs (all at retry 0)

- T4-T6 red on the base copies, each at its missing declaration; green with D4-D7b. The chip test that found the square by "any span" now counts spans, since the label is one.
- `stale-network.test.ts` on the armed base build: Chrome 92.7 s (S1d 12.0 s), Firefox 88.1 s (S1d 12.9 s). S1d with the guard on the base CSS: red at 240 px (chip 161.5 px, body 105, box lines up to 159, RESET 184.3 past their boxes). On the fixed build: Chrome 59.4 s (S1d 10.3 s), Firefox 77.5 s (S1d 13.5 s). The host's load average ran between 99 and 188 through these runs, so the file totals move with it; the guard itself is one rename and one 240 px pass.
- `network-arrival.test.ts` and `type-roles.test.ts` on the fixed build: green on both browsers (their own `skipIf` capture and price tests skipped).
- The scratch capture (seed, 25 `W`s, `AztecSequencerTestnetEU01`; uninjected records only) on the fixed build: every text, chip and full-width button of the arrival, A1, A2, the confirm, the progress and R1 screens inside its box at 360 and 240 px in both browsers, nothing past the view; every seed record's button heights and lines equal to the base's.

## The decision frame's padding

- The frame for P95-04 A used `padding: 12px 16px`. The house reset gives these buttons no padding, and a seed label can already take two lines at 240 px (`STAY ON LOCAL NETWORK`). A scratch probe that set seed labels into the real button measured, at 240 px: 12/16 px grows every two-line seed label from 48 to 62 px and puts `SWITCH TO MAINNET` on two lines; 12 px block only, 62 px; 6/16 px, 50 px on the bordered button. `padding-block: 5px` with no inline padding left every probed seed label at its base height and lines at 360 and 240 px in Chrome and Firefox, and a 25-character name 6 px from the button's top and bottom, as a two-line label sits today. The signed sentence ("Every button with a seed name stays 48 px") decided it over the frame (plan D7).
