import type { Pin } from "./baseline"

/**
 * One pin per stamp of `snapshot.json`, added by hand from the line `bun run baseline:storage`
 * prints. Stamp 0 is the baseline 1.0.0 stores, re-cut twice before any store carried a release
 * (CLAUDE.md § Persisted-storage shape changes); the stamps are append-only, a pin is never edited,
 * and a pin is removed only on the owner's recorded decision, as those were.
 */
export const PINNED_STAMPS: readonly Pin[] = [
	{
		stamp: "0a82f0bec45d4110b58565dbfae1b5cccf913071a008e946a5d72c6809b74275",
		goldens: "d820b5e5442512405938f09dbc3b177bbcf3f57c1d0764293b48517e5a6a9399",
	},
]

/**
 * The SHA-256 of each file in `backups/`: a full backup's content as a candidate of `dev` wrote it,
 * recorded by the update replay (`NULO_E2E_BACKUP_RECORD=1`), each encrypted under the e2e test
 * password. `password.txt` is the updated 0.31.0 profile's, from the first freeze (`wallet-version`
 * 0.31.0-update.1, Aztec 6.0.0-rc.3); `passkey.txt` a fresh passkey profile's, from the second
 * (`wallet-version` 1.0.0-update.1). Never edited.
 */
export const PINNED_BACKUPS: Readonly<Record<string, string>> = {
	"password.txt": "e30a64f3db7ac0ab210a2d78927525f22401b5e19c53651ad3cdba1f059c8d76",
	"passkey.txt": "1d2d4a45235642c82b3caa65af50d6646268ce4611aba6a093f135696618c1f6",
}
