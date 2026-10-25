# fit-gate-1 phase 0: planning consults and measurements

## Measurements (scratch, uncommitted)

- Probe: a logging-only patch to `apps/extension/tests/e2e/fixtures/type-roles.ts` (`expectInsideView` logged every light-DOM and shadow-root element with `overflow-x` `auto|scroll` and `scrollWidth > clientWidth`, its outermost children past its edge, and every box past the view the `scrolledInView` excuse hid; a second pass modelled a 17 px gutter on every vertical scroller). Kept under `~/.cache/nulo-backlog/fit-gate-1/`, never committed; the worktree was restored after each run.
- Runs, retry 0, all green as on `dev`: smoke Chrome 494 s and Firefox 749 s (six files, 61 narrow checks each); network proverless Chrome 536 s and Firefox 557 s (three files, 23 checks each); fit-240-2's three files on both browsers after the base moved (six checks each).
- Gutter: Chrome 152 without `--hide-scrollbars` and Firefox 153 with `ui.useOverlayScrollbars` 0. A 240 px `overflow: auto; scrollbar-gutter: stable` box: client width 225 / 228 without the base.css rule, 240 with it; `scrollbar-width: thin`: 230 / 234 either way.
- Results: recon.md § The probe.

## Consults
- Classic-scrollbar check of the one `thin` scroller (scratch launch: Chrome without `--hide-scrollbars`, Firefox with `ui.useOverlayScrollbars` 0, the logs window's 240 px test): the source list's bar takes 10 px / 6 px (client 174 / 178 of 184), every row fits (`scrollWidth` = `clientWidth`), nothing scrolls sideways, the test passes on both browsers.

### Codex r1 (gpt-6.1-sol, high, read-only), 2026-10-21

Verdict: conditional approve. Findings and dispositions:
1. (high) D5 as drafted could report less: text reachable past an x-scroller at the page's own width would be recorded as unshown, so its loss at 240 goes unreported. Accepted: the record keeps today's reachability; only the 240 compare cuts at an x-scroller, so the fates it reports are a superset of today's.
2. (medium) Phase 1's base red came from a missing export, not from the old gate accepting the defect. Accepted: the base proof uses `expectInsideView` and `textFates`, which exist on the base.
3. (medium) D1 drops the brief's list silently. Accepted in part: the inventory goes next to `NARROW_ACCEPTED` as a comment; no runtime list until an entry exists. Raised to the orchestrator.
4. (medium) D7 miscounted (13 importers: 9 smoke, 4 network) and the `e2e:agent` command lacked `--retry=0`. Accepted; the substitution for the full suites is surfaced in D7 and the report.
5. (medium) D3 claimed more than measured, and the `thin` source list was unchecked. Accepted: the claim is scoped to the engines measured; the `thin` list was measured with classic scrollbars (above).
6. (medium) `display: contents` ancestors give `holders` a zero box. Accepted as a local fix with one planted control. Rejected: transformed ancestors of fixed boxes (pre-existing in `holders`, not widened here).
7. (low) I2 rests on 84 checks. Accepted: a red is inspected (fractional geometry, scroll reach) before it is classified; the fitting control sits 0.5 px inside the edge. No tolerance added.

### Opus 5.5 Plan leg, 2026-10-21

Verdict: conditional approve. Findings and dispositions:
1. (medium) The planted pushed box had no width at 240 px (auto width after a 250 px margin), so `past` could not hold it and the old fates reader already reported it `gone`. Accepted: fixed sizes; the controls moved to a second scroller so the sweep's success control stands alone.
2. (medium) The base red was a missing export. Accepted (same as Codex r1 2): `textFates` asserted first, `expectInsideView`'s rejection after.
3. (medium-low) `sideways` lacked the probe's visibility filter. Accepted.
4. (low) The probe patch was in the worktree while the leg read it. Already restored before the plan commit; no plan step needed.
5. (low) Fact 1 (the `overflow: auto` shorthand sets `overflow-x`), Fact 3 and D4 (network excused boxes not logged), D7's count, two citations. Accepted; "vertical by intent" moved to the Inferences; the JSON viewer's light-DOM host added to the inventory.
6. (low) D5 adds no failing case beyond `expectLaidOut`'s `cutBy`. Accepted as a statement; D5 kept, since the comment it would otherwise leave stands false at 240 px.
7. (low) D6 needs the owner's words. Accepted: P71-01 B and the class (1) record quoted in UI impact; `ContactRow` cited for Senders.
8. (low) Say how the future list is keyed. Accepted: the scroller's own `data-testid`.
9. (low) D3's `thin` residual as a known-limit issue. Rejected: measured since (every row fits with the thin bar), so nothing remains to limit.

### Codex r2 (resumed, verification), 2026-10-21

Verdict: conditional approve. The r1 conditions are met in the text, and the planted geometry holds at 360 and 240 px. Two findings, both accepted:
1. (medium) Skipping `display: contents` ancestors in `holders` would also change the record, so a fate could be lost (the superset argument breaks). Accepted: only the compare's new cut skips a box-less ancestor; the record is literally today's.
2. (medium) The `display: contents` control was vacuous with text directly inside the wrapper (its own rectangle is zero either way). Accepted: the wrapper holds a sized span with the text.

### Codex r3 (resumed, verification), 2026-10-21

Verdict: approve. Both r2 conditions met; no regression in the two edits.
