import type { Pin } from "./baseline"

/**
 * One pin per stamp of `snapshot.json`, added by hand from the line `bun run baseline:storage`
 * prints. Stamp 0 is the baseline 1.0.0 stores; the stamps are append-only, and a pin is never
 * edited or removed.
 */
export const PINNED_STAMPS: readonly Pin[] = [
	{
		stamp: "278ccf57ee615920cc53f61efe09594049614f3280ea87ea1830160a55096c33",
		goldens: "b2264a44a0587abcc0e8ffcc8a59ea595f7ed0b0b73b17b28818672530314521",
	},
]

/**
 * The SHA-256 of each file in `backups/`: a full backup's content as a candidate of `dev` wrote it
 * at the freeze (`wallet-version` 0.31.0-update.1, Aztec 6.0.0-rc.3), recorded by the update replay
 * (`NULO_E2E_BACKUP_RECORD=1`). `password.txt` is the updated 0.31.0 profile's, encrypted under the
 * e2e test password; `passkey.json` a fresh passkey profile's, with its passkey check. Never edited.
 */
export const PINNED_BACKUPS: Readonly<Record<string, string>> = {
	"password.txt": "f735236f1517e26ad6d1f698978d8e15ffa14b5b780c8a620e9e4a406a3ee456",
	"passkey.json": "325307d1c5155721438095a723add78f086a8b588383e1cc9284cd7078a0e2a9",
}
