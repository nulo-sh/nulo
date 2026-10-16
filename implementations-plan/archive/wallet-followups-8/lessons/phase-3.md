# Phase 3: delete the dead RPC (#464), then the arc gate

- 2026-10-16: deleted `confirmProfileOperation` (service, `rpcMethods`, spec, client passthrough), `PasskeyRecoveryCoordinator.confirm` and their tests; fixed the `exportPlain` comment and the `password-secret-box.ts` header, whose "31-method" count was stale before this change (23 methods remain). `rg confirmProfileOperation apps packages` finds nothing. The first commit attempt failed commitlint's `subject-case` on the bare identifier; backticks pass.
- 2026-10-16: gate: profile tests 392 pass; lint, `typecheck:all`, `bun run test`, `bun run test:all` (extension 12 890 tests), `test:ci-gating` (571) pass.
- 2026-10-16: merged `origin/dev` (#530, `index.md` conflict: both active lines kept); Phase 2's unit lines rerun green (aztec-runtime 415; extension incoming, profile-deletion, network-reset, network, profile 1 062).
- 2026-10-16: close-out: #551 (KL-3), #552 (KL-4), #553 (KL-5) filed and closed as `known-limit`; #338 and #432 labelled and closed as not planned with their records; #112 and #498 commented, both stay open. #498's owner answer (page 20 B) arrived after approval; the plan carried no arc for it.
