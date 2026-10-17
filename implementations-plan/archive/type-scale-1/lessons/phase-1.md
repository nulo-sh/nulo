# Phase 1: the guard and the layout predicate

## The guard

- `type-role-ban.test.ts`: a `type--X` in `composes … from global` or a static class, and a `<Text :variant>` literal in result position (the whole expression, a conditional's branch, either side of `||` / `??`), that names no role is a hard finding under a new rule id, `role` (the static `variant` one moved to it from `text-prop`). `namedRoles` reads the same result-position literals, so a comparison operand no longer counts as a named role; no carrier on today's tree changes (the three bound `:variant`s on a `<Text>` name the same roles either way).
- Self-tests: one hard case per form (bound variant, static class, composes) beside the existing static one; success controls for each; the comparison-operand control (`kind === 'address' ? 'meta' : 'body'`).
- Today's tree: no finding. `scanSheet` went to cognitive complexity 17 with the composes loop inline; the check moved to `scanComposes`.

## The layout predicate

- `fixtures/type-roles.ts`: `ReadScope` `laid-out` (role-bearing ∪ visible own-text, body descendants), `TypeReading.field`, and `overflowingText` / `expectLaidOut`. A native field's painted span is its box (it never paints past it), so the ancestor-clip test judges its box, not its value.
- "Without an ellipsis" reads as an ellipsis that draws: `text-overflow: ellipsis` on a box whose overflow is not `visible`. An ellipsis declared on a visible box draws nothing.
- The new layout test sits beside the site-reader test, not inside the probe test: the probe test reads roles only, and the host-fixture pattern lives in the site test. Its three controls: a field an ancestor cuts (reported), text past its own box with overflow visible (reported), a field scrolling a 66-character address (not reported).
- The panel test's laid-out read runs before the probes are placed: the probes are not the page.

## Wall-clock, before (base tree, retry 0)

| Suite | Chrome | Firefox |
|---|---|---|
| smoke `type-roles.test.ts` (vitest Duration) | 74.1 s | 122.6 s |
| network `type-roles-windows.test.ts` (file) | 126.2 s | 163.1 s |
| network `send-amount-exact.test.ts` (file) | 34.1 s | 41.0 s (rerun) |

- Firefox's first base run failed `send-amount-exact.test.ts:311` (the 10 s wait for "≈ 25 TST" after a USD entry) at load ~140; the same file alone on the same tree passed (41.0 s). A flake under load, base tree, not this lane's code.

## The gate on the base tree: red (2026-10-17)

The predicate as specified, run on the unchanged UI (Chrome smoke at first assertion, then a throwaway diagnostic that logged instead of asserting over every swept surface, both suites, both browsers):

| Element | Where | Browsers | scrollWidth / clientWidth | Text past its box | Kind |
|---|---|---|---|---|---|
| `account-address-text` | Header, every popup page | both | 119 / 101 | 0 | measurement: `.copy_reveal`, a hover icon at `left: calc(100% + 6px)` (`Header.vue:356-367`), counts in `scrollWidth` |
| every inline element with text (32 in the windows, 13 in smoke, e.g. `cap-detail-toggle` 72 / 0) | everywhere | Firefox | n / 0 | 0 | measurement: an inline box's `clientWidth` is 0; Firefox's `scrollWidth` for it is not |
| `import-contact-row` "changes to", `fee-estimate` "You pay nothing…" | contacts import, execute window | both | 63-83 / 1, 382 / 1 | 62-380 | screen-reader-only spans (1 px box, `clip-path: inset(50%)`), drawn at no size on purpose |
| `cap-disclosure-chevron` | capabilities window | Firefox (text-extent variant only) | — | 2 | an icon-font ligature ("chevron_right"), a glyph, not text |
| **`cap-scroll-area` "Transact"** | capabilities window, Details open, the permission table's head (`DetailsTable.vue:71-76`, tracks `minmax(0,1fr) 54px 34px 54px 14px`, gap 4 px, `type--label` 10 px) | **both** | **58 / 54** | **3.8** | **genuine**: the word runs past its 54 px track into the 4 px gaps; it collides with nothing visible today (screenshot `capabilities-details`, before set). At `label-section` 11 px it is about 64 px |

- The Warning holds: "Transact" is a base element failing the predicate, under the specified measurement and under a text-extent one. Phase 1 stops; no list, no narrowing. OA-1's "what ships now" (today's look) cannot pass for it, since today's look already fails.
- The rest are measurement defects of `scrollWidth > clientWidth`: it counts positioned non-text descendants, it reads 0 for an inline box's client width in Firefox, and it judges text drawn at no size on purpose.

### Wall-clock with the diagnostic and the before shots (not a clean cost figure)

| Suite | Chrome | Firefox |
|---|---|---|
| smoke `type-roles.test.ts` | 94.2 s | 138.3 s |
| network `type-roles-windows.test.ts` | 144.7 s | 195.9 s |
| network `send-amount-exact.test.ts` | 46.4 s | 50.1 s |

These runs added a second in-page pass per read and 15 shot pairs per browser, at a higher host load than the before runs; they bound the added reads' cost from above only.

## The corrected measurement (D8), on the base tree (2026-10-17)

- Implemented as D8 states; the layout test now has nine controls: reported, a field an ancestor cuts, a block running past its box, an inline span running past its line's box, a role-bearing flex cell whose children fit themselves but not the cell; not reported, a field scrolling a 66-character address, a short inline span, fitting text with a positioned icon past it, a rotated icon glyph; not even read, a screen-reader span (`clip-path: inset(50%)`).
- Result, both suites, both browsers, retry 0: every surface clean except one element, the capabilities window's head word "Transact" (`cap-scroll-area`, 3.8 px past its 54 px track, Chrome and Firefox). Smoke green on both browsers (the Firefox toolbar panel included), the execute windows green with the longest dApp payload, `send-amount-exact` green.
- The blocker is OA-5. Phase 1 stays ✗ until it is answered; Phases 2 to 4 have not started.

| Suite (retry 0, no shots) | Chrome before → after | Firefox before → after |
|---|---|---|
| smoke `type-roles.test.ts` | 74.1 → 80.4 s | 122.6 → 175.3 s |
| network `type-roles-windows.test.ts` (one test red) | 126.2 → 154.8 s | 163.1 → 185.6 s |
| network `send-amount-exact.test.ts` (unchanged code) | 34.1 → 45.4 s | 41.0 → 47.1 s |

- The figures are noise-bound: the after runs started at load 133-145 (before: 116), and Firefox's tests that read no layout slowed as much (probe test 8.5 → 13.8 s, faces 1.1 → 2.8 s) as those that do; in Chrome the two layout-heavy smoke tests went 17.2 → 16.9 s and 20.1 → 17.0 s. The reads' cost is under the noise; a clean figure needs a quiet host.

## Resumed on the tree merged at f695dea4 (2026-10-17)

OA-5 answered A (decision page 34). The gate re-runs on the merged tree: before figures with dev's spec files, then the base gate with the before shots, then the answer applied.

| Suite (retry 0, no shots, dev's spec files) | Chrome | Firefox |
|---|---|---|
| smoke `type-roles.test.ts` (vitest Duration) | 61.7 s | 121.8 s |
| network `type-roles-windows.test.ts` (file) | 124.9 s | 165.2 s |
| network `send-amount-exact.test.ts` (file) | 35.0 s | 46.5 s |

Host load 39-115 across the pair. These are the before figures the PR states.

### The gate on the merged base, with the before shots

- Smoke `type-roles.test.ts`, the gate asserting: green, Chrome 83.1 s, Firefox 141.9 s (vitest Duration; 15 shot pairs each, so an upper bound).
- Network `type-roles-windows.test.ts`: red on one element in both browsers, the same as before the merge: `cap-scroll-area` "Transact", 3.8 px past its 54 px track. The execute window's three tests green, the longest payload included; `send-amount-exact` green.
- Before shots: 15 pairs (light and dark) per browser, uncommitted until Phase 4, the capabilities window shot with Details open before its sweep so the known failure cannot drop it.
- OA-5 A then went in as its own commit (dc49623a): the head's Simulate and Transact tracks 66 px, the function-label track 66 px. Only the capabilities window renders `DetailsTable`, so the windows spec on both browsers is the re-run; smoke's green above stands.

### The gate with OA-5 A: green

| Network `type-roles-windows.test.ts` (retry 0, no shots) | Chrome | Firefox |
|---|---|---|
| before (dev's spec files, merged base) | 124.9 s | 165.2 s |
| after (the gate asserting, OA-5 A) | 113.9 s | 140.8 s |

- All four tests green on both browsers; `overflowingText` empty on every capabilities and execute state, the longest payload included. Load 50-110: the after figures are faster than the before ones, so the gate's added reads cost less than the host's noise.
- Fast layers on dc49623a: lint 0, typecheck:all 0, test 0.
