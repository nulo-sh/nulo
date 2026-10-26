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
- First browser pre-update run (Chrome seed 3001): the start ran without `NULO_E2E_ARTIFACT_RUN=1` and was refused by the armed-build guard, since the candidate build replaces `dist/<browser>`; the README command now sets it. With it, step 8 met the stale-network takeover over Home: v0.31.0's Testnet row names the pre-reset chain, so the first open of the release's profile offers the reset. The run now answers it between steps (D56); rerun: all 25 steps ran, red only on #1131 and #1132.
- Firefox seed 3001 from `pre-update`: `verifyAll` read "P7 and P1 share a secret but derive" different addresses. P7, a restore of P1's backup, reseeds the built-in networks with Mainnet active, while P1 stays on Testnet after the arrival's Stay; addresses now carry their chain (D57). Rerun: red only on #1131, #1132, #1133.
- A pre-update run refuses a checkout with any change outside `apps/extension/tests` and `implementations-plan`, and a candidate built from another commit: commit, rebuild the candidate, then run. Two "reruns" here silently read the previous record because setup refused; read the run's own log line first.
- Chrome seed 2012 (final shakeout) went red at `revealPhrase` three replays out of three. A MutationObserver on the seed page showed the Agree button removed and re-added 5 ms apart after navigation from `export/full`, where `change-password`'s `router.back()` had left the anchor; the DOM press hit the discarded copy. A first fix (press until it leaves) still went red in the final pass: an event trace showed navigation at 4 ms, the press at 20 ms, the seed page's unlock field added at 23 ms and the whole page replaced at 33 ms, so the press was taken and undone. Agree is now pressed only once it has been one node for 250 ms (D58); the replay ran green three times out of three with one press.

## A3 merged before the push

- `origin/dev` gained A3 (#1143) after the final pass. Merged; 36 citations moved, 9 of them placed by hand, and 4 named code A3 removed (the password-only bearer, the passkey skip at session restore, the password-only restore, the strict row hidden from passkey profiles). The recite script re-located the unique ones; the rest were placed by their enclosing function in the pre-merge file. The model now gives every non-strict session a bearer (D59); the drivers choose the Password tab at phrase import, which now opens on Passkey, and at restore, where a passkey backup opens on Passkey.
- Two more `dev` commits (#1153, #1155) landed before the push; merged, 5 citations in `session-manager.ts` and `lock.vue` moved by those fixes' own lines. The seed campaign stays on c84804924; the merged head reran the fast layers, the model test, the hand lists, one smoke batch and one `pre-update` seed per browser against candidates rebuilt from it, `update-replay`, and the passkey suites.
- `pre-update` Chrome seed 3005 met Aztec's `foundation:retry` logging `Failed to fetch` at error inside a planned restart, the line Chrome smoke 1018 met in C1. 0 of 3 replays met it: a second unreproduced sighting, recorded, not filed.
- On the merged head, Chrome smoke seed 2002 met the same retry line inside a planned restart; 0 of 3 replays met it. Third sighting (C1 1018, C3 3005, 2002), each during `backgroundRestart`, none replaying; CHARTERS § Triage files an unreproduced finding only if its evidence alone shows a broken property, and a retried fetch logged at error does not, so it stays recorded and goes to the owner as a question.
