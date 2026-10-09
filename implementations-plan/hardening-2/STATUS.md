# STATUS: hardening-2

- 2026-10-08: recon done (3 sonnet explorers); claims checked by hand; plan drafted with competing outline B.
- 2026-10-08: round 1 done (Codex and Opus: both conditional approve); plan, OWNER-ASKS (OA-3 to OA-5 added) and lessons revised.
- 2026-10-08: final fresh Codex pass converged (round 3: approve); D-26 switched to the object-keyed cache; OA-3 now gates arc 1's merge.
- 2026-10-08: orchestrator approved the plan; CSP floor reordered first (Arc 3 is layer 1 on worktree-hardening-2; Arc 1 layer 2 after PR #48; Arc 2 layer 3).
- 2026-10-08: Phase 6 gate pass. lint, typecheck:all, test, test:ci-gating, lint:actions green; test:release 3 fails, host lacks `zip` (unrelated). Smoke at retry 0 with the recorder armed: Chrome 46/47 (passkey-retry toast-window flake, green alone), Firefox 46/47 (migration 60 s timeout under 4-shard load, 38 s alone); zero violations; probes recorded for all six contexts on both browsers.
- 2026-10-08: Phase 7 `connect-src 'self' blob: https: http:` gated (Firefox needed `blob:` for `downloads.download`). Corrections to phase 6: the Firefox migration failure was the close check racing the in-place reload (fixed with an early check), and `typecheck:all` was not green (`zod-jitless.ts` was a script; fixed).
- 2026-10-08: Phase 7 `font-src 'self'` gated; `style-src 'self' 'unsafe-inline'` gated after CodeMirror's generated `<style>` ruled out a hash (D-23h).
- 2026-10-09: Phase 7 `frame-src 'self'` gated (Firefox smoke's one red was the passkey-retry timing fingerprint, green alone; ledgered as row 46).
- 2026-10-09: Phase 7 `media-src 'self'` and `object-src 'self'` gated, each green on both browsers.
- 2026-10-09: Arc 3 gate pass on d43a198 (static green but test:release's zip; smoke Chrome 44/Firefox 46 files; network proverless Chrome 106/Firefox 105, canaries 5/5 on both; zero violations). Codex loop clean at round 3; Opus approve.
- 2026-10-09: rebased onto dev 833170d (10 commits; only implementations-plan/index.md conflicted, resolved by keeping dev's lines plus ours); re-gating the rebased head.
- 2026-10-09: final-head gate pass on c19f179 (rebased): lint, typecheck:all, test:all, test:ci-gating, lint:actions, check:plans green, test:release zip-only; smoke Chrome 44/Firefox 46 files; the eight network files 8/8 on both; zero violations.
- 2026-10-09: Arc 2 started on `hardening-2-storage-fences` (stacked on layer 1, D-ORD2); merged dev c42033e. Phase 3 gate pass on 03fa633: wallet-core 266, extension migration/backup 113, smoke migration + backup-migration 7/7 retry 0 on Chrome, lint, typecheck:all; five refusal rows red on base.
