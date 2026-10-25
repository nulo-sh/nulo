import { hkdfSync } from "node:crypto"
import { describe, expect, test } from "vitest"
import { openFrame, sealFrame } from "./aes-gcm-frame"
import { derivePasskeyUnlockKey, newPrfSalt, PRF_BYTES } from "./passkey-unlock-key"

const INFO = "nulo:passkey-unlock:v1"
const filled = (length: number, byte: number) => new Uint8Array(length).fill(byte) as Uint8Array<ArrayBuffer>
const random = (length: number) => globalThis.crypto.getRandomValues(new Uint8Array(length)) as Uint8Array<ArrayBuffer>
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex")

/** The AES-256-GCM key node:crypto's HKDF gives for these inputs. */
function referenceKey(prf: Uint8Array, salt: Uint8Array, info = INFO): Promise<CryptoKey> {
	const raw = new Uint8Array(hkdfSync("sha256", prf, salt, Buffer.from(info), 32))
	return globalThis.crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"])
}

/** Two AES-GCM keys are the same key iff a frame sealed under each opens under the other. */
async function sameKey(a: CryptoKey, b: CryptoKey): Promise<boolean> {
	const probe = random(16)
	try {
		const [fromA, fromB] = [await sealFrame(a, probe), await sealFrame(b, probe)]
		return hex(await openFrame(b, fromA)) === hex(probe) && hex(await openFrame(a, fromB)) === hex(probe)
	} catch {
		return false
	}
}

describe("derivePasskeyUnlockKey", () => {
	test("matches the pinned HKDF-SHA256 vector, computed by node:crypto", async () => {
		const prf = filled(32, 0x01)
		const salt = filled(32, 0x02)
		const pinned = "991cfc09495281c481107b4656493259348ba84a7936c480832c20b0813f566d"
		expect(Buffer.from(hkdfSync("sha256", prf, salt, Buffer.from(INFO), 32)).toString("hex")).toBe(pinned)
		const pinnedKey = await globalThis.crypto.subtle.importKey("raw", Buffer.from(pinned, "hex"), "AES-GCM", false, [
			"encrypt",
			"decrypt",
		])
		expect(await sameKey(await derivePasskeyUnlockKey(prf, salt), pinnedKey)).toBe(true)
		// The probe tells keys apart: the same inputs under another label are another key.
		expect(await sameKey(await derivePasskeyUnlockKey(prf, salt), await referenceKey(prf, salt, "nulo:dek-wrap:v1"))).toBe(false)
	})

	test("matches node:crypto over fresh random PRF outputs and salts", async () => {
		for (let i = 0; i < 32; i++) {
			const prf = random(32)
			const salt = random(32)
			const input = `prf=${hex(prf)} salt=${hex(salt)}`
			expect(await sameKey(await derivePasskeyUnlockKey(prf, salt), await referenceKey(prf, salt)), input).toBe(true)
			expect(await sameKey(await derivePasskeyUnlockKey(prf, salt), await referenceKey(prf, random(32))), input).toBe(false)
		}
	})

	test.each([
		["a short PRF output", 31, 32, /PRF output length/],
		["a long PRF output", 33, 32, /PRF output length/],
		["an empty PRF output", 0, 32, /PRF output length/],
		["a short salt", 32, 31, /PRF salt length/],
		["a long salt", 32, 33, /PRF salt length/],
	])("refuses %s", async (_label, prfLength, saltLength, message) => {
		await expect(derivePasskeyUnlockKey(random(prfLength), random(saltLength))).rejects.toThrow(message)
		// Success control: the same call with 32-byte inputs derives.
		await expect(derivePasskeyUnlockKey(random(32), random(32))).resolves.toBeDefined()
	})

	test("the key is AES-256-GCM, encrypt and decrypt only, and cannot be exported", async () => {
		const key = await derivePasskeyUnlockKey(random(32), random(32))
		expect(key.algorithm).toMatchObject({ name: "AES-GCM", length: 256 })
		expect([...key.usages].sort()).toEqual(["decrypt", "encrypt"])
		expect(key.extractable).toBe(false)
		await expect(globalThis.crypto.subtle.exportKey("raw", key)).rejects.toThrow()
	})
})

test("newPrfSalt draws 32 fresh bytes per call", () => {
	const a = newPrfSalt()
	const b = newPrfSalt()
	expect(a.byteLength).toBe(PRF_BYTES)
	expect(hex(a)).not.toBe(hex(b))
})
