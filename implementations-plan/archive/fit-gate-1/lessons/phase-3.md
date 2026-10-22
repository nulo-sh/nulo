# fit-gate-1 phase 3: every surface the pass reads

- `origin/dev` merged first (`7eb5e6c5c`, #1028: the in-place update arrival; no overlap), so one run of D7's files is also the post-merge rerun of fit-240-2's three.
- D7's files at retry 0, armed smoke builds rebuilt after the merge, network proverless through `e2e:agent`. Batches stay under the host's 10-minute command bound.
  - Chrome smoke, 9 files: 59 passed, 1 skipped (`type-roles`, `viewers-csp`, `rows` 218 s; `legal-acceptance`, `restore-outcome`, `registration` 230 s; `backup-imported-account`, `passkey-backup`, `security-backup` 124 s).
  - Firefox smoke, 9 files plus `firefox-sidebar`: 64 passed (`type-roles`, `viewers-csp` 187 s; `rows`, `legal-acceptance` 282 s; `restore-outcome`, `registration`, `firefox-sidebar` 125 s; the three backup files 154 s).
  - Network: Chrome `type-roles-windows` 5 passed (256 s), `in-flight-send-guard` and `cancel-mid-prove` 2 passed (150 s); Firefox 5 passed (311 s) and 2 passed (137 s).
  - No red beyond the two Phase 1 named, so no list entry (D1) and no owner ask.
- `type-roles.test.ts` alone, armed build, retry 0, tests time: base Chrome 114.6 s, Firefox 196.8 s; after Chrome 125.7 s, Firefox 193.0 s. The planted test takes 0.7 s on Chrome and 1.5 s on Firefox; the rest of the difference is host load (load1 between 60 and 150 across the runs).
- Gate: lint, `typecheck:all`, `bun run test`, `bun run test:all` (14 workspaces), `check:plans` exit 0.

## Review loop

### Round 1: Codex (gpt-6.1-sol, high, read-only) and the Opus leg (Opus 5.5, general-purpose), 2026-10-22

Codex: approve. Opus: approve. Findings and dispositions:
1. (Codex, low) The planted test reads `readInsideView` but never runs `expectInsideView`, so dropping the wrapper's `sideways` check stays green. Accepted: at the page's own width A narrows to 200 px, `past` is empty and `sideways` is A, and `expectInsideView` must reject with the sideways message.
2. (Codex, low) Comments restating styles: `OVER_PAGE`'s doc and the two Vue media-rule comments. Accepted for `OVER_PAGE`. Rejected for the Vue comments: they follow the narrow-rule comments #986 shipped (`ContactRow`, Notes) and say what the 359 px breakpoint means and that only a row that does not fit moves.
3. (Opus, low) The 0.5 px-short control tests nothing (B's other boxes already span its width) and leaves `past`'s half-pixel allowance unproved. Accepted: the control is now 0.4 px past B's edge. Green on both browsers, so B's `scrollWidth` stays 240 on both engines for a 0.4 px overflow (I2's boundary, measured).
4. (Opus, low) "named by the testid above it": `closest` includes the scroller itself. Accepted, reworded.
5. (Opus, low) `LAYOUT_STYLES`' doc repeats the CSP reason `withPlanted` now owns, and `OVER_PAGE`'s restates its literal. Accepted, both deleted.
6. (Opus, low) The site test kept its own host code, the last copy. Accepted: folded into `withPlanted`.
7. (Opus, info) D5 has no control: cutting in the record too would still pass the planted test. Left as the written decision; a control would need text past a scroller at the page's own width, which the first assertion forbids.
8. (Opus, info) At 240 px `hasPrivateToPublicTransfers` runs about 10 px into the card's padding, as before the fit; inside the view and not cut. No action (D6).
9. (Opus, adversarial) `holders` walks DOM ancestors, not containing blocks; the compare now cuts at a scroller, so an absolutely positioned box whose containing block lies outside that scroller could read as cut. A false red, never a false pass; Phase 3 found no instance. Recorded as a known limit.

Gate after the fixes: lint and typecheck exit 0; the four planted tests green on both browsers at retry 0.
