# aztec-6-0-0 status

- 2026-10-23 03:3xZ: Phase 0 probe: Testnet rollup 3409706519 → 679261766 (Branch B); new chainId 685146337.
- 2026-10-23 04:0xZ: Phase 0 trial install of the 6.0.0 line: KAT and freeze tests green; the pxe patch misapplied and was re-created; 15 expected reds; oracle major 32 → 33 refuses the vendored account (OA-1). Trial reverted.
- 2026-10-23: plan drafted; OWNER-ASKS OA-1 (rotation) and OA-2 (token list) open.
- 2026-10-23: dual audit: Codex conditional approve (6 findings), Opus conditional approve (9 findings); all folded (D1-D11).
- 2026-10-23: final fresh Codex pass (01a166f5): approve after two resumed rounds. Plan committed; arc 1 waits on OA-1 (rotation) and OA-2 (token list).
- 2026-10-23 14:0xZ: P1 gate: lint, typecheck:all, lint:actions, test:ci-gating, residue check + 3 controls, the four builds pass; test:all 9 allowed reds (P3 pins, lessons/phase-1.md).
- 2026-10-23 14:3xZ: P2 gate (rotation core): oracle detector red 32/33 then green; aztec-runtime account+pxe 333 pass; extension slice 676 pass; vectors twice identical; reference diffs empty; lint, typecheck pass. M4.6-7 follow P3.
- 2026-10-23 15:0xZ: P3 gate: test:all reds only @nulo/token-list-host (tree.test.ts + one live-check case, both list.source.json; P0's #1103); lint, typecheck pass; preflight OK (lessons/phase-3.md).
- 2026-10-23 17:xxZ: M4.6-7 committed; Chrome replay and arrival green (the swap's interception release fixed a 5-in-25 egress flake). P0 merged (#1103, #1104); D3 done (frozen forced install, bun.lock unchanged); 18 stale acks out, 11 dev-wide advisories left to deps-audit-1 (#980, #1032).
- 2026-10-23 18:0xZ: audit:vue, test:all, test:ci-gating, test:release, check:plans green.
- 2026-10-23: review round 1: Codex reject (one major: a reset v0.31.0 paused across this update; reopens known limit #808; routed to the owner as a recovery-policy plan change), Opus conditional approve (fixed). Codex round 2: approve excluding the routed finding.
- 2026-10-23 22:0xZ: P4 e2e green at retry 0 on both browsers: smoke, the in-place pair, network proverless, both canaries prover-ON (lessons/phase-4.md). Open: the owner's call on the routed journal finding; then the PR and close-out.
