# w3-ci-1 status

- 2026-11-02: recon done (1 Sonnet explorer, 3 Docker reproductions); base `b24357921`. #1419 reproduced with both causes demonstrated (no browser on a linked tree; Vite on `::1` against a probe that drops `::1`). #1493 confirmed, plus `live-labels.sh` and `assert-canary-results.ts` gaps.
- 2026-11-02: plan drafted (tier light, one arc); OA-1 ships now (smoke filters drop `_build-extension.yml`); panel next.
- 2026-11-02: panel round 1: Codex conditional approve, Opus conditional approve; folded (browser volume dropped, KL-1, D4 narrowed, Docker proof reaches D1, host base run first). Final Codex pass next.
- 2026-11-02: final Codex pass (resumed session): approve. Plan committed; arc 1 next (auto-continue).
- 2026-11-02: Phase 1 gate green (red at 278d8c981 with the eight expected lines, green at a2b790694); test:release reds are environmental only (no zip on the host; green in a container with zip).
- 2026-11-02: Phase 2 gate green: red at 2d11315b6, green at 3d435fbcd; host proof Chrome + Firefox pass; Docker runs 1 and 2 pass with no NODE_OPTIONS (run 2: no changes, D1 downloaded). Inference 2 did not hold (host passes on base: link-local IPv6 on docker0); D7 revised, README unchanged.
- 2026-11-03: Codex loop converged: round 1 findings (regex gap, comments) fixed in 2a779dd77; round 2 clean. Opus diff review folded.
