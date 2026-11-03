# quality-profile-1: status

- 2026-11-03 recon: two explorers (sonnet) returned; recon.md written; duplication baseline taken (production 183 clones / 8,841 lines).
- 2026-11-03 draft: plan A and outline B written; dual audit (Codex gpt-6.1-sol high, Opus Plan) started.
- 2026-11-03 Codex r1: conditional approve; six findings accepted (count, wipe order, D7 declined, armed smoke builds, frame pins, D9 to settle); D9 recommendation (b).
- 2026-11-03 Opus r1: conditional approve, all findings accepted; Codex r2 (resumed): conditional approve, two gate fixes accepted; D9 settled (b).
- 2026-11-03 Codex final: conditional approve (two delivery fixes accepted), resumed: approve. Plan approved under auto-continue; arc 1 next.
- 2026-11-03 arc 1 phase 1 green: lint, typecheck:all, profile tests (622 pass, 1 skip pre-existing); pin red under a dropped-wipe mutation.
- 2026-11-03 arc 1 phase 2 green: lint, typecheck:all, profile tests (622 pass, 1 pre-existing skip); four moved blocks byte-identical.
- 2026-11-03 arc 1 phase 3 green: lint, typecheck:all, profile tests, test:all (after re-citing the chaos model), audit:vue; Codex r1 and Opus: no material findings. Smoke set running.
- 2026-11-03 arc 1 gate green on the merged head (origin/dev 6c7ba2867): audit:vue, test:all, smoke Chrome 22/22 (159 s) and Firefox 22/22 (227 s); audit:dup production unchanged (arc 2 removes the clones). PR next.
- 2026-11-03 arc 2 phase 4 green: lint, typecheck:all, profile tests (623 pass, 1 pre-existing skip); every existing pin unedited; the codec test red under an un-awaited body.
- 2026-11-03 arc 2 phase 5 green: lint, typecheck:all, profile tests (623 pass, 1 pre-existing skip, client.test.ts included); the literal search prints one line, the constant in spec.ts.
- 2026-11-03 arc 2 phase 6 green: lint, typecheck:all, aztec-runtime tests (442 pass, 2 env-gated skips).
- 2026-11-03 arc 2 reviews converged: Codex r1 approve, Opus no drift, Codex r2 approve, Codex net pass approve.
- 2026-11-03 arc 2 gate green on the final head (origin/dev 78815e9bb merged): lint, typecheck:all, test:all, audit:vue, smoke Chrome 22/22 (160 s) and Firefox 22/22 (239 s), incoming-public-transfers 2/2; audit:dup production 175/8,751 → 173/8,725, service.ts internal 4/46 → 2/20.
