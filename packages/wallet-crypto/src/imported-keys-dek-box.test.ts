import { hkdfSync } from "node:crypto"
import { describe, expect, test } from "vitest"
import { generateImportedKeysDek, IMPORTED_KEYS_DEK_LEN, sealDekUnderWrapKey, unsealDekUnderWrapKey } from "./imported-keys-dek-box"
import { derivePasskeyUnlockKey } from "./passkey-unlock-key"
import { asImportedKeysDek } from "./secret-types"

const PRF = new Uint8Array(32).map((_, i) => i) as Uint8Array<ArrayBuffer>
const SALT = new Uint8Array(32).fill(0x5a) as Uint8Array<ArrayBuffer>
const OTHER_PRF = new Uint8Array(32).fill(0x77) as Uint8Array<ArrayBuffer>

const hex = (b: Uint8Array) => Buffer.from(b).toString("hex")
const unlockKey = (prf = PRF, salt = SALT) => derivePasskeyUnlockKey(prf, salt)

describe("imported-keys DEK box", () => {
	test("generateImportedKeysDek mints 32 CSPRNG bytes", () => {
		const a = generateImportedKeysDek()
		const b = generateImportedKeysDek()
		expect(a.length).toBe(IMPORTED_KEYS_DEK_LEN)
		expect(hex(a)).not.toBe(hex(b))
	})

	test("seal → unseal round-trips under a passkey unlock key", async () => {
		const wrapKey = await unlockKey()
		const dek = generateImportedKeysDek()
		const sealed = await sealDekUnderWrapKey(wrapKey, dek)
		expect(hex(await unsealDekUnderWrapKey(wrapKey, sealed))).toBe(hex(dek))
	})

	test("the same PRF answer for the same input rebuilds the key at every unlock", async () => {
		const dek = generateImportedKeysDek()
		const sealed = await sealDekUnderWrapKey(await unlockKey(), dek)
		expect(hex(await unsealDekUnderWrapKey(await unlockKey(), sealed))).toBe(hex(dek))
	})

	test("another profile's unlock key fails closed", async () => {
		const dek = generateImportedKeysDek()
		const sealed = await sealDekUnderWrapKey(await unlockKey(), dek)
		await expect(unsealDekUnderWrapKey(await unlockKey(OTHER_PRF), sealed)).rejects.toThrow()
		await expect(
			unsealDekUnderWrapKey(await unlockKey(PRF, new Uint8Array(32).fill(1) as Uint8Array<ArrayBuffer>), sealed),
		).rejects.toThrow()
	})

	test("an AAD-less or foreign-purpose ciphertext fails closed (the slot demands its purpose tag)", async () => {
		const wrapKey = await unlockKey()
		const dek = generateImportedKeysDek()
		// Same key, same envelope framing, but sealed WITHOUT the purpose AAD.
		const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
		const ct = new Uint8Array(await globalThis.crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrapKey, dek))
		const out = new Uint8Array(13 + ct.length)
		out[0] = 1
		out.set(iv, 1)
		out.set(ct, 13)
		await expect(unsealDekUnderWrapKey(wrapKey, Buffer.from(out).toString("base64"))).rejects.toThrow()
	})

	test("a wrong-length plaintext fails closed (crafted 16-byte payload)", async () => {
		const wrapKey = await unlockKey()
		const short = asImportedKeysDek(new Uint8Array(16).fill(1) as Uint8Array<ArrayBuffer>)
		const sealed = await sealDekUnderWrapKey(wrapKey, short)
		await expect(unsealDekUnderWrapKey(wrapKey, sealed)).rejects.toThrow()
	})

	test("a corrupt envelope fails closed", async () => {
		const wrapKey = await unlockKey()
		await expect(unsealDekUnderWrapKey(wrapKey, "AAA=")).rejects.toThrow()
	})

	test("cross-implementation check: a key node:crypto's HKDF derives opens what the unlock key sealed", async () => {
		// A different HKDF implementation than the wallet's WebCrypto, so a consistently mis-wired
		// production HKDF cannot pass.
		const dek = generateImportedKeysDek()
		const sealed = await sealDekUnderWrapKey(await unlockKey(), dek)
		const keyBytes = Buffer.from(hkdfSync("sha256", PRF, SALT, Buffer.from("nulo:passkey-unlock:v1", "utf8"), 32))
		const independentKey = await globalThis.crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["decrypt"])
		expect(hex(await unsealDekUnderWrapKey(independentKey, sealed))).toBe(hex(dek))
	})
})
