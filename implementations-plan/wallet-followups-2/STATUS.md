# wallet-followups-2: status

- 2026-10-11: adopted the worktree (base `origin/dev` 29d9e49) and registered it.
- 2026-10-11: recon done (two Explore agents on sonnet plus the driver's reads); `recon.md` written. #288's `imported-account-keys` claim did not hold; #288 is wider than filed (coordinators, the price service's own helper, ~18 non-service sources).
- 2026-10-11: plan draft v1 and the competing outline written; OA-1 filed in `OWNER-ASKS.md`; lessons curation measured at 7,647 B with no retirement.
- 2026-10-11: dual audit round 1 started (Codex gpt-6.1-sol high, Opus Plan).
- 2026-10-11: Codex round 1: reject; 7 findings accepted (in whole or part), D4 rebutted; plan revised (fail-closed drift pin, price helper to OA-1, lessons 7,870 B lossless, fuzz owe rule D9).
- 2026-10-11: Opus round 1: conditional approve; 13 accepted, retirement of the never-skip lesson rejected; plan v2 (literal log rows, #291 as store invariant, OA-2 filed).
- 2026-10-11: final fresh Codex pass: reject, then reject on resume, then approve after D9 moved to the tx-settle observer set; lessons 7,926 B; panel approved.
- 2026-10-11: arc-1 started; orchestrator decisions D-orch-2 to D-orch-4 recorded. Phase 0 gate: pass (7,926 B, link diff empty, 10 lines changed, check:plans exit 0).
- 2026-10-11: Phase 1 gate: pass (send.test.ts 71/71, lint 0, typecheck:all 0; both selected-token cases red on the base send.vue, the control green on it).
- 2026-10-11: Phase 2 gate: pass (JsonViewer 53/53, lint 0, typecheck:all 0; on the base list the pin failed naming exactly the ten rows).
- 2026-10-11: Phase 3 gate: pass (JsonViewer 55/55, lint 0, typecheck:all 0; failed-clear case red on the base LogsViewer.vue, success control red under a whole-handler finally and green on base). Built before Phase 2b while 2b's source inventory ran; the phases are independent.
