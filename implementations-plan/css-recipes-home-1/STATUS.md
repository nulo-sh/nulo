# css-recipes-home-1: status

- 2026-11-24: recon done at e4f9011f8; plan drafted (two arcs, one PR each); dual audit next.
- 2026-11-24: Codex and Opus plan audits both conditional approve; findings applied (plan Audit verdicts); fresh final Codex pass next.
- 2026-11-24: final fresh Codex pass approve (after three conditions applied); plan committed; arc 1 next.
- 2026-11-24: arc 1 Phase 1 gate green at 8c12c4e02 (lint, typecheck:all, test:all, audit:vue, test:ci-gating, check:plans, build-storybook; scan mutations red); built CSS differs as planned in 13 of 128 chunk files (121 names, every file paired once), same in both browsers.
- 2026-11-24: arc 1 review converged: Codex round 1 one finding, fixed; round 2 clean; the Opus diff review's four findings fixed (plan, Arc 1 review).
- 2026-11-24: arc 1 Phase 2 proof: base 4d18591bd against head, both browsers, 18 smoke and 12 network states (376 captures). Computed styles, hover and focus identical in every capture; pixels identical but for 22 Chrome edge pixels, each matched by a same-build rerun. Affected e2e at retry 0: smoke green on both browsers, network green on Chrome; on Firefox `fee-methods`' "public gas only" times out waiting for "Transaction submitted", the same way at base on this host. lint, typecheck:all, test:all and check:plans green; PR next.
