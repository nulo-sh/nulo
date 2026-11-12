# Status: token-icons-build-3

- 2026-11-12 plan drafted at 1593cf027 (recon, plan, owner asks: none).
- 2026-11-12 Codex plan audit (01a1d04b): conditional approve; conditions folded in (D1 guard, D5 order, title, spec files, I1 order).
- 2026-11-12 Codex final fresh pass (01a1d054): approve.
- 2026-11-12 phase 1: base build red at the new assertion on Chrome (338.09 > 324) and Firefox (337.98 > 324); rows, token-list, home-links green (Chrome 331 s, Firefox 458 s for the four). Cut committed; TokenImportRow test green.
- 2026-11-12 phase 2 (B2) and phase 3 (B1): unit gates for TokenImportRow, TokensView, TokenSeedRow green; B1's test red without the class.
- 2026-11-12 typecheck:all caught a false green in the B2 view test (an absent fixture icon) and a default parameter that re-stamped the unstamped record: fixed, red on the pre-B2 view.
- 2026-11-12 Codex loop round 1 (01a1d070): conditional; route-away wait and a comment cut applied. Head build: type-roles green on Chrome (134 s). Measurements on Chrome and Firefox: 28 characters clear the spinner by 18.9 / 19 px and the × by 16.9 / 17 at 360 px; 32 end flush at the control; at 240 px both cut flush; no sideways scroll.
