# networks-ux-1 status

- 2026-10-28: adopted the lane worktree at `843d27f75`; one Sonnet explorer's reuse sweep verified and persisted (recon.md).
- 2026-10-28: plan drafted (light tier, one arc); audits next.
- 2026-10-28: base measurements at `843d27f75`, armed builds: `settings-crud.test.ts` 9/9 at retry 0, 19.2 s on Chrome, 33.5 s on Firefox. CI smoke suite wall-clock before: Chrome 10 min (runs 40736868235, 40729665109), Firefox 13 and 17 min (runs 40736868164, 40729665183).
- 2026-10-28: Codex round 1 reject (5 findings; 4 accepted, D1's scope finding argued in plan.md).
- 2026-10-28: Opus round 1 conditional approve (9 findings; 8 accepted, 1 rejected); plan revised; Codex round 2 next.
- 2026-10-28: Codex round 2 conditional approve (focus timing, scope amendment; both accepted); round 3 conditional approve on the scope call alone. Plan committed; arc 1 waits on the orchestrator's acceptance of `SettingItem.vue` and `Settings.test.ts`.
- 2026-10-28: the orchestrator accepted Option A (D1's two files) on two conditions; merged `origin/dev` (#1326); arc 1 started.
- 2026-10-28: 1.1 green: Settings.test.ts red at base (1 failed, 39 passed: the controls case), green after (40 passed); lint and typecheck:all exit 0.
- 2026-10-28: 1.2 green: index.test.ts red at base (5 failed, 6 passed), green after (11 passed); the focus case fails without the handoff; lint, typecheck:all and the UI bans pass.
- 2026-10-28: 1.3 green: settings-crud red on the base builds (both browsers, 1 failed | 8 passed), green on the head builds (9/9, four runs each); the probe fails without the pointer-through rule; Firefox first test median +2.6 s, Chrome within noise; light and dark captures.
- 2026-10-28: arc review round 1: Codex conditional approve (3 findings: 2 accepted, 1 argued with a different fix), Opus conditional approve (4 findings, all accepted); fixes in, red first; settings-crud 9/9 on both armed builds at retry 0. Codex round 2 next.
