# fit-gate-1 phase 1: the repaired rule and its proof

- Base timings, `type-roles.test.ts` alone at `c213c760c`, armed build, retry 0: Chrome 114.6 s of tests (124.6 s wall), Firefox 196.8 s (204.1 s wall).
- Base red, both browsers: the planted test with the base readers fails its first assertion (`expected [] to deeply equal [ 'gone tr-side-pushed' ]`), and the base `expectInsideView` passes the planted page at 240 px (logged, then the log line removed).
- The three planted tests (layout, fates, sideways) share one planting helper, `withPlanted`, instead of a third copy of the host code.
- First green run named the token metadata card's scroller `testid: null`: `PopupCard`'s wrapper sits under no testid. A sideways scroller now also reports the first testid it holds (`holds: popup-card-body`).
- Gate, retry 0 (`type-roles`, `viewers-csp`): Chrome 21 passed, 1 skipped, 2 failed; Firefox 22 passed, 2 failed. The failures are the token metadata check at 240 px (the card's scroller 243 / 240, two 12 px icons at 231-243) and the identifier sweep, which reds because the seeded visit stopped there. As planned: the fit lands in Phase 2.
