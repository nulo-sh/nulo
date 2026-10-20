# restart-notify-1: status

- 2026-10-20 recon: three Sonnet explorers (reuse, window lifecycle, wallet-sdk wire); recon.md written.
- 2026-10-20 spike: Chrome 14/14 + 3 (rerun with URLs and listing; 2 rows timed out after their data was recorded), Firefox 11/11; retry 0, proverless, agent.sh.
- 2026-10-20 #907 merged into dev (a51ebd220): the plan is one arc on top of it.
- 2026-10-20 plan drafted; OA-1 written; audits next.
- 2026-10-20 audit round 1: Codex reject (2 blocking), Opus conditional approve; spike 2 (same-tick removal) 6/6 on Chrome; plan revised (tracker, nothing awaited, tabs at boot).
- 2026-10-20 audit round 2 (Codex resumed): conditional approve, applied. Final fresh Codex pass: conditional approve, applied; verification: approve. Plan committed; arc 1 next (OA-1 does not gate it).
- 2026-10-20 arc 1 branch `restart-notify-1-a1` off origin/dev 973778cc3 (the plan commit rebased onto it; #909 and #915 landed meanwhile). Phase 1 gate: lint, typecheck:all, test (879 files) pass.
- 2026-10-20 Phase 2 gate: lint, typecheck:all, test (880 files), test:all pass. Deviation: the "no DappSession row deleted" row is by construction (the preparation receives only `endSession`, no dApp-session service); the e2e covers the real wiring. Six SDK test stubs gained `setRestartPreparation`.
- 2026-10-20 Phase 3 network e2e, Chrome, retry 0: restart-closes-check-window (15.7 s), lock-restart-reconnect (27.0 s), inflight-call-background-death, connect-verify-mismatch pass.
- 2026-10-20 Phase 3 network e2e, Firefox, retry 0: lock-restart-reconnect (33.1 s), inflight-call-background-death, connect-verify-mismatch pass; restart-closes-check-window skips by `CHROME_ONLY.backgroundKillUnderPage`.
- 2026-10-20 Phase 3 smoke, retry 0, armed builds: extension-restart + sw-resilience pass on Chrome (11/11) and Firefox (6 pass, 5 Chrome-only skips).
