# Phase 2: wait for the copy snack to leave (#816)

## Trace

- CI first. Run 39166471199 (job 117791281807, head 85e3302e): three attempts red at `:253`; each
  logged `[select] inside the header's address` then the explorer drag 1.09-1.17 s later, and no
  About line. Run 39168239864 (job 117795684862, head d7a7518f), not in the issue: attempts 1 and 2
  red at `:253`, attempt 3 at `:264` (`legal-about-note's last character is off screen or
  covered`), its link-rows line 1.98 s after the address line. Eight green Firefox runs that day
  logged the link-rows drag 2.13-2.63 s after it.
- Probe (`_probe-drag-about.test.ts`, throwaway, never committed; `taskset -c 0,1`, armed smoke
  builds): a MutationObserver on the snack card, then at each of About's four hit points
  `elementFromPoint`, the snack's rect and opacity, the scroller. Three variants: the spec's path,
  the same after the snack is gone, and a copy made on About itself.
  - Both browsers: popup 600 px tall, About's scroller top 64, sub-page header y 64-120, snack at
    rest y 546-588. After `block: "nearest"` the Legal title's point is at y 593 (scrollTop 6);
    after the note's `block: "end"` its last character is at y 590.5-591.
  - Firefox: card added at 1,819 ms, removed at 3,972 (2.15 s). Coingecko +1.79 s and Legal +1.89 s
    on top; the note at +2.06 s hit `snackbar-title`, the card mid-leave at y 564-606, opacity 0.08.
  - Chrome: the foot's hit tests ran 0.73 s after the copy, the card at rest: all on top. The copy
    on About caught the entering card at y 550-592: the note hit `snackbar`.
- So the band under the resting card (588-600) is swept by the card's 20 px slide on enter and on
  leave. The spec's foot points sit in it; Firefox's slower drags put them near +2.0 s.

## Implementation

- The wait and its comment landed in `232d3581`. Base, unfixed spec, one run per browser at retry
  0 (`taskset -c 0,1`, armed builds): Firefox file 51.0 s, drag test 5.6 s; Chrome 34.7 s, 3.4 s;
  both 8 passed.
- Control A (unfixed spec; the popup adopts `[data-testid="snackbar"] { transition-duration: 4s
  !important; transition-timing-function: step-start !important }`, so a leaving card holds its
  swept-down place for 4 s; a wait for a card's leave class before About's scroll): red, `Error:
  legal-about-group's first character is off screen or covered` at the original `:253`, #816's
  message.
- Control B (the fixed spec under the same stylesheet, no other edit): green, 1 passed. The wait
  held until the card was removed, about 4 s past its usual end.
- Both run alone with `-t "a drag selects"`, so the test's time includes the browser's launch.
  The spec was restored from the committed fix after each; `git status` clean.

## Validation (232d3581)

Every run: `NULO_E2E_MIGRATION_FIXTURE=1 NULO_E2E_CSP_REPORT=1 env -u EXTENSION_PATH taskset -c 0,1
bun run test:e2e --retry=0 tests/e2e/navigation.test.ts`, armed builds, load1 under 150 at start,
`8 passed` every time.

| Browser | Runs | File (s) | Drag test (s) |
|---|---|---|---|
| Firefox | 10/10 | 52.3, 50.2, 51.5, 52.1, 50.7, 50.0, 52.2, 48.0, 48.9, 43.5 | 6.7, 6.5, 6.5, 6.8, 6.9, 6.9, 7.1, 5.7, 6.6, 6.2 |
| Chrome | 5/5 | 29.7, 35.8, 35.1, 35.8, 30.8 | 4.3, 4.9, 4.8, 4.7, 4.3 |

Base (unfixed, one run each, same host): Firefox file 51.0 s, test 5.6 s; Chrome 34.7 s, 3.4 s.
CI before: Firefox test 4.9-6.1 s, file 27.6-36.9 s (eight green shards); Chrome test 2.6 s, file
21.3 s (run 39172485916).

## Review round 1 (diff a4edec20..628141e3)

- **Codex** (gpt-6.1-sol, high, session 01a1512e): approve, 1 finding. #1 the seeds still drive
  phase 1: accepted, both rewritten for phase 2. It found no hold-open path (no focusable child on a
  success without an action; Navigation's clicks are synthetic; a card under a still pointer takes
  no hover hold) and no other hit test in the sweep.
- **Opus diff review**: approve, 3 nits. #1 a renamed label makes the gone-wait a no-op: accepted,
  `waitForToast(page, "Address is copied")` after the click pairs it with a presence check. #2
  "both drags below" is ambiguous with three drags after it: accepted, the comment now says the
  next two. #3 the Firefox cost is about 0.4 s, not 0.3: accepted.
- The spec fixes landed after the batch, in their own commit; the batch reran on the final head.

## Validation (e3871553), the round-1 fixes

| Browser | Runs | File (s) | Drag test (s) |
|---|---|---|---|
| Firefox | 10/10 | 48.8, 45.8, 44.8, 55.9, 57.1, 43.1, 44.1, 41.7, 47.2, 47.1 | 6.9, 6.5, 5.9, 6.7, 7.4, 6.5, 6.5, 6.3, 6.6, 5.4 |
| Chrome | 5/5 | 32.5, 45.6, 44.5, 45.5, 41.3 | 4.3, 5.2, 5.2, 5.5, 5.0 |

## Review rounds 2-3 (Codex resume, session 01a1512e)

- **Round 2**: conditional approve, 1 finding. The presence check ran after `copies()` and
  `getAccountAddress()`, a storage read; a read slower than the snack's 2.15 s life would time it
  out though the copy worked. Accepted (`455f7b90`): the check now runs straight after the click.
  Codex's extra step, reading the address before the click, was not needed: the handler records
  the copy before it opens the snack, so the assertion after the check still holds.
- **Round 3**: approve, no findings. The loop converged.

## Validation (30821a65, the merge of origin/dev at 0c340d37: #817, #822)

Rebuilt armed for both browsers; `bun run lint`, `typecheck:all`, `test:all` exit 0.

| Browser | Runs | File (s) | Drag test (s) |
|---|---|---|---|
| Firefox | 10/10 | 54.6, 55.8, 48.7, 43.0, 45.2, 54.4, 50.6, 46.8, 45.9, 46.6 | 7.4, 7.5, 7.4, 6.5, 6.4, 6.6, 6.9, 6.1, 6.6, 6.0 |
| Chrome | 5/5 | 31.3, 32.8, 35.7, 32.3, 33.9 | 4.1, 4.5, 4.5, 4.3, 4.6 |

Every run `8 passed` at retry 0 under `taskset -c 0,1`. Against the base runs the drag test grew
by the snack's remaining life: Firefox 5.6 to 6.0-7.5 s, Chrome 3.4 to 4.1-4.6 s.
