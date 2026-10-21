# Phase 1 (and 3): the contract and the display

- `SendCheckOutcome` gained `refused`; the exhaustive display records (`CHECKED_DISPLAYS`, `CHECKED_LABELS`) do not compile without their entry (TS2741), so phase 3 landed in the same commit.
- `isSendCheckMove` became a `switch` on `from.check` to stay under Biome's cognitive ceiling with the refused moves.
- `bun run baseline:storage` rewrote stamp 0 (no pin yet); the `journal.refused` golden decodes. A golden written by a script must go through `biome format` before the snapshot test reads it.
- Gate: lint 0, typecheck:all 0, test:all 0 (extension 14632 passed).
