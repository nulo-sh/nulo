# aztec-6-0-0 status

- 2026-10-23 03:3xZ: Phase 0 probe: Testnet rollup 3409706519 → 679261766 (Branch B); new chainId 685146337.
- 2026-10-23 04:0xZ: Phase 0 trial install of the 6.0.0 line: KAT and freeze tests green; the pxe patch misapplied and was re-created; 15 expected reds; oracle major 32 → 33 refuses the vendored account (OA-1). Trial reverted.
- 2026-10-23: plan drafted; OWNER-ASKS OA-1 (rotation) and OA-2 (token list) open.
- 2026-10-23: dual audit: Codex conditional approve (6 findings), Opus conditional approve (9 findings); all folded (D1-D11).
- 2026-10-23: final fresh Codex pass (01a166f5): approve after two resumed rounds. Plan committed; arc 1 waits on OA-1 (rotation) and OA-2 (token list).
- 2026-10-23 14:0xZ: P1 gate: lint, typecheck:all, lint:actions, test:ci-gating, residue check + 3 controls, the four builds pass; test:all 9 allowed reds (P3 pins, lessons/phase-1.md).
