import type { Pin } from "./baseline"

/**
 * One pin per stamp of `snapshot.json`, added by hand from the line `bun run baseline:storage`
 * prints. Stamp 0 is the baseline 1.0.0 stores, re-cut once before any stable release carried a
 * later stamp (CLAUDE.md § Persisted-storage shape changes); the stamps are append-only, and a pin
 * is never edited or removed.
 */
export const PINNED_STAMPS: readonly Pin[] = [
	{
		stamp: "ada97fe9dc71a73a3325823558c889ed6e6909ca86f73511a9a1773f3c9c82d6",
		goldens: "336b9cdcbb9910eb5012d446a877f162773d1072454220ab1aff9842025335c8",
	},
]

/**
 * The SHA-256 of each file in `backups/`: a full backup's content as a candidate of `dev` wrote it
 * at the freeze (`wallet-version` 0.31.0-update.1, Aztec 6.0.0-rc.3), recorded by the update replay
 * (`NULO_E2E_BACKUP_RECORD=1`). `password.txt` is the updated 0.31.0 profile's, encrypted under the
 * e2e test password; `passkey.json` a fresh passkey profile's, with its passkey check. Never edited.
 */
export const PINNED_BACKUPS: Readonly<Record<string, string>> = {
	"password.txt": "e30a64f3db7ac0ab210a2d78927525f22401b5e19c53651ad3cdba1f059c8d76",
	"passkey.json": "3f82563c7987d6a9a865a39ff45303b78041688d7f2ec07739198f33e7366aea",
}
