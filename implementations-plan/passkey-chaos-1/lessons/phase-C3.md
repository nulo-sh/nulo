# Phase C3: A2's flows, absorbed into C1's PR

Every consult, gate and meaningful attempt of phase C3.1. Paths repo-relative.

## The orchestrator's calls (2026-10-26)

- **D-orch-3, C1 absorbs C3.1.** A2 merged on `dev` as `74cf8995b` (#1139) while C1's PR #1140 was open. The orchestrator's merge of `origin/dev` into this branch (`9772b74e9`; the only textual conflict was `implementations-plan/index.md`) left the harness red and the product green, with the four e2e lanes green on that head: `helpers/profile-chaos/backups.ts` imported `downloadPlainPasskeyBackup`, which A2 removed (a passkey profile's full backup always takes a file password now), and three model tests failed (a cited line in `profile/service.ts` and one in `full-backup-restore.ts` moved; `ProfileRowSchema` changed). The plan's own rule, "If A2 merges before C1's PR, C1 absorbs C3.1", applies: same branch, same PR, new signed commits only, the harness fitted to A2 first.
- **D-orch-2, C3 beside C2.** C2 (the agent session launcher) runs in its own worktree on a branch off this one and opens its PR after #1140 merges. The two share only `apps/extension/tests/e2e/README.md` § Chaos runs, so this arc's text there goes under its own sub-heading, never inside the session contract C2 writes, and this branch merges `origin/dev` before each gate and right before its final push.
- **Page 87** is answered (P87-01 to P87-08 on #1127), recorded per ask in OWNER-ASKS.md.

## Fitting the harness to A2

- **The citations were checked for a non-empty line only.** After the merge 22 of the 31 cited lines in `profile/service.ts` and the restore file had moved, and the old test still passed on most of them. Every citation now goes through `cite(path, line, fragment)` (`helpers/profile-chaos/citations.ts`) and the model test reads each cited line for its fragment, and fails any `code:` source a plan or an allowlist names that is not a citation.
- **The O2 field-set test passed by coincidence.** The retired row's keys (optional ones included) equal a passkey row's, so comparing every key of `ProfileRowSchema`'s options matched whichever was asked. The test now maps each option to its kind by its required keys alone.

## Drivers (2026-10-26)

- **A fresh popup document boots through the lock screen.** The onboarding driver navigated the anchor back to `#/popup/general` and settled on the hash, which shows before the router's redirect to `/popup/auth` and its advance back; O1 then read the anchor on the lock screen. It settles on Home's account selector now (e2e-testing skill).
- **Hand list, every new action once** (`onboardingCreate` passkey, reveal, both exports, the reveal race, the row edit, the slot flip, both earlier-backup refusals, a restore, `verifyAll`): green on Chrome in 22 s; on Firefox every step ran, the seed met only the filed #1132 at the two lock-screen imports.

## First Chrome smoke pass, seeds 2001 to 2020 (shakeout, before the final head)

- Seed 2008 stopped at step 20 `deleteProfile` via Forgot, after a passkey profile was open across a restart: `locked, but a session row for <id> remains`. The reduced shape of the filed #1134; recorded red-filed, as C1's 1006 was.
- Seed 2011: `backgroundRestart` did not settle in 90 s with a password profile open under a bearer, the anchor still on the reveal page. Harness: the restart settle accepted Home or the account selector only; it accepts any Settings page now (D52), and O1 still judges the session.
- Seed 2012 stopped at step 11 `revealPhrase`: the agree press never advanced. Bisected to a full backup export, then a password change, then a reveal (1 of 1 at each cut, green without the export or the change). The page under `#/popup/settings/security/export/seed` was the full backup page's agreement: Change password calls `router.back()` after its toast, and the driver wrote the next hash on the toast, so the back navigation landed after it. Harness: the driver waits for the route to leave Change password (skill, § Harness behaviours). Replayed green but for its planned restart.

## Review round 1 (Codex and Opus, on 3c4149706)

Both changes-needed; verdicts and what was declined in plan.md § Review verdicts. Verified before fixing: `openBackupTransfer` and `exportImportedKeysDek` are not in `ProfileService.rpcMethods`, and the base service drops such a call unanswered; `PasskeyCeremonyDialog` cancels its ceremony on unmount, so the reveal race's word check could never fail; 0.31.0 stores `nulo:core:networks@…` plain, and the sealed store keeps such a row plain until its profile unlocks. The citation test caught a wrong line in the fix itself (85, not 84).

## Review round 2

- The wallet seals a release's plaintext rows asynchronously (`onRowKeysReady` → `sealLegacy`), and a keyed root moves the row to a new key and drops the legacy one; so the exemption expires after a step that ends with the owner open, polled for 15 s, never on the unlock step's own census alone.
- Account, flag and incoming roots name their owner in the row's key (`["account", profileId, chainId, address]`), not in its body; an owner read from `profileId` alone missed them.
- `callService` loses the typed error (`errorPayload.code`); `serviceAnswer` keeps it, and `callService` is now a wrapper over it with the same rejection text.
