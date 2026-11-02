# w3-import-1: phase 0 (planning)

## Consults

- **Recon** (Sonnet Explore, one agent): five capabilities; reuse map in `recon.md`. Found the sweep's occupied-check rule to reuse (D1), Create's lifetime fence and its departed-page tests (D2), and that no test round-trips `backup()` into `restore()` (T3). Sibling slices checked: no other demonstrated export/restore mismatch.
- **Plan audit 1, Codex** (gpt-6.1-sol, high, session 01a19e2c): conditional approve, four findings, all accepted. (1) D2 left a window: the pointer write is awaited before the bootstrap, so a departure there still started one; fixed with a check after it and the facade's `unless`. (2) T1-T3 setup made precise (arm T1's fault inside liveness call 2; T2(c) asserts the hydrate, not the bootstrap; T3 restores into a fresh store and counts the row). (3) A test green on base goes back to its trace before any known-limit close. (4) The orphan sweep runs at the next worker's key-ready, not the next unlock; D3 promises only that new exports hold no Pending row.
- **Plan audit 1, Opus 5.5** (Plan leg): conditional approve. Found the same D2 window and T1 arming as Codex independently; added the T2 `history.state` reset, the C1-dispose rationale, the lock trace (Fact 7) and a pre-existing residual (a kept row never announced), filed as a known limit in Phase 2.
- **Final pass, Codex** (same session, resumed): conditional approve, one wording finding: D2's rationale claimed the profile exists through the whole import; narrowed to completion after creation. Resumed: **approve**.
