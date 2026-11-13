# send-build-1: status

- 2026-11-11: recon done (three Sonnet explorers); plan drafted.
- 2026-11-11: plan audit round 1: Codex reject, Opus conditional approve; plan revised on every finding.
- 2026-11-11: final fresh Codex pass: conditional approve (legacy transferType, FeeCostReadout test, armed update-in-place); all three folded.
- 2026-11-11: final pass resumed: approve. Plan approved under auto-continue; arc a1 starts.
- 2026-11-11: base smoke wall-clock at the plan commit's build, retry 0, on a shared host at load 220 to 300: Chrome 2362 s (green), Firefox 3971 s.
- 2026-11-11: a1 phase 3 green (the page; `RecipientCard` and `SendTypesCard` retired).
- 2026-11-11: a1 Codex fix loop converged in three rounds (reject, reject, approve); rebased onto `dev`.
- 2026-11-11: a1 gates green at retry 0. Smoke: Chrome 1839 s (three reds in two unmigrated specs, fixed and rerun green), Firefox 2926 s. Network, the 24 touched specs: Chrome 2309 s, Firefox 2711 s (one Firefox red, a sub-pixel read, fixed and rerun green on both); the three opt-in specs armed on Chrome; update-in-place from v1.2.0 armed on both. `lint`, `typecheck:all`, `test:all`, `test:ci-gating` green.
- 2026-11-12: a2 started on send-build-1-a1 at 9700932b0; OA-1 answered (a) per the answers file.
- 2026-11-12: a2 phase 5 green: audit:vue (18409 tests), test:all, build-storybook.
- 2026-11-12: a2 Codex loop converged in three rounds (reject, reject, approve); Opus conditional approve beside round 1, all adopted. Final gates next.
- 2026-11-12: a2 gates green at retry 0 on 0f9124df6: audit:vue, test:all, build-storybook, lint, typecheck:all, test:ci-gating, check:plans. Smoke: Chrome 1714 s, Firefox 2795 s, no red. Network, the 24 touched specs: Chrome 2225 s, Firefox 2593 s, no red; the three opt-in specs armed on Chrome; update-in-place from v1.2.0 armed on both (2/2 each).
- 2026-11-12: round a1b (page 137 on a1): the check line's words, the warning's fix without the sponsor, the token row's band, the Fee sheet as radios; Codex conditional approve then approve, Opus conditional approve; gates green; #1795 rebased onto `dev` (it had stopped merging, so its CI never started) and green in CI after the payer radios' id moved off `Math.random()`.
- 2026-11-13: round a1b's a2 step (page 138): the review's "This send publishes" rows back in the strip's slot, the hero's dollar figure, "FPC" dotted with the glossary's entry (form 2, review 2). Gates green at retry 0 on `0b4170356`: static, smoke Chrome 1991 s and Firefox 3019 s, network Chrome 2353 s (one fixture timeout in `type-roles-windows`, rerun green) and Firefox 2665 s, the opt-in specs armed 3/3.
