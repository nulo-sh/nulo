# chaos-4 recon

Base: `origin/dev` at `2914b9699`. `E` is `apps/extension`, `PC` is `E/tests/e2e/helpers/profile-chaos`, `PS` is `E/src/wallet/services/profile`. Two Sonnet explorers (a reuse sweep and a scenario mapper); every claim the plan rests on was re-read by the planner.

## Reuse map

| Capability | Found | Verdict |
|---|---|---|
| Catalog, `plan()`, `planFromList()`, `World` | `PC/model.ts` (imports only `E/tests/e2e/fixtures/chaos-seed.ts` and `PC/citations.ts`, both import-free) | reuse; one optional `plan()` parameter (D1) |
| Oracles O1, O2, O3, O5, O7 | `PC/checkers.ts`: `checkSession`, `checkProfiles`, `checkWrites`, `checkOutcome`, `checkLeaks`, `findNeedles`, `bindProfile`, `emptyBindings`, `FAMILY_GROUPS`, `ownerOf` (pure; one type-only `@/` import) | reuse as-is |
| O6 `checkVerify` | `PC/checkers.ts:958`: needs derived addresses and imported sentinels, which need bb | build new (masters in place of addresses, D5) |
| Collectors (census, session row, profile rows, leak scan) | `PC/collect.ts`: each runs in a page through Puppeteer (`page.evaluate`) | build new in-process readers of the same reading types |
| Boot of the profile graph | three file-local boots: `PS/unlock-method.composition.test.ts:33-52` (with the `onAnswer` hold), `PS/service.passkey-unlock.test.ts:46-67`, `PS/service.integration.test.ts:206-270`; `fakeConfig` copied three times | build new in the harness, after the `onAnswer` shape (D2) |
| Stub builder | `E/src/wallet/services/composition-harness.ts:14` `svc()` (casts `as never`) | reuse |
| Fake passkey answers | `E/tests/helpers/fake-passkey.ts` (`fakePasskeyAnswer`, `fakePrf`, `freshPrfSalt`) | reuse as-is |
| Restarted worker | a second boot over the same `FakeBrowserApi` (`PS/service.passkey-unlock.test.ts:46-48`); `fakeBrowser` is a module singleton, so `storage.session` survives | reuse the pattern (D7) |
| Holding a call | `onAnswer` in `materializeCredential`; the convention of wrapping `api.storage.local.set` (`PS/service.passkey-unlock.test.ts:565`); `E/tests/helpers/held-read.ts` | reuse the patterns; no `src/` seam needed (D9) |
| Retired rows | file-local builders: `PS/service.integration.test.ts:4444-4452` and `:4133-4136`; `PS/profile-row.test.ts:15-23` | adapt in arc 2 |
| Armed long mode in the unit suite | `E/src/stores/balances.store.fuzz.test.ts:24,105,695` (`NULO_FUZZ_RUNS`, `NULO_FUZZ_SEED`) | follow the pattern (D8) |
| Unit-suite budget | none stated; `_unit-tests.yml` has `timeout-minutes: 15` and sets no `NULO_*` variable | state one (D10) |

Search trail for the absences: `grep -rn 'from ".*tests/e2e' E/src` (comments only); `grep -rn 'NULO_' .github E/package.json`; `retired` and `RetiredProfileError` in `E/src` and `E/tests`; `skipIf|runIf|process.env.NULO_` in `E/src`.

## Facts the plan rests on

- The unit suite (`E/vitest.config.ts`) includes `src/**/*.test.ts` and `scripts/**/*.test.ts`, excludes `tests/e2e/**`; 35 files under `E/scripts/e2e` already import `tests/e2e` helpers, among them `profile-chaos-model.test.ts` (model and checkers).
- No Biome rule forbids `src` importing `tests/e2e` or the reverse; `E/scripts/e2e/browser-seam.test.ts` scans `tests/e2e` for direct browser use only. `E/tsconfig.json` includes `src/**`, so vue-tsc checks what a `src` test imports.
- `profile-chaos-model.test.ts` pins no per-seed plan: it checks properties over `i * 7919 + 1` for 1,000 seeds. `E/tests/e2e/fixtures/chaos-seed.test.ts:28-38` pins `prng`. Any extra `rng()` call or catalog reorder redraws every e2e seed.
- `IService` has no stop hook (`packages/wallet-core/src/base/index.ts`, "IService has no stop hook"); `SessionManager` subscribes `config.onUpdate` and `alarms.onAlarm` for good (`PS/session-manager.ts:197,206`).
- The lock screen's pick is UI storage (`E/src/utils/lastActiveProfile.ts`), never written by the service.
- The envelope MAC binds the row id, `guard`, `secret`, `entropy`, `dekSealed`, `walletFingerprint` (`packages/wallet-crypto/src/entropy-mac.ts:63-86`), not `type`, `credentialId` or `prfSalt`.

## Scenario map (the lane's list against the tree)

| Scenario | Code path and window | Today (traced, not yet run) | Covered by |
|---|---|---|---|
| `prfSalt` rewritten between the answer and the re-read, unlock | `PS/service.ts:949` snapshot → `:958` answer → `:992` re-read under the lock | refused, `Invalid profile id` (`:1008`) | `PS/service.integration.test.ts:1177-1190` (the window path only) |
| the same, reveal (`exportMnemonic`) | `:2227` fence → `:2228` answer → `:2245` fence re-check | words returned: the fence checks presence and epoch, the words come from the snapshot the answer opened | none |
| the same, method change | whole-row check at commit (`:1443`) | `StaleUnlockCredentialError` | `PS/service.passkey-unlock.test.ts:449` |
| flipped `dekSealed` byte | unlock: `:580-582`; restart restore: `PS/session-manager.ts:637`; change and password change: `:1220-1241` | unlock opens derived-only, no bearer; restore closes the session; a change refuses with the row unchanged | INT:3167, :3219, :3245; PU:295-311, :770-835; no restart case |
| a reveal's fence after an answered prompt | `:2245` | a delete or epoch move refuses; a lock does not: the reveal is gated by the answer, not the session | INT:390, :475 (delete, tombstone) |
| retired row with a live row's `credentialId` | no code maps a credential to a row; unlock is per id (`:964`) | no effect on the live row | INT:4460-4525 (retired refusals) |
| retired row given the live row's slots | `E/src/wallet/services/profile/profile-row.ts:54-67` classifies by presence | it reads as a passkey row; the MAC (bound to the id) fails, so it opens derived-only | `profile-row.test.ts:90,136` (classifier only) |
| two profiles on one credential, salts swapped | `:964`, `:469` | neither opens (`PasskeyNotOpenedError`) | INT:737-765, :783-794; PU:283-292; not a create at a swapped salt |
| strict flipped during a passkey unlock | `PS/session-manager.ts:299`, `:769-777` | the open reads strict once | INT:1263-1310 (after the unlock); none at the answer |
| strict flipped during a bearer restore's MAC check | `PS/session-manager.ts:611-654` | the re-check at `:654` closes | `session-manager.test.ts:1092` (mocked MAC); none at the service with the real MAC |
| background stopped between a change's write and its reopen | `:1499` write → `:1517` reopen | a restarted worker sees the new row and the old session record | PU:564-612 (failures after the write); none for a stop |
| a delete or a second change racing a change | `:1394` fence → `:1400` new seal (answer) → `:1443` commit | delete: `Invalid profile id`; second change: the loser is stale | COMP:157-174, PU:372-395, :463-476; not two passkey changes at the answer |

## Collisions

- #1313 (e2e-followups-1) changes `startWorld`'s `pre-update` branch and `PC/pre-update.ts`; this lane plans only `empty` starts and adds one optional `plan()` parameter.
- A fourth boot and `fakeConfig` copy (D2).
