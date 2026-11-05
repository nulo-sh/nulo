# Phase 4: #1389 Send amount

- 2026-10-30 `typedText` reports `refused` when `clean` or `placePoint` loses a character the keystroke inserted; `nextAmountText` then gives `"unreadable"`, ahead of the clamp and on an empty text. Both blur handlers clear a read hint when the text reads or is empty. `send/` 216/216 at head; 14 red at the base copies; with the head keystroke rule and the base card, the three blur cases are red, so the blur change carries them. Lint (after one Biome format fix in the test table) and `typecheck:all` exit 0.
