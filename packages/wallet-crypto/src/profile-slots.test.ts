import { describe, expect, test } from "vitest"
import { sealFrame } from "./aes-gcm-frame"
import { openPasskeySlots, sealPasskeySlots } from "./passkey-secret-box"
import { derivePasskeyUnlockKey } from "./passkey-unlock-key"
import { ENCRYPTION_GUARD, type EncryptedProfileSecret, openProfileSlots, PROFILE_AAD, type SlotCipher } from "./profile-slots"
import { asBase64Ciphertext, asMasterSecretBytes } from "./secret-types"

const random = (length: number) => globalThis.crypto.getRandomValues(new Uint8Array(length)) as Uint8Array<ArrayBuffer>
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex")
const SLOTS = ["guard", "secret", "entropy"] as const

async function sealed() {
	const key = await derivePasskeyUnlockKey(random(32), random(32))
	const secret = random(32)
	const entropy = random(32)
	const slots = await sealPasskeySlots(key, asMasterSecretBytes(new Uint8Array(secret)), new Uint8Array(entropy))
	return { key, slots, opens: `${hex(secret)}:${hex(entropy)}` }
}

async function opensTo(key: CryptoKey, slots: EncryptedProfileSecret): Promise<string | null> {
	const opened = await openPasskeySlots(key, slots)
	return opened && `${hex(opened.secret)}:${hex(opened.entropy)}`
}

describe("profile slots", () => {
	// Every stored row's slots authenticate under these bytes.
	test("the purpose AADs are byte-frozen", () => {
		expect(Object.fromEntries(Object.entries(PROFILE_AAD).map(([slot, aad]) => [slot, new TextDecoder().decode(aad)]))).toStrictEqual({
			guard: "nulo:profile-guard:v2",
			secret: "nulo:profile-master:v2",
			entropy: "nulo:profile-entropy:v1",
		})
	})

	test("a slot moved into any other slot of its own row opens to null", async () => {
		for (let i = 0; i < 16; i++) {
			const p = await sealed()
			expect(await opensTo(p.key, p.slots)).toBe(p.opens)
			for (const from of SLOTS) {
				for (const to of SLOTS.filter((slot) => slot !== from)) {
					expect(await opensTo(p.key, { ...p.slots, [to]: p.slots[from] }), `${from} into ${to}`).toBeNull()
				}
			}
		}
	})

	// The guard authenticates under the row's own key and the guard AAD, so only the byte
	// comparison refuses it.
	test("a guard that authenticates but does not hold the guard constant opens to null", async () => {
		const p = await sealed()
		const guardOf = async (plaintext: Uint8Array<ArrayBuffer>) =>
			asBase64Ciphertext(await sealFrame(p.key, plaintext, PROFILE_AAD.guard))
		expect(await opensTo(p.key, { ...p.slots, guard: await guardOf(new Uint8Array(ENCRYPTION_GUARD)) })).toBe(p.opens)
		const near = [
			ENCRYPTION_GUARD.slice(0, 7),
			new Uint8Array([...ENCRYPTION_GUARD, 0]),
			ENCRYPTION_GUARD.map((b, i) => (i === 7 ? b ^ 1 : b)),
		]
		const generated = Array.from({ length: 24 }, (_, i) => random(i % 2 ? 8 : (i * 3) % 41))
		for (const plaintext of [new Uint8Array(0), ...near, ...generated] as Uint8Array<ArrayBuffer>[]) {
			expect(await opensTo(p.key, { ...p.slots, guard: await guardOf(plaintext) }), hex(plaintext)).toBeNull()
		}
	})

	test("what it opened is wiped when a later slot fails, and the guard always", async () => {
		const slots = { guard: "guard", secret: "secret", entropy: "entropy" } as unknown as EncryptedProfileSecret
		const plaintext = { guard: ENCRYPTION_GUARD, secret: random(32), entropy: random(32) }
		for (const failing of [undefined, "entropy"] as const) {
			const opened: Uint8Array[] = []
			const cipher: SlotCipher = {
				seal: () => Promise.reject(new Error("unused")),
				open: async (slot) => {
					if (slot === failing) throw new Error("tag mismatch")
					const bytes = new Uint8Array(plaintext[slot as keyof typeof plaintext]) as Uint8Array<ArrayBuffer>
					opened.push(bytes)
					return bytes
				},
			}
			const result = await openProfileSlots(cipher, slots)
			const zero = opened.map((bytes) => bytes.every((b) => b === 0))
			// Handed back, the master and entropy are the caller's to wipe.
			expect(zero, String(failing)).toStrictEqual(failing ? [true, true] : [true, false, false])
			expect(result === null, String(failing)).toBe(failing !== undefined)
		}
	})
})
