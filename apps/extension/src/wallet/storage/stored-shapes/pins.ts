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
	{
		stamp: "12f943d92c2eccbed96e3e6c1226c5240de80c2451eb4e3428c16293499d4341",
		goldens: "865c8d16156f1217088ad5f361caa6c7aafc70f0297d04a54f36a246d8185b6d",
	},
	{
		stamp: "d22abc0591f5b64a747c78de3b3b5085957d6b1a17df8a9e8195f8032ba6068b",
		goldens: "377e86b8ae852a5c6939f8b0c31501c296fb1264569fc5739a4c2e1bab3c9d73",
	},
	{
		stamp: "9ad07ea5b0387fd0d0105f2121730585a20ac5b9bef0748aba981105186a3b66",
		goldens: "98189903fe1ba1a87d26753c707272764290728501ea11c1be6db6f40d57714a",
	},
	{
		stamp: "16b203aaa2701d23e8e979747e73dbac37abfbe0a5119861a1defdd5888add45",
		goldens: "9a045bac51998888d8b92bdfbe0ccfd38258092b74bd84bbe20ece6083f9470f",
	},
	{
		stamp: "3ad36e6d0d798b152b761d369434f767add95f2979450f436f17aaef29e2e549",
		goldens: "cf4cf9257a134f5a2f910472e106865bef6492baf5fe321c6ad28dff0293ba25",
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
