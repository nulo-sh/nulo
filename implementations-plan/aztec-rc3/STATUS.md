# aztec-rc3 status

- 2026-10-14: recon done (3 explorers + live probes); Phase 0: network reset, Branch B, regime re-pin.
- 2026-10-14: owner answers taken (no nulo-v7, re-pin in place under stale-network-reset's A1; externals as released; token list empty); plan drafted.
- 2026-10-14: dual audit round 1: Codex conditional approve (12 accepted), Opus conditional approve (13 accepted); plan revised; OA-1 (PrivateFPC sequencing) withdrawn, OA-3 (nightly live-list red) added.
- 2026-10-14: final fresh Codex pass: conditional approve, 3 findings verified and applied; plan committed for the orchestrator's approval.
- 2026-10-14: arc 1 started; merged origin/dev (a4e148b2); P1 pre-install edits, P3 step 1, F18 text drafted, reference/nulo-v6.1 scaffold. Waiting on the age gate (2026-10-15 12:21Z).
- 2026-10-14: AGE-GATE bypass-all; installed rc.3 (43 excludes). P1 gate: lint, typecheck, lint:actions, ci-gating, builds 0; residue red only by the fee-juice rc.1 nest (clears at P5); test:all reds all allowed causes or the nest.
- 2026-10-14: P2 gate green (KAT, freeze, export, integrity); nulo-v6.1 appended and bound; F18 text in.
- 2026-10-14: P3 gate green (SponsoredFPC live at the derived address; AuthRegistry from upstream's constant); reds left: PrivateFPC + crs-cache (P5), Token class (P4).
