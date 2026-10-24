# Arc 1: implementation log

- Phase 1 missed the generated auto-import types: a build adds every new `src/utils` export to `src/types/auto-imports.d.ts` and `.eslintrc-auto-import.json`. Caught when `build-update-candidate.sh` refused a dirty checkout; committed with Phase 3.
- `build-update-candidate.sh` builds into `dist/<browser>` before copying, so the smoke runner then refuses `dist` as unarmed: run the update scenarios with `NULO_E2E_ARTIFACT_RUN=1` (the README's arrival command now says so).
- Base timings came from a scratch worktree at `dda72e321` under the lane's cache dir, removed after. The base candidate script also leaves no `dist`, so its arrival run needs the armed rebuild its README names.
- D6 measured: the refused Mainnet status read costs 4 to 8 s per full backup export per browser; nothing else moved beyond noise.
- Fix loop: Codex round 1 conditional (2 P2), Opus (4 P3), Codex round 2 approve. Known limits filed: #1115 (D9), #1116 (seeded chain id collision). #808 reopened for the owner (OA-6).
