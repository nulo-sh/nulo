# send-build-1: status

- 2026-11-11: recon done (three Sonnet explorers); plan drafted.
- 2026-11-11: plan audit round 1: Codex reject, Opus conditional approve; plan revised on every finding.
- 2026-11-11: final fresh Codex pass: conditional approve (legacy transferType, FeeCostReadout test, armed update-in-place); all three folded.
- 2026-11-11: final pass resumed: approve. Plan approved under auto-continue; arc a1 starts.
- 2026-11-11: base smoke wall-clock at the plan commit's build, retry 0, on a shared host at load 220 to 300: Chrome 2362 s (green), Firefox 3971 s.
- 2026-11-11: a1 phase 3 green (the page; `RecipientCard` and `SendTypesCard` retired).
- 2026-11-11: a1 Codex fix loop converged in three rounds (reject, reject, approve); rebased onto `dev`.
- 2026-11-11: a1 gates green at retry 0. Smoke: Chrome 1839 s (three reds in two unmigrated specs, fixed and rerun green), Firefox 2926 s. Network, the 24 touched specs: Chrome 2309 s, Firefox 2711 s (one Firefox red, a sub-pixel read, fixed and rerun green on both); the three opt-in specs armed on Chrome; update-in-place from v1.2.0 armed on both. `lint`, `typecheck:all`, `test:all`, `test:ci-gating` green.
