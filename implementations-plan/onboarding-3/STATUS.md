# STATUS: onboarding-3

- 2026-10-17 14:0xZ: worktree adopted at 1b93cbfa; briefs and issues #588 #585 #581 #636 read.
- 2026-10-17 14:1xZ: recon (3 Sonnet explorers) persisted to recon.md.
- 2026-10-17 14:18Z: plan.md and OWNER-ASKS.md drafted; dual audit started.
- 2026-10-17 14:3xZ: round 1: Codex reject, Opus conditional approve; 23 findings verified and folded; OA-11, OA-12 added; final fresh Codex pass next.
- 2026-10-17 14:39Z: final fresh Codex pass: conditional approve (3 conditions, all taken); confirmation round running.
- 2026-10-17 14:40Z: confirmation rounds: conditional approve (no bootstrap after unmount, taken), then **approve**. Plan at the approval gate.
- 2026-10-17 14:52Z: arc 1 started; merged origin/dev 623fc97f.
- 2026-10-17 15:22Z: phase 1 gate green: `F` (lint, typecheck:all, test), `test:all`; smoke at retry 0 on Chrome (8 passed, 2 skipped: shipped-token-list artifact-only, presto-host-permission Firefox-only) and Firefox (9 passed, 1 skipped) over onboarding-tab, keyboard-guards, passkey-retry, legal-acceptance, import-paths, onboarding-import, token-list, shipped-token-list, settings-proving, presto-host-permission.
- 2026-10-17 15:40Z: phase 2 gate green: `F`; smoke `onboarding-tab` at retry 0 on Chrome (6/6, 54 s) and Firefox (6/6, 84 s).
- 2026-10-17 16:02Z: phase 3: `F` green; smoke at retry 0 on Chrome (7 passed, 1 skipped, 332 s) and Firefox (7 passed, 1 skipped) over onboarding-tab, keyboard-guards, security-backup, duplicate-phrase-import, legal-acceptance, import-paths, token-list, shipped-token-list. Network `frozen-account-canary` next.
- 2026-10-17 16:38Z: phase 3 gate green: network `frozen-account-canary` prover-ON at retry 0 on Chrome (2/2, 366 s) and Firefox (2/2, 518 s). Phase 4 next.
- 2026-10-17 17:27Z: phase 4, first whole smoke on Chrome: 1 failure, `rows.test.ts` hero scroll (the card mounted while the spec held the middle scrolled). Fixed with `data-reminders-settled` + `waitForHomeReminders`; Firefox half stopped unstarted.
- 2026-10-17 19:05Z: second whole smoke: Chrome green; Firefox 1 failure, `security-backup` How Aztec works step (a read from the onChanged listener answered the old flag). Fixed: the listener applies the event's values.
- 2026-10-17 21:57Z: phase 4 gate green on `a85c9c3e`: `F` (830 files), `test:all` (15 workspaces); whole smoke at retry 0, Firefox 60 passed, Chrome 56 passed + `security-reset` (#630, known flake) green on its one named rerun; network at retry 0 on both browsers, prover-ON canary, home-cap, hero-prices-unavailable, fiat-send, send-amount-exact, and proverless incoming-arrival.
- 2026-10-17 22:25Z: phase 5 gate green: `STORE_CAPTURES=1` store-captures on Chrome at retry 0 ran and passed (no card, no banner in the Home frame); `audit:vue`; `test:ci-gating` (576). Review loop round 1 (Codex) and the Opus review running.
- 2026-10-17 22:27Z review round 1 (Codex gpt-6.1-sol high + Opus): 14 findings verified; fixes committed with control tests; known limits drafted (bootstrap after Back, backupSaved on popup close); OA-13 added. lint, typecheck:all, extension unit suite (830 files) green.
