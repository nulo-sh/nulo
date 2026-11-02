# fu2-copy-1: phase 0 (planning)

## Consults

- **Recon** (Sonnet Explore, one agent): six capabilities; reuse map in `recon.md`. Its "11 sites" was 12 (Codex) and it missed `full.vue:254`'s noun; it named `EditProfilePopup.vue:159` a duplicate verdict, which is the unchanged-name state (Opus).
- **Plan audit 1, Codex** (gpt-6.1-sol, high, session 01a19d40): conditional approve. Kept OA-1 over "closest reading"; corrected six of OA-1's drafts against the code; asked for `audit:vue`, the full smoke suite, `store-listing.test.ts`, explicit imports and the arc 3 page test and testid. All accepted.
- **Plan audit 1, Opus 5.5** (Plan leg): conditional approve. Same OA-1 corrections plus "Alpha"; found the website row's spoken name omits its value; showed D5's stop rule measured the wrong width. Two suggested owner asks rejected (plan § Audit verdicts).

## Measurement

- The stop rule, moved to 360 px, fired on the first trial: "1 min · website" cuts the title by 9 px. P93-03 left arc 1 for OA-2, with three measured options (recon § Measured). The scratch specs live under `~/.cache/nulo-backlog/fu2-copy-1/capture/` and were deleted from `tests/e2e/` after each run.
- **Final pass, Codex** (same session, resumed): conditional approve, one finding: arcs 2 and 3 named a narrowed smoke list and no `audit:vue`. Fixed (Phase 3/4 gate is Phase 2's whole gate). Resumed: **approve**, no regression.
