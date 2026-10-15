# aztec-rc3 status

- 2026-10-14: recon done (3 explorers + live probes); Phase 0: network reset, Branch B, regime re-pin.
- 2026-10-14: owner answers taken (no nulo-v7, re-pin in place under stale-network-reset's A1; externals as released; token list empty); plan drafted.
- 2026-10-14: dual audit round 1: Codex conditional approve (12 accepted), Opus conditional approve (13 accepted); plan revised; OA-1 (PrivateFPC sequencing) withdrawn, OA-3 (nightly live-list red) added.
- 2026-10-14: final fresh Codex pass: conditional approve, 3 findings verified and applied; plan committed for the orchestrator's approval.
- 2026-10-14: arc 1 started; merged origin/dev (a4e148b2); P1 pre-install edits, P3 step 1, F18 text drafted, reference/nulo-v6.1 scaffold. Waiting on the age gate (2026-10-15 12:21Z).
- 2026-10-14: AGE-GATE bypass-all; installed rc.3 (43 excludes). P1 gate: lint, typecheck, lint:actions, ci-gating, builds 0; residue red only by the fee-juice rc.1 nest (clears at P5); test:all reds all allowed causes or the nest.
- 2026-10-14: P2 gate green (KAT, freeze, export, integrity); nulo-v6.1 appended and bound; F18 text in.
- 2026-10-14: P3 gate green (SponsoredFPC live at the derived address; AuthRegistry from upstream's constant); reds left: PrivateFPC + crs-cache (P5), Token class (P4).
- 2026-10-14: P5: fee-juice rc.3 and the PrivateFPC pinned from its package (three-way address agreement); draft PR #431.
- 2026-10-14: P4: the empty list shipped first (#429, publish #434), then the rc.3 Token class; tree check green.
- 2026-10-14: P6: rc.3 proves through presto-server 1.1.3 on both browsers (bb 6.0.0-rc.6 downloaded and verified); no server release needed.
- 2026-10-15: P7: excludes out (`bunfig.toml` equals `dev`), audit acks re-judged; final review fixed Presto's status check to the bb release (OA-6). `dev` merged at 9e905c9b; smoke, network proverless and prover-ON canaries green at retry 0 on both browsers; `reference/nulo-v6.1` re-resolved under its gate with identical vectors; Codex converged; PR #431 ready. The merge is the owner's call.
- 2026-10-15: arc 3 on `aztec-rc3-sdk` off `dev` 479ba56d: P8 READMEs; 0.2.0 digests recorded and reproduced from a clean tree; test:release 0, check-digests 0, lint 0, every staged Aztec peer 6.0.0-rc.3.
