import type { Pin } from "./baseline"

/**
 * One pin per stamp of `snapshot.json`, added by hand from the line `bun run baseline:storage`
 * prints. Stamp 0 is the baseline 1.0.0 stores; the stamps are append-only, and a pin is never
 * edited or removed.
 */
export const PINNED_STAMPS: readonly Pin[] = [
	{
		stamp: "27dc0de69827668974b26630bcebd39383ab673fdb9682164102a083ab2c5c9f",
		goldens: "ee9cf595a340013f09c090ffac14aae9a07b57ca8db91da595bfabadc3c80afd",
	},
	{
		stamp: "c39893d8df581e4645ac55b047a67d16719cb2179053b82e6d673b79f2485fa9",
		goldens: "8d66d1cc634f8110d5ef37b7abbf60e2b6ed8776e4654facedb6f73aa058026b",
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
