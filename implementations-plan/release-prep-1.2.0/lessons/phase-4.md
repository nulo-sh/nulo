# Phase 4: the passkey trait, 2026-10-28

- The trait was decided from each tag's `apps/extension/src/wallet/services/profile/profile-row.ts` `newPasskeyRow`. At `v0.31.0` and `v1.0.0` (one blob, `8243671fa`) it writes `{ id, name, type, pxeGeneration, dekSealed, walletFingerprint, credentialId }`, which HEAD's `RetiredPasskeyRow` matches: `retired`. At `v1.1.0` (`:113-133`, the same blob as HEAD) it adds the sealed slots, `envelopeMac` and `prfSalt`, which HEAD's `PasskeyUnlock` matches: `unlocks`.
- Pitfall met on the way: in zsh, `$t:apps/...` reads `:a` as the absolute-path modifier. Write `${t}:path` when building a `<rev>:<path>` from a variable.
- The answer to A1 asks the `unlocks` branch to unlock the updated profile. On Chrome no credential survives the update: its virtual authenticator belongs to the page that made the credential, and the update closes every extension page (`fixtures/update/in-place.ts:148`). PRF state does not survive CDP `getCredentials`/`addCredential` (`tests/e2e/PRF-NON-PORTABLE.md`). The driver seam `credentialOutlivesPage` (Chrome false, Firefox true) already carries this fact, and the passkey canary reads it. So the press runs on Firefox, and Chrome checks the offer (D6).
- Red proof of the unit check: with `v1.1.0.storage.json` moved aside, the new `v1.1.0` case failed (`no recording of v1.1.0: expected undefined to be defined`); restored, `cmp` identical. The wrong-trait red is Phase 2's: `retired` expected from v1.1.0 failed at `update-replay.test.ts:689` on both browsers.
- Gate: lint, `typecheck:all`, `bun --bun vitest run scripts/e2e` (36 files, 719 passed, 1 expected fail), `check:plans` 0 findings.

## Runs at `ca1a8b24c`, retry 0, no rerun

Both candidates name `ca1a8b24c` (manifest `1.1.0.1`); `git status --porcelain -- apps/extension` was empty before each run; Chrome 155.0.8059.79, Firefox 153.0.4; the recording unchanged (SHA-256 `a5d96c04…80b8`).

| Run (UTC) | Outcome | Wall-clock |
|---|---|---|
| Replay, Chrome, 08:05:05-08:06:11 | 4 passed: 26.3 s, 13.4 s, case 3 9.3 s, 12.2 s | vitest 64.9 s (Phase 2: 88.2 s, case 3 red at 38.4 s) |
| Replay, Firefox, 08:06:17-08:07:46 | 4 passed: 35.6 s, 20.0 s, case 3 13.9 s (unlock pressed, Home reached), 15.0 s | vitest 88.9 s (Phase 2: 105.3 s, case 3 red at 40.2 s) |
| Live, Chrome, 08:08:01-08:11:38 | passed | test 134.8 s, vitest 197.4 s |
| Live, Firefox, 08:11:43-08:16:26 | passed | test 203.9 s, vitest 268.1 s |

Case 3's wall-clock fell on both browsers (no 30 s wait to time out). The live runs ran slower than in Phase 2 (101.6 s and 150.4 s); the live scenario did not change, and the host load average read about 100 at both samples (07:29 and 08:16).
