# recipient-cap-1, phase 1: build the pick

The owner's page 84 answers (signed 2026-10-23 00:19Z): A, 50 rows, the proposed line, today's order, exact whole names first. Base `2c0c30d98` (`origin/dev` at `a2f9e7d03` merged).

## Built

- `recipient-search.ts`: one pass splits the matches into whole-name matches and the rest, each in the given order; initials and addresses stay with the rest.
- `RecipientField.vue`: `MAX_SHOWN = 50`, `shownContacts`, `moreCount`, `moreSentence`; the wrapper `send-destination-popover` takes the position, border and background; the listbox keeps the scroller at `max-height: 156px`; the line `send-destination-more` (`caption`, `tertiary`, `aria-hidden`, padding and hairline as the pictured arm A); the status `send-destination-more-live` (visually hidden, `role="status"`, polite, atomic) is mounted with the field, outside the `v-if`/`v-else`, so it exists before any text lands in it.
- Tests: four `RecipientField` cases over 1,051 candidates (the cap, the line and the status, "1 more match", the empty status at 50 or fewer, narrowed and closed, Up/Down/Enter over the drawn rows, the highlight pushed past the cap); two `recipient-search` cases (I1's 50 "Account 1 NN", and 50 "Alice LongNN" with initials "AL" behind "Al"); two existing normalisation cases now expect the whole name first. Each new component case fails with the cap lifted (5,000), and the Up case fails with the arrows reading every match.
- Smoke: `send-keyboard.test.ts` seeds 51 "Zed N" contacts beside the three "Acc" ones, waits on the popover's fade, and adds the "z" segment (50 rows, the line below the rows, inside the box and the popup and uncovered, Up reveals row 49 whole, Enter picks that row's contact).

## Probe rerun (Chrome, armed smoke build, one session)

Scratch probe v2 (`~/.cache/nulo-backlog/recipient-cap-1/tools/_probe-recipient-v2.test.ts`, run by `run-v2.sh`, never committed): before each timed keystroke it types "c", waits for the full total (rows and the line's count), and clears; each sample asserts its rows and line. "Today" builds `RecipientField.vue` and `recipient-search.ts` from `2c0c30d98`.

| Build | Contacts | Samples (ms, in order) | Median | Range | Rows / line every sample | load1 |
|---|---|---|---|---|---|---|
| today | 50 | 58 69 70 59 63 | 63 | 58-70 | 51 / none | 116-124 |
| today | 5,000 | 1615 1104 1279 1914 2148 | 1,615 | 1,104-2,148 | 5,001 / none | 119-129 |
| pick | 1,000 | 71 67 76 51 80 | 71 | 51-80 | 50 / "…951 more matches." | 116-124 |
| pick | 5,000 | 88 59 61 79 60 | 61 | 59-88 | 50 / "…4,951 more matches." | 112-120 |

Gate: the pick's 5,000-contact median (61 ms) sits inside today's 50-contact range (58-70 ms). Today's 5,000 figures run higher than phase 0's (1,169 median) at a higher load (load1 112-129 against 65-89).

Shots: `~/.cache/nulo-backlog/recipient-cap-1/shots-arc1/pick-{light,dark}.png` (1,000 contacts, "c" typed, popup 360 × 600), the same layout as the pictured arm A.
