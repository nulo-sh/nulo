import type { Pin } from "./baseline"

/**
 * One pin per stamp of `snapshot.json`, added by hand from the line `bun run baseline:storage`
 * prints. Stamp 0 is the baseline 1.0.0 stores; with a pin present the stamps are append-only. A pin
 * is never edited or removed.
 */
export const PINNED_STAMPS: readonly Pin[] = [
	{
		stamp: "33d3ad02fd5a8b639d161a945784edd6253b29fb47708fb67a1e952cd39755e7",
		goldens: "ab6c0dbeaaa1421d455dd80f87176f2766b7b5f125e60ea53c0ca7b7fc06a653",
	},
]

/**
 * The SHA-256 of each full backup in `backups/`, exported by the 1.0.0 candidate after it updated
 * a 0.31.0 install (the update replay, `NULO_E2E_BACKUP_RECORD=1`): a password profile's, opened,
 * and a passkey profile's, with its passkey check. Every later build imports both. Never edited.
 */
export const PINNED_BACKUPS: Readonly<Record<string, string>> = {
	"password.json": "7281caca631e7d9acccb4ec41af8d1cb6dec0f38e5c2d32d11b208b25cd576d1",
	"passkey.json": "3bca08b93626bf839974220d1627a1b78f3e4253fcf5f5aa18c1063ccbd4cf7b",
}
