import { describe, expect, test } from "vitest"
import { openPasskeySlots, sealPasskeySlots } from "./passkey-secret-box"
import { derivePasskeyUnlockKey } from "./passkey-unlock-key"
import { PasswordSecretBox } from "./password-secret-box"
import type { EncryptedProfileSecret } from "./profile-slots"
import { asMasterSecretBytes } from "./secret-types"

const random = (length: number) => globalThis.crypto.getRandomValues(new Uint8Array(length)) as Uint8Array<ArrayBuffer>
const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex")

/** One profile on a passkey: its PRF output for its own salt, and the slots sealed under them. */
async function sealedProfile() {
	const prf = random(32)
	const salt = random(32)
	const secret = random(32)
	const entropy = random(32)
	const key = await derivePasskeyUnlockKey(prf, salt)
	const slots = await sealPasskeySlots(key, asMasterSecretBytes(new Uint8Array(secret)), new Uint8Array(entropy))
	return { prf, salt, secret, entropy, key, slots, input: `prf=${hex(prf)} salt=${hex(salt)}` }
}

async function opensTo(key: CryptoKey, slots: EncryptedProfileSecret): Promise<string | null> {
	const opened = await openPasskeySlots(key, slots)
	return opened && `${hex(opened.secret)}:${hex(opened.entropy)}`
}

describe("passkey slots", () => {
	test("open to the sealed master and entropy under the profile's own unlock key", async () => {
		const p = await sealedProfile()
		expect(await opensTo(await derivePasskeyUnlockKey(p.prf, p.salt), p.slots)).toBe(`${hex(p.secret)}:${hex(p.entropy)}`)
	})

	// Over fresh random keys, salts and slots: every single swapped field opens to null, beside a
	// success control on the untouched row.
	test("open to null when any one field is another profile's or another slot's", async () => {
		for (let i = 0; i < 24; i++) {
			const a = await sealedProfile()
			const b = await sealedProfile()
			const input = `a: ${a.input} b: ${b.input}`
			expect(await opensTo(a.key, a.slots), input).toBe(`${hex(a.secret)}:${hex(a.entropy)}`)

			// The same passkey for another profile evaluates that profile's salt: another key.
			expect(await opensTo(await derivePasskeyUnlockKey(a.prf, b.salt), a.slots), input).toBeNull()
			// Another passkey's output for this profile's salt.
			expect(await opensTo(await derivePasskeyUnlockKey(b.prf, a.salt), a.slots), input).toBeNull()
			for (const slot of ["guard", "secret", "entropy"] as const) {
				expect(await opensTo(a.key, { ...a.slots, [slot]: b.slots[slot] }), `${input} slot=${slot}`).toBeNull()
			}
			expect(await opensTo(a.key, { ...a.slots, secret: a.slots.entropy }), input).toBeNull()
			expect(await opensTo(a.key, { ...a.slots, entropy: a.slots.secret }), input).toBeNull()
			expect(await opensTo(a.key, { ...a.slots, guard: a.slots.secret }), input).toBeNull()
		}
	})

	test("a password row's frames and a passkey row's never open as each other", async () => {
		const p = await sealedProfile()
		const password = new PasswordSecretBox()
		const { encrypted } = await password.seal("hunter22", asMasterSecretBytes(new Uint8Array(p.secret)), new Uint8Array(p.entropy))
		expect(await openPasskeySlots(p.key, encrypted)).toBeNull()
		expect(await password.unseal("hunter22", p.slots)).toBeNull()
		// Success controls: each opens under its own unlock.
		expect(await password.unseal("hunter22", encrypted)).not.toBeNull()
		expect(await openPasskeySlots(p.key, p.slots)).not.toBeNull()
	}, 30_000)
})
