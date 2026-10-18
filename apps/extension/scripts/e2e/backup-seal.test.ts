import { randomBytes } from "node:crypto"
import { describe, expect, test } from "vitest"
import { EncryptionKey, PasskeyCredential, verifyBackupMac } from "@nulo/wallet-crypto"
import { type PlainBackup, passkeyBackupVerifies, sealPasskeyBackup, sealPlainBackup } from "../../tests/e2e/helpers/backup-seal"

const passkey = { id: randomBytes(16).toString("base64"), prf: randomBytes(32).toString("base64") }

/** A passkey backup as the wallet seals it, read back as the import reads the file. */
async function walletBackup(): Promise<PlainBackup> {
	const body = {
		"wallet-version": "test",
		"compat-epoch": 5,
		"master-key": passkey.id,
		data: { profile: { id: "p1", type: "passkey" }, account: [{ address: "0x01", chainId: 1 }], token: [] },
	}
	return JSON.parse(await sealPasskeyBackup(body, passkey)) as PlainBackup
}

/** The import's integrity check: the checksum over the body with neither it nor the MAC. */
async function importChecksum(backup: PlainBackup): Promise<string> {
	const { checksum: _checksum, "backup-mac": _mac, ...body } = backup
	return EncryptionKey.getHashHex(JSON.stringify(body))
}

describe("sealing an edited passkey backup", () => {
	test("the plain seal refuses a backup carrying a MAC", async () => {
		const backup = await walletBackup()
		expect(() => sealPlainBackup(backup)).toThrow(/sealPasskeyBackup/)
	})

	test("the passkey seal passes the import's checksum and its MAC under the same passkey", async () => {
		const edited = await walletBackup()
		edited.data.account = []
		const sealed = JSON.parse(await sealPasskeyBackup(edited, passkey)) as PlainBackup

		expect(sealed.checksum).toBe(await importChecksum(sealed))
		const credential = await PasskeyCredential.create(passkey)
		expect(await verifyBackupMac(credential, sealed.checksum as string, sealed["backup-mac"] as string)).toBe(true)
		expect(await passkeyBackupVerifies(sealed, passkey)).toBe(true)
	})

	test("the wallet's MAC does not cover the edited body", async () => {
		const original = await walletBackup()
		const edited: PlainBackup = { ...original, data: { ...original.data, account: [] } }
		const checksum = await importChecksum(edited)

		const credential = await PasskeyCredential.create(passkey)
		expect(await verifyBackupMac(credential, checksum, original["backup-mac"] as string)).toBe(false)
		expect(await passkeyBackupVerifies({ ...edited, checksum }, passkey)).toBe(false)
	})
})
