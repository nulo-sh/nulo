# Phase 0: planning consults

## Recon

- One Sonnet Explore agent mapped the tests, helpers and guards each change touches (summarised in `recon.md`). Its key finds: the password-change toast already exists; every network export goes through `tests/e2e/helpers/backup-export.ts`; `downloadFile` uniquifies a repeated name and needs no user activation; `SettingItem` descriptions ellipsize at 359 px and wider.

## Panel, plan round 1

- **Codex, gpt-6.1-sol, high, read-only** (session `01a19d43-404b-78b3-a004-32a6b0000386`): conditional approve. Seven conditions: fence D2's continuation with the existing run fence; remove the empty section (rejected: the signed render shows its divider); correct Fact 3 (a passkey profile has no session re-check, the page's reset protects it) and Fact 4 (the e2e stubs `chrome.downloads.download`); keep and retarget the pins test and the lock-screen e2e; complete the browser gates; make the capture reproducible; add OA-4 (the link hidden while the profile is unknown).
- **Opus 5.5, Plan agent**: conditional approve. Found the await-count guard (`useFullBackupExport.test.ts:628-631`), the 13 references in `full-passkey.pins.test.ts`, the missing `audit:vue`, T4's case count, and asked for D3, the FAQ line and D9's trigger as owner asks. D9 became OA-5; D3 and the FAQ line stay readings (the lane's closest-reading rule), shown in the PR's pictures.
- Probe: Bun honours `process.env.TZ` set at run time (a UTC+14 zone moved `getDate()` while `toISOString()` kept the UTC day), so T3 can set its zone inside the test.
- **Final fresh Codex pass** (session `01a19d50-2f3d-71e2-956b-9b424e398a79`): conditional approve. `profile-chaos.test.ts` skips every seed unless `NULO_E2E_CHAOS=1` arms it, so the gate as first written ran nothing; and CLAUDE.md § Quality gates asks the full smoke suite locally before a user-visible PR, on Firefox too for focus and WebAuthn work. Both folded; round 1's rejection of the full local suites reversed. Resumed: **approve**.

## Arc 2 plan round (2026-11-03)

- **Codex, gpt-6.1-sol, high, read-only** (session `01a1a20a-d680-7f03-8d03-148e535e3242`): conditional approve. Settled D15 at 500 ms, citing GitLab's design system (Saving and feedback § Delayed feedback: a 500 ms debounce, form validation named as a use; checked against the page); a shown line stays until corrected; no blur rule. Argued `isReconnect` out end to end. Found `network/session-reconnect.test.ts:46` asserting the parameter.
- **Opus 5.5, Plan**: conditional approve. Found `backup-restore-sw-restart` as the one network spec that drives the unfinished-import link; `waitForToast`'s case-insensitive substring match ("Password changed" would match the info toast); T6's pill stub cannot take focus; discover's strip loses the account label. Argued `isReconnect` stays in the worker; overruled on Codex's argument (no reader left; the per-connection proofs are kept).
