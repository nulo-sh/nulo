# Phase 1: the button on the layout

## Measurements (Chrome, 360 × 600, light theme)

- Before: Delete profile 130 px hidden, Change password 121, New profile's Password tab 104, Import profile's phrase form 236; the other screens fit at first paint.
- After (28 px room): 158, 149, 132 and 264 px; one press lands each of the first three at its end. Change password's New password section sits 369 px below the bar, so its press clamps to the end with the repeat field's bottom at 453 of a 501 px fold.
- The new e2e scenario: 6.5 s on Chrome with the shared fixture's boot, 5.7 s on a warm run.

## Codex diff review (gpt-6.1-sol, high, read-only)

- Round 1: one demonstrated finding. A hide during the nudge left `nudging` set, so it replayed on the next show; a hide now clears it, with a test. Two comments tightened.
- Round 2: clean.
- Round 3 (verifying the Opus fixes below): clean; Codex checked each page's last block carries the 20 px bottom padding the room relies on.

## Opus diff review (beside round 1)

- Accepted: with 48 px of room, the button showed while only the last section's 20 px padding was left (Import profile's error screen after its own reveal scroll: 68 px blank, the button over the warning). The room is now 28 px, so room plus padding is the 48 px footprint.
- Accepted: two listener tests could not fail (`measure` reads the current element); they now spy on `removeEventListener`. The marks scan missed unlabelled marks; it counts them per file. The nudge comment named the wrong cause. The Change password test uses the measured geometry. CLAUDE.md's L2 list names the button.

## Gates

- `bun run lint`, `typecheck:all`, `test:all` (3 min), `audit:vue` (3.5 min), `build-storybook`, `lint:actions`: green.
- Full smoke on Chrome at retry 0, at the 48 px-room head: 276 passed, 28 skipped, 27.4 min. At the final head, `security.test.ts` and `auth-flows.test.ts` again: green.
