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
