import type { Pin } from "./baseline"

/**
 * One pin per stamp of `snapshot.json`, added by hand from the line `bun run baseline:storage`
 * prints. Stamp 0 is the baseline 1.0.0 stores, re-cut once before any stable release carried a
 * later stamp (CLAUDE.md § Persisted-storage shape changes); the stamps are append-only, and a pin
 * is never edited or removed.
 */
export const PINNED_STAMPS: readonly Pin[] = [
	{
		stamp: "66c69343476e58580e406c8c59a19749aaa2d21671dccf6b6cfe639df9616ee9",
		goldens: "0d2ec784d1a65acd569f9ac18b50ee9eb02b048f7acb89888868251d67113012",
	},
	{
		stamp: "e4359627d29f95dc56820278a84673c3371ac6091045f9bfc609599070e98e86",
		goldens: "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
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
