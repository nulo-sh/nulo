# docs-1 phase 1: documents

- 2026-10-17. Filed the P38-12 known limit as #709 (label `known-limit`, closed as not planned with the reopening condition in its body), then wrote its number into `packages/wallet-crypto/ATTACK-SURFACE.md`.
- `SECURITY.md`: W1 and W2 as the plan words them; the three label paths and the `EncryptionKey` path point at `packages/wallet-crypto/src/`; the two authorization-layer paths at `packages/wallet-bridge/src/`. `PASSKEY_MASTER_LABEL` exists at `packages/wallet-crypto/src/passkey-credential.ts:32` (the recon sweep missed it).
- `ATTACK-SURFACE.md`: W3, W4 and W5 as worded.
- Gate: `bun run lint` 0, `bun run typecheck:all` 0, `bun run check:plans` 0 findings, `scripts/check-no-local-paths.sh` ok, the stale-phrase `git grep` over both documents printed nothing.
