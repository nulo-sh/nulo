# wrap-3: owner asks

All three asks concern the stale-network takeover and the network arrival only, which arc 2 changes. Arc 1 (the dApp windows and Full Backup's notice) touches none of them. Measurements: [recon.md](recon.md) § Measured; the numbers are the same in Chrome and Firefox.

## OA-1 (arc 2): the takeover's and the arrival's full-width buttons with a long network name

- **Surface**: the full-width buttons under the takeover and the arrival that name a network: `RESET <NAME>`, `GO TO <NAME>`, `SWITCH TO <NAME>`, `STAY ON <NAME>`. Each sits on a line of its own and is 48 px tall.
- **What happens**: a 25-character name runs past the button. With 25 `W`s that is 64-66 px at 360 px and 184-186 px at 240 px; with `AztecSequencerTestnetEU01` it is 80-82 px at 240 px. The window's edge cuts the end of the name.
- **Why it is asked**: P94-14 signed a wrapping rule only. Wrapping keeps the text inside the button's sides, but the name then takes three or four lines, and the 48 px button cannot hold them. The text spills 6 to 25 px above and below the button. Holding it needs the button to grow, which is a layout change.
- **Options**
  - **A (recommended)**: the name wraps and the button grows to fit it. Every button with a seed name stays 48 px. With 25 `W`s at 240 px a button is three or four lines tall, and the screen's text above it scrolls in less room. This follows #1232's pick: wrap, never shorten.
  - **B**: leave the buttons as they are. The window's edge cuts the name; the title above names the network in full.
  - **C**: name no network on these buttons, for example `RESET NETWORK`. That is a copy change.
- **What ships now**: B. Arc 2 wraps the text above the buttons and leaves the buttons unchanged unless the answer arrives first.

## OA-2 (arc 2): the network chip in the takeover's and the arrival's top bar

- **Surface**: the chip at the top left of the takeover and the arrival. It names the network in upper case, in at most 60% of the bar, beside the Lock button.
- **What happens**: a 25-character name runs past the chip and under the Lock button. With 25 `W`s that is 89-104 px at 360 px and 161-176 px at 240 px; with `AztecSequencerTestnetEU01` it is 7-22 px at 360 px and 79-94 px at 240 px.
- **Why it is asked**: P94-14 keeps the wrapping rule off a row whose buttons share a line. The chip and the Lock button share this row, so the panel does not apply it.
- **Options**
  - **A (recommended)**: the chip's text ends in an ellipsis inside the chip, as Home's network chip does. The title below names the network in full, and the bar stays one line. This shortens the name in the chip, so it overrides #1232's "never shorten" for this chip.
  - **B**: the chip's text wraps inside the chip, which grows taller. The Lock button has no words to break, but this lifts P94-14's bar for this row.
  - **C**: leave the chip as it is. The text runs under the Lock button.
- **What ships now**: C, unchanged, unless the answer arrives before arc 2 runs.

## OA-3 (arc 2): the reset confirm, a sixth place

- **Surface**: the confirm that opens over the takeover when a person presses Reset: the upper-case name above the title, and the sentence under it (`Nulo removes your <name> tokens and history from this device. …`).
- **What happens**: with 25 `W`s the sentence runs 27 px past its box at 360 px and 147 px at 240 px, and the name above the title 37 px at 240 px. With `AztecSequencerTestnetEU01` they run 9.6 and 37 px past at 240 px. The title already wraps.
- **Why it is asked**: #1397 named five places, and P94-14 signed those. This confirm is a sixth, found while measuring the takeover.
- **Options**
  - **A (recommended)**: the two texts wrap at their box's edge, as P94-14 does for the five places. The Cancel and Reset row stays as it is. Seed names render as today.
  - **B**: leave the confirm as it is.
- **What ships now**: B, unless the answer arrives before arc 2 runs.

## Signed already (no answer needed)

- A long name wraps at its box's edge on the dApp windows' identity line, the execute window's scope banner, Full Backup's reset notice (arc 1), and in the text of the takeover, its progress screen and the arrival (arc 2). Signed: P94-14 = A (2026-11-01) under #1232's pick; seed names render as today.
