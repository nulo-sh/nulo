# popup-fixes-1, phase 0: recon and consults

## Recon

- Three Explore agents (Sonnet): scroll restoration, toasts, Home and the other surfaces. The first two found #582 and #584 shipped in #642 (`f695dea4`); the third found #586 shipped in #642 and #678 (`e6a3b098`). #642's body ended with one line, `Closes #580 #581 #582 #584 #586`, and GitHub linked only #580: a closing keyword takes one issue, so the others stayed open (#581 too; it is onboarding-3's).
- #743 (onboarding-3, draft) rewrites `seed.vue` lines 12-167, `seed.test.ts` and `keyboard-guards.test.ts`, and keeps the "Retrieve Recovery Phrase" label: #770's label line merges cleanly in either order; the test titles stay.
- No smoke build state holds Home's ghost rows: both reads they wait on answer once the worker is up (recon § #786).

## Consults

- Round 1, Codex (gpt-6.1-sol, high, read-only; session `01a15059-f76c-7360-90c7-1f059d2ea9fa`): conditional approve. (1) A1 and A2 lack a recorded owner approval; (2) D2's "a push opens the page at its top" overstates `scroll-memory`: a fresh page keeps its own initial offset, only a reused page resets; (3) the Firefox e2e simulates the panel's death (`armPanelDeath`), so it proves the window path, not the browser cause; (4) I2 claims a check Phase 3 never runs. Fine: D4, D5 (scratch spec workable on Chrome if installed before navigation; the armed smoke build supplies no defaults), D6 (`Flex`'s single root takes `type`, listeners and testids; the ring is needed; no `refuseRepeatEnter` required), D3, D7, gates, security.
- Round 1, Opus 5.5 (Plan agent): conditional approve. Same two asks as Codex (A1, A2), plus: the Clear check needs a success control; pictures of the actions unfocused before and after (a `<button>` resets `font`, so the label may move); `type-roles` and `send-fee-privacy` belong in #626's gate and the three network runs do not (traced: `home-cap:55-60` walks inside the token header, the other two inside popups); `audit:vue`'s unarmed build breaks a smoke run after it (`global-setup-smoke.ts:31-38`); a replace does overwrite the kept entry's offset; small cites. Rejected: owner records for #773 and Home's #626 (the lane brief is the orchestrator's record for both).
- Decision after round 1: A1 and A2 become OA-1 and OA-2, and the plan splits into two unstacked arcs, so arc 1 (no surface the asks concern) ships now and arc 2 (#626, #786) waits on the answers.
- Final pass, Codex (fresh session `01a15070-2242-7090-9bbb-e6792738a6dd`): approve; arc 1 may proceed, arc 2 stays gated. One fix: OA-1's option B gives 45 or 47 px rows, not 41 (corrected). It also recalled the standard's cross-arc fresh pass, now in Post-implementation.
