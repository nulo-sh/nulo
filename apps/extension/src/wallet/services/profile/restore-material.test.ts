import { getMnemonic } from "@nulo/wallet-core/utils"
import { asBase64MasterSecret, deriveMasterFromMnemonic } from "@nulo/wallet-crypto"
import { describe, expect, test } from "vitest"
import { decodeRestoreMaterial } from "./restore-material"

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64")
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex")

async function body(fill = 0x31) {
	const entropy = new Uint8Array(32).fill(fill)
	const master = await deriveMasterFromMnemonic(await getMnemonic(entropy))
	const transferKey = new Uint8Array(32).fill(0x55)
	return {
		bytes: { master, entropy, transferKey },
		secret: {
			type: "password" as const,
			masterKey: asBase64MasterSecret(b64(master)),
			entropy: b64(entropy),
			importedKeysDek: b64(transferKey),
		},
	}
}

describe("decodeRestoreMaterial", () => {
	test("decodes a consistent body to its master, entropy and transfer key", async () => {
		const { bytes, secret } = await body()
		const material = await decodeRestoreMaterial(secret)
		expect([hex(material.master), hex(material.entropy), hex(material.transferKey)]).toStrictEqual([
			hex(bytes.master),
			hex(bytes.entropy),
			hex(bytes.transferKey),
		])
	})

	test.each<[string, (s: Awaited<ReturnType<typeof body>>["secret"]) => object, string]>([
		["a short master", (s) => ({ ...s, masterKey: b64(new Uint8Array(31)) }), "Invalid master key length"],
		["a short entropy", (s) => ({ ...s, entropy: b64(new Uint8Array(31)) }), "Invalid entropy length"],
		[
			"entropy from another phrase",
			(s) => ({ ...s, entropy: b64(new Uint8Array(32).fill(0x32)) }),
			"Backup entropy does not derive the backup master key",
		],
		["a short transfer key", (s) => ({ ...s, importedKeysDek: b64(new Uint8Array(31)) }), "Invalid imported-keys dek length"],
		["no transfer key", ({ importedKeysDek: _k, ...rest }) => rest, "Invalid imported-keys dek length"],
		// The master is checked first: a body wrong in every field names the master.
		["every field wrong", () => ({ type: "password", masterKey: "", entropy: "", importedKeysDek: "" }), "Invalid master key length"],
	])("refuses %s", async (_label, edit, message) => {
		const { secret } = await body()
		await expect(decodeRestoreMaterial(edit(secret) as typeof secret)).rejects.toThrow(message)
	})
})
