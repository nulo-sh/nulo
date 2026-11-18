# call-lines-build-1: status

- 2026-11-18: plan written at `eb42af540`; no plan audit round (lane brief). D2 found before the build: as drawn, a capped chip runs 16.7 px past its row.
- 2026-11-18: lint, typecheck:all green; unit set 33 files, 688 passed, 1 skipped; check:plans green; smoke Chrome execute-steps + type-roles 26 passed, 3 skipped (163.5 s), at `448132c83`.
- 2026-11-18: smoke Firefox execute-steps + type-roles 27 passed, 2 skipped (250.4 s), at `448132c83`.
- 2026-11-18: network Chrome (prover-ON) type-roles-windows + tx-sendTx-default 8 passed (364.8 s), at `448132c83`.
- 2026-11-18: network Firefox (prover-ON) type-roles-windows + tx-sendTx-default 8 passed (613.6 s), at `448132c83`. Codex R1: approve with fixes (4 findings); fixes at `bd7e6cccf`.
- 2026-11-18: at `7e7e6ea4b` (code `bd7e6cccf`): lint, typecheck:all green; unit set 688 passed, 1 skipped; check:plans green; smoke type-roles Chrome 14 passed, 1 skipped (134.9 s), Firefox 15 passed (178.1 s). execute-steps and the network pair not rerun: the window is unchanged since `448132c83`. Codex R2: approve.
