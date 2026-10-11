# e2e-followups status

- 2026-10-10: planner homed in the lane worktree (from origin/dev af4afcc); five issues read.
- 2026-10-10: #249 reproduced: GNU grep 3.11 reads `--retry=0` and `--exclude` as its own options, and a vitest name filter is no path; the guard passes in all three cases.
- 2026-10-10: #269 root-caused: the hero observer reads the first of several queued entries; 4 of 12 diagnostic iterations stuck the bar hidden with the hero off screen.
- 2026-10-10: #272 proven on Firefox (skip removed locally, retry 0, 2 of 2); recon.md written.
- 2026-10-10: plan v1 drafted with Outline B; OA-1 (#269 page fix) written; dual audit starting.
- 2026-10-11: round 1: Codex reject (9 findings), Opus conditional approve (9 findings); plan v2 written; #274 delayed-mount no-op reproduced 6 of 6.
- 2026-10-11: round 2 (final fresh Codex pass): reject, 6 findings accepted; plan v3 written; resuming the same session for the verdict.
- 2026-10-11: round 3 (resumed Codex): reject, 3 findings accepted (the `-w` bypass reproduced); plan v4: `parseCLI` watch check, observed #274 barrier, D3 aligned; resuming for round 4.
- 2026-10-11: round 4 (resumed Codex): reject, 1 finding accepted (dotted `--watch.enabled` object reproduced); plan v5 checks watch by truthiness; resuming for round 5.
- 2026-10-11: round 5 (resumed Codex): approve; plan v5 final, committed on the worktree branch, awaiting orchestrator approval.
- 2026-10-11: implementer started arc 1 at 8d963db (orchestrator: OA-1 = A, Phase 1.5 joins arc 1; D-orch-2, D-orch-3 recorded).
- 2026-10-11: Phase 1.1 gate pass: lint, typecheck:all, guard test 13/13 (red on base 9/13), test 11125, ci-gating 480, shellcheck, runner refuses before ports. Deviation D14 (watch read as a file: Bun's node shim drops `-w`).
- 2026-10-11: Phase 1.2 gate: lint, typecheck, unit 7/7, test 11132, probe Chrome pass (red on base); probe Firefox red at base and head (Firefox BiDi skips extension contexts, Bug 1755014): D15, issue #281, panel agreed.
- 2026-10-11: Phase 1.3 gate pass: smoke navigation + appearance Chrome 8/8 and Firefox 8/8 at retry 0 (new test red on base); network tokens, handshake matrix, in-flight guard Chrome 4/4 and Firefox 4/4 at retry 0.
- 2026-10-11: Phase 1.4 gate pass: lint, typecheck, ci-gating, check:plans; stalled-network spec Chrome 2/2, Firefox 3 runs of 2/2 at retry 0; no `hangingRequest` left.
