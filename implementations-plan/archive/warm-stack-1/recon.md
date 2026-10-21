# warm-stack-1 recon

Base: `origin/dev` at `8663cdd15`. Two Explore agents (sonnet) plus the planner's own reading. Timing data: block-time-1's local span runs (`p1-ci-chrome`: all 127 proverless network files, Chrome; `p1-ff-union`: 32 files, Firefox; proverless, retry 0, a loaded shared host), read with scratch tools kept outside the repo. CI noise: the six network runs per browser that `apps/extension/tests/e2e/shard-timings.json` names, parsed with `runCosts` from `scripts/ci-cd/e2e-timings.ts`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Write `chrome.storage.local` before the popup opens | `settleLaunchedExtension` (`tests/e2e/fixtures/extension.ts:236-320`) writes `nulo:onboarding:completed` and the legal seed from a scratch extension page after the worker's liveness; `rebootOverHeldList` (`:327`) writes then restarts the worker | reuse-as-is (the post-liveness write) |
| Replace a whole storage dump | `writeLocalStorage` (`fixtures/update/in-place.ts:199`), `writeRecording` / `readRecording` (`fixtures/update/recording.ts`), `v0.31.0.storage.json` | adapt (probe template capture) |
| Check every stored row reads | `unreadRows` (`fixtures/update/stored-rows.ts:42`) over `STORED_SHAPES` | reuse-as-is |
| Run the production profile writer outside a browser | `services/profile/service.integration.test.ts` builds the real `ProfileService` over `FakeBrowserApi` (`packages/wallet-core/src/testing/fake-browser-api.ts`) with `svc()` stubs (`services/composition-harness.ts`) | adapt (renderer, only on the injection go) |
| Seed-to-address in Node | `fixtures/aztec.ts:569-590`, `helpers/import-drivers.ts` `makeRecoveryTriple`, `deriveNuloAccountAddress` | reuse-as-is |
| Committed fixture + regenerate + drift test | `bun run baseline:storage` → `stored-shapes/{snapshot,goldens}.json`, `snapshot.test.ts` names the command | pattern only |
| A seed pool of test profiles | none: one fixed wallet seed (`CANONICAL_SEED_24`, `helpers/import-drivers.ts:117`); every other seed is random per run (searched `mnemonic`, `TEST_SEED`, `abandon`, `getRandomValues` under `tests/e2e/**`) | build new, only on the injection go |
| Per-file CI times | `runCosts` / `parseJobLog` (`scripts/ci-cd/e2e-timings.ts`) over the shard jobs' logs; no timing artifact on success | reuse-as-is |
| Test-only compiled seam | `src/e2e/config.ts` flags, `_build-extension.yml:142` marker grep, `build-env-guard.test.ts` | not needed: nothing here changes the bundle |

## How a network file gets an onboarded wallet today

- `registerProfile` (`extension.ts:356-390`): `openPopup`, `#/popup/register`, `waitForServiceReady`, Create, Password, the test password twice, submit, `#/popup/general`, `balance-amount`, then **`page.close()`**. It always creates a random profile (`TEST_PASSWORD`, `fixtures/constants.ts:5`).
- `launchOnLocalNetwork` (`extension.ts:606`): `launchExtension`, `registerProfile`, then **`openPopup` again**, `waitForHash #/popup/general`, `switchToLocalNetwork`. `setupConnectedPlayground` (`:469`) and `dappConnectedExtension` repeat the sequence. `tokenReadyExtension` adds the script-side mint of 1000 and an exact-balance wait (`importTokenAndWaitForBalance`, `fixtures/tokens.ts:133`).
- The address the script side mints to is read from `nulo:ui:activeAccount` after the switch (`fixtures/accounts.ts:7`).
- Files that test onboarding, import, restore, reset, update or passkeys call `launchExtension` and their own drivers (inventory: about 30 files, among them `profile-reimport-matrix`, `stale-network-reset`, `backup-*`, `restore-again`, `update-in-place`, `passkey-execution-canary`, `default-token-seeding`).

## Measured split (local spans, exclusive owners)

| | Chrome, 127 files, 7254 s | Firefox, 32 files, 3827 s |
|---|---:|---:|
| `launchExtension` (out of scope) | 12.2 % | 10.2 % |
| `registerProfile` | 5.9 %, 155 calls, median 2.65 s | 4.8 %, 46 calls, median 3.97 s |
| … the wait for Home after submit (KDF, session, default account) | median 1.42 s | 1.72 s |
| … the popup open inside it | median 0.74 s | 1.19 s |
| … the register page itself (clicks, typing, route) | about 0.15 s | about 0.5 s |
| The second popup open after it, plus its Home wait (150 of 155 calls) | 0.68 + 0.23 s median, 149 s total | 1.57 + 0.38 s, 92 s total |
| `switchToLocalNetwork` | 1.8 %, median 0.77 s | 1.5 %, 1.12 s |
| `connectPlayground` + `grantCapBundle` (dApp session, not onboarding) | 7.6 % | 8.6 % |
| `mintPublicTokens` (on-chain, per file) | 6.8 %, median 5.11 s | 3.8 %, 5.45 s |
| `waitForFreshBalanceRow` (note discovery and balance) | 2.7 % | 3.7 % |

#991's "onboarding & profile" category (20.9 % / 17.2 % here) includes the dApp connect, network switches and test subjects (handshake and backup imports). The on-chain share (the mint) cannot move with any stored profile; chain snapshots stay out of scope (brief step 4), recorded here as the reason.

## Key derivation and PXE

- Every `EncryptionKey.encrypt` / `decrypt` derives its own 600 000-iteration PBKDF2 key (`packages/wallet-crypto/src/encryption-key.ts:7,44-45,79-80`); `getPasshash` is one SHA-256. `PasswordSecretBox.seal` encrypts three slots and `unseal` decrypts them; a creation also seals the imported-keys DEK and an unlock opens it, so each path runs four derivations, plus one BIP-39 derivation each (`password-secret-box.ts:92-135`, `services/profile/service.ts:630-648,680-696`). An unlock costs about what a creation costs.
- The PXE registers an account lazily, on its first use (`NuloAccount.ensureRegistered`, `packages/aztec-runtime/src/account/nulo-account.ts:107`, called from the scope registrar and the execution paths), not at unlock. Both paths pay it.
- The default account is derived by the popup's bootstrap after a session opens (`ensureDefaultAccount`, `composables/useProfileBootstrap.ts:176`, `services/account/service.ts:277`), on the default network and again on Local at the switch.

## Hazards for a fixed seed pool

- One seed is one account per sandbox: a second launch on the same seed sees the first one's mint (`tokenReadyExtension`'s exact-1000 wait) or its deployed account.
- A direct vitest invocation can reuse a prior sandbox (`tests/e2e/global-setup.ts:319-333`); `e2e:agent` always boots a fresh one; CI boots one per shard job. Uniqueness must hold per sandbox lifetime, which a full unsharded local run stretches to about 170 launches.
- Ciphertexts, salts, IVs, the imported-keys DEK and the row MAC are random per creation (`profile/service.ts:630-648`), so two renderings of one seed never agree byte for byte.

## CI noise (the six recorded runs per lane)

The network pool's summed file time per run: Chrome mean 3862 s, SD 113 s; Firefox mean 4586 s, SD 123 s. Per shard 48-96 s. Six runs per arm resolve a pool difference of about 2 × SD × √(2/6) ≈ 130 s (Chrome), 142 s (Firefox).
