import { describe, expect, test, vi } from "vitest"
import { openFrame, sealFrame } from "./aes-gcm-frame"
import { PasskeyCredential, type PasskeyCredentialData } from "./passkey-credential"
import { derivePasskeyUnlockKey } from "./passkey-unlock-key"
import { asBase64CredentialId, asBase64SecretPrf } from "./secret-types"

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64")
const filled = (length: number, byte: number) => new Uint8Array(length).fill(byte) as Uint8Array<ArrayBuffer>
const SALT = b64(filled(32, 0x5a))
const data = (prf = filled(32, 1), prfSalt = SALT): PasskeyCredentialData => ({
	id: asBase64CredentialId("Y3JlZA=="),
	prf: asBase64SecretPrf(b64(prf)),
	prfSalt,
})

describe("PasskeyCredential", () => {
	test("keys only the input the passkey evaluated, and that key is the profile's unlock key", async () => {
		const credential = await PasskeyCredential.create(data())
		expect(credential.unlockKeyFor(b64(filled(32, 0x5b)))).toBeNull()
		const key = credential.unlockKeyFor(SALT)
		expect(key).not.toBeNull()
		const expected = await derivePasskeyUnlockKey(filled(32, 1), filled(32, 0x5a))
		const probe = filled(16, 7)
		expect(await openFrame(expected, await sealFrame(key as CryptoKey, probe))).toStrictEqual(probe)
	})

	test("binds the canonical encoding of the input, so another spelling of it is another input", async () => {
		// The row stores what create reported, re-encoded; a stored value only matches that encoding.
		const credential = await PasskeyCredential.create(data(filled(32, 1), ` ${SALT}`))
		expect(credential.prfSalt).toBe(SALT)
		expect(credential.unlockKeyFor(SALT)).not.toBeNull()
		expect(credential.unlockKeyFor(` ${SALT}`)).toBeNull()
	})

	test.each([
		["a 31-byte output", data(filled(31, 1))],
		["a 33-byte output", data(filled(33, 1))],
		["a 31-byte input", data(filled(32, 1), b64(filled(31, 0x5a)))],
		["an empty input", data(filled(32, 1), "")],
	])("refuses %s", async (_label, answer) => {
		await expect(PasskeyCredential.create(answer)).rejects.toThrow(/Invalid passkey PRF/)
	})

	test("wipes the decoded output once the key exists, and when the derivation throws", async () => {
		const seen: Uint8Array[] = []
		const real = globalThis.crypto.subtle.importKey.bind(globalThis.crypto.subtle)
		const spy = vi.spyOn(globalThis.crypto.subtle, "importKey").mockImplementation(((
			...args: Parameters<SubtleCrypto["importKey"]>
		) => {
			if (args[2] === "HKDF") seen.push(args[1] as Uint8Array)
			return real(...args)
		}) as SubtleCrypto["importKey"])
		try {
			await PasskeyCredential.create(data(filled(32, 9)))
			spy.mockImplementationOnce(((...args: Parameters<SubtleCrypto["importKey"]>) => {
				seen.push(args[1] as Uint8Array)
				return Promise.reject(new Error("import failed"))
			}) as SubtleCrypto["importKey"])
			await expect(PasskeyCredential.create(data(filled(32, 9)))).rejects.toThrow("import failed")
		} finally {
			spy.mockRestore()
		}
		expect(seen).toHaveLength(2)
		for (const prf of seen) expect(prf.every((byte) => byte === 0)).toBe(true)
	})
})
