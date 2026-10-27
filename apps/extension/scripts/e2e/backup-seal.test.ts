import { describe, expect, test } from "vitest"
import { EncryptionKey } from "@nulo/wallet-crypto"
import { assembleFullBackup } from "@/utils/full-backup-helpers"
import { type PlainBackup, sealPlainBackup } from "../../tests/e2e/helpers/backup-seal"

const envelope = { "wallet-version": "test", "compat-epoch": 5, "master-key": "bWFzdGVy" }
const slices = { profile: { id: "p1", type: "passkey" }, account: [{ address: "0x01", chainId: 1 }], token: [] }

/** A backup as the wallet assembles it, read back as the import reads the file. */
async function walletBackup(): Promise<PlainBackup> {
	const sources = Object.entries(slices).map(([name, slice]) => ({ name, backup: async () => slice }))
	return JSON.parse((await assembleFullBackup(envelope, sources)).compact) as PlainBackup
}

/** The import's integrity check: the checksum over the body without it. */
async function importChecksum(backup: PlainBackup): Promise<string> {
	const { checksum: _checksum, ...body } = backup
	return EncryptionKey.getHashHex(JSON.stringify(body))
}

describe("sealing an edited backup", () => {
	test("the plain seal reproduces the wallet's own checksum on an unedited backup", async () => {
		const backup = await walletBackup()
		expect(JSON.parse(sealPlainBackup(backup)).checksum).toBe(backup.checksum)
	})

	test("an edited body sealed again passes the import's checksum, and its old checksum does not", async () => {
		const original = await walletBackup()
		const edited: PlainBackup = { ...original, data: { ...original.data, account: [] } }
		expect(await importChecksum(edited)).not.toBe(original.checksum)
		const sealed = JSON.parse(sealPlainBackup(edited)) as PlainBackup
		expect(sealed.checksum).toBe(await importChecksum(sealed))
	})
})
