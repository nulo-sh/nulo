# Recon: passkey-chaos-1

Read at `67cae683b` (origin/dev; no passkey-unlock-1 arc has landed). Two Explore agents (reuse sweep; profile service and storage oracles), each claim below checked against the tree. Paths are relative to `apps/extension/tests/e2e/` unless they start with `apps/`, `packages/`, `scripts/` or `.github/`.

## Reuse map

| Capability | Existing code | Verdict |
|---|---|---|
| Seed parsing | `fixtures/chaos-seed.ts` `chaosSeed(raw)`; its test `apps/extension/scripts/e2e/chaos-seed.test.ts` | reuse |
| Seeded PRNG | `network/send-chaos.test.ts:39` `prng` (mulberry32), file-local | adapt: move into `fixtures/chaos-seed.ts`, `send-chaos` imports it (same function, same seeds → same actions) |
| Action plan from a seed | `send-chaos.test.ts` `plan()` (send-specific) | build new: a model-driven planner; nothing else plans actions (searched `plan(`, `ACTIONS`, `prng` under `tests/e2e`) |
| Launch, per-test isolation | `fixtures/extension.ts:97` `launchExtension`, fixture `freshExtensionPerTest`; `openPopup`, `openOnboarding`, `recordPageErrors` (`fixtures/wallet-pages.ts`) | reuse; `launchExtension` reads `inject("extensionPath" \| "egressGuard" \| "liveLeg")` and `expect.getState()` (`:114`, `:132`, `:136`, `:171`), so it runs inside vitest only |
| Profile flows | `fixtures/profiles.ts` (`createAndActivateProfile`, `readProfileNames`, `resetProfile`, `confirmProfileReset`, `waitForProfilePurged`, `revealSeedPhrase`, `renameProfile`); `fixtures/auth.ts` (`lockWallet`, `waitForLockScreen`, `unlockProfile`, `changePassword`, `unlockAfterBackgroundDeath`); `helpers/import-drivers.ts` (`importSeed`, `importFullBackup`, `submitFullBackupImport`, `readActiveAccount`) | reuse; no helper for a wrong password or a passkey unlock (inline in `passkey-paths.test.ts:63-113`): build new drivers over the same testids |
| Passkey create and faults | `fixtures/passkey.ts`: `registerPasskeyProfile`, `setupPasskeyVirtualAuth`, `refusePasskeyStep`, `withholdCreatePrf`, `holdNextPasskeyRequest`, `stallNextPasskeyCeremony`, `watchPasskeySurface` | reuse; no fault returns an assertion without a PRF result (`src/wallet/utils/passkey-ceremony.ts:138-140` refuses it as `PasskeyPrfError`) and none answers with another profile's credential: build new, as page shims like `withholdCreatePrf` (searched `getClientExtensionResults`, `withhold`, `no prf`) |
| Authenticator scope | `fixtures/browser/index.ts:35-43,87`: `credentialOutlivesPage` false on Chrome (per page), true on Firefox (per session) | reuse; the model branches on it |
| Backup export | `helpers/backup-export.ts` (`downloadEncryptedBackup`, `downloadPlainPasskeyBackup`, `openEncryptedBackup`, `exportBackupFile`); `helpers/download-capture.ts` (`armDownloadCapture`, `readCapturedDownload`, re-arm before each export) | reuse |
| Corrupt or truncated file | none (searched `truncat`, `flip`, `corrupt` under `tests/e2e`) | build new: a string transform before `writeBackupToTemp` (`helpers/test-temp-dir.ts`) |
| Account file | `helpers/account-io.ts` (`exportAccountBody`, `previewImport`, `confirmImport`) | reuse |
| Background restart | `fixtures/browser/index.ts:310` `stopBackground`; `fixtures/session.ts` `readLivenessBaseline`, `waitForWorkerLiveness`, `lockFromAnotherWindow`, `callService` | reuse; Firefox needs every extension page closed first |
| Session and lock oracles | `fixtures/session.ts` `readSessionRow` (`nulo:core:session` in `storage.session`, bearer kept in the page), `peekSession` | reuse |
| Profile rows | `nulo:core:profiles@<id>` in `storage.local`, plain JSON (`src/wallet/storage/stored-shapes.ts:153-164`; writers `src/wallet/services/profile/profile-row.ts:40-65`) | reuse as raw reads |
| Purge check | `fixtures/profiles.ts:218` `waitForProfilePurged(page, id)` | reuse |
| Errors | `ctx.pageErrors`, `ctx.consoleErrors` (pages through `recordPageErrors`); filter list only "Client disconnected" and Presto probe noise | reuse; app `console.*` goes to the log ring (`storage.session` `nulo:logs`, `src/wallet/logger/store.ts`), not to Puppeteer: build new reader over `readSwLogTrail` (`fixtures/journal.ts:285`) |
| Log viewer CSV | testids `settings-logs-open`, `logs-more-trigger`, `logs-export-csv` (developer mode); `components/JsonViewer/logs-csv.ts` | build new capture: `armDownloadCapture` + the click |
| Leak scan | none for seed, entropy, password or field names (`sealed-storage.test.ts` greps only a marker in three roots) | build new |
| CSP and egress | `ctx.close()` fails on a CSP violation or an undeclared host | reuse, free per launch |
| dApp at smoke level | none (playground URL is `inject("playgroundUrl")`, network setup only) | build at network level over `fixtures/playground.ts`; a smoke stand-in dApp would be a second dApp (CLAUDE.md § The wallet repo) |
| Pre-update profiles | `fixtures/update/release.ts` (`v0.31.0` digest-pinned), `fixtures/update/in-place.ts` (`installForUpdate`, `updateInPlace`); `update-replay.test.ts:504` registers its passkey profile on the candidate | reuse after passkey-unlock-1 A2 adds the 0.31.0 passkey case (its D10) |
| Isolation | `port-registry.ts`, `owned-processes.ts`, `process-group.ts`; the egress listeners claim registry ports per launch | reuse |

## Constraints the design must respect

- Smoke global setup kills every Chrome loading its `EXTENSION_PATH` by prefix, at setup and teardown (`.claude/skills/e2e-testing/SKILL.md` § Hazards): parallel smoke runs need dist copies whose paths do not prefix each other.
- Detaching a Chrome page's DevTools session clears its virtual authenticators (known limit #837): an agent session must keep one process attached to its anchor page for the session's life.
- Chrome's authenticator refuses every later step once a verification failed (`SKILL.md` § Passkeys), so `refuseNextStep` answers in the page on Chrome.
- The smoke config has no stall watchdog; the network config does (600 s without progress, `vite.shared.ts:151`).
- `fileParallelism: false`, `pool: "forks"` (`vite.shared.ts:132-137`); the smoke config retries twice unless a test pins `retry: 0`.
- Measured file times (`shard-timings.json`, Chrome/Firefox seconds): `passkey-paths` 18/27, `passkey-backup` 25/34, `backup-roundtrip` 21/27, `account-import-export` 45/56, `sw-resilience` 58/59. A launch with a profile is 5.0 s / 9.2 s (`SKILL.md` § Runtime budget).

## Collisions with passkey-unlock-1 (plan at `c98beba6d`)

Files both lanes touch: `fixtures/passkey.ts` (A2 rewrites create and retry), `helpers/backup-export.ts` (A2: passkey backups get a file password), `helpers/backup-seal.ts`, `helpers/import-drivers.ts` (A2 drops discovery import), `fixtures/update/*` and `update-replay.test.ts` (A2's 0.31.0 passkey case). This lane adds to `fixtures/passkey.ts` and `fixtures/chaos-seed.ts` and edits `network/send-chaos.test.ts`; it changes no line A2's change map names.

## Open work read

`gh issue list --state open`: no open issue covers chaos or profile flows; #1127 is the change under test. Closed known limits read: #837 (authenticator cleared on detach), #322 (a Firefox send-chaos seed), #614, #809, #597 (passkey backup and derivation, all superseded by #1127's design).
