# Phase 4: #643, the passkey row verifies the wallet's MAC, then re-seals with its own passkey

- **Deviation: a leaf module.** The seals and the check live in `tests/e2e/helpers/backup-seal.ts` (`PlainBackup`, `sealPlainBackup`, `sealPasskeyBackup`, `passkeyBackupVerifies`), not in `backup-export.ts`. The unit test at `scripts/e2e/backup-seal.test.ts` is typechecked by `tsconfig.scripts.json`, and importing `backup-export.ts` pulled the whole fixture graph in through `ExtensionContext` (first attempt: 33 `TS` errors in `fixtures/*` under that project). The leaf imports only `@nulo/wallet-crypto` and `@/utils/full-backup-helpers`, so `import-drivers.ts` reaches it with no cycle and `backup-export.ts` keeps its own imports. Its five importers of `sealPlainBackup` move with it.
- **The seal takes plain strings** (`PasskeyAnswer`), minting the wallet's branded types through `asBase64CredentialId` and `asBase64SecretPrf` at the one call that needs them.
- **The unit test's controls hold:** with the MAC check removed from `passkeyBackupVerifies`, "the wallet's MAC does not cover the edited body" goes red; with the stale MAC put back after the seal, "the passkey seal passes the import's checksum and its MAC" goes red.
- **Gate.**
  - `bun run lint` 0 (its `noImportCycles` step included), `bun run typecheck:all` 0, `bun run test` 0 (848 files).
  - Smoke, retry 0: Chrome `passkey-backup` 3/3 and `passkey-retry` 9/9 (`passkey-toolbar-panel` is Firefox-only); Firefox all three, 18/18 (310 s).
  - Network, `NULO_E2E_PROVERLESS=1`, retry 0, both matrix rows and `import-handshake-note`: Chrome 4/4, Firefox 4/4. The passkey row took 65 s on Chrome and 44 s on Firefox, against the plan's estimate of about 4 min; the settings row 92 s and 88 s.

## Post-implementation, arc 1

- Round 1, Codex (session `01a14f71`): conditional approve, 3 findings; the capture-phase scroll guard and the narrower `passkeyBackupVerifies` doc accepted, a text-change tracker rejected (`showScrollBtn` has two setters, both covered). Opus diff review alongside: conditional approve, 5 small findings, all accepted (assertion messages, a stale note, a stated stand-in assumption, two wording fixes).
- Round 2, Codex resume: approve, no new material finding.
