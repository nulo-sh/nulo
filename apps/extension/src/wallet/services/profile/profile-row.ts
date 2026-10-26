import { computeEnvelopeMacV3, type ImportedKeysDek, type MacEnvelopeV3, type MasterSecretBytes } from "@nulo/wallet-crypto"
import { z } from "zod"
import { mintPxeGeneration, type Profile } from "./spec"

type SealedSlots = { guard: string; secret: string; entropy: string }

const profileBase = { id: z.string(), name: z.string(), pxeGeneration: z.string(), dekSealed: z.string(), walletFingerprint: z.string() }
const sealedFields = { guard: z.string(), secret: z.string(), entropy: z.string(), envelopeMac: z.string() }
const PasswordRow = z.object({ ...profileBase, type: z.literal("password"), ...sealedFields })
const PasskeyRow = z.object({ ...profileBase, type: z.literal("passkey"), ...sealedFields, credentialId: z.string(), prfSalt: z.string() })
const absent = z.never().describe("absent: a key only a later row carries").optional()
// A passkey row written before 1.1, whose master came from the passkey alone and which holds no
// recovery phrase. It forbids every key only a later row carries, by presence: a later row that
// lost one is damaged, never this.
const RetiredPasskeyRow = z.object({
	...profileBase,
	type: z.literal("passkey"),
	credentialId: z.string(),
	guard: absent,
	secret: absent,
	entropy: absent,
	envelopeMac: absent,
	prfSalt: absent,
})
/** Every profile row a build writes or has written, as the stored-shape registry records it. A
 *  plain union: two of the variants share their `type`. */
export const ProfileRowSchema = z.union([PasswordRow, PasskeyRow, RetiredPasskeyRow])

// Only the fields that decide which unlock opens a row. The envelope MAC, the DEK slot and the
// fingerprint are checked at open, where a failure opens derived-only, so a row damaged in one of
// them must still classify.
const PasswordUnlock = PasswordRow.pick({ type: true, guard: true, secret: true, entropy: true })
const PasskeyUnlock = PasskeyRow.pick({ type: true, guard: true, secret: true, entropy: true, credentialId: true, prfSalt: true })
const RetiredShape = RetiredPasskeyRow.pick({
	type: true,
	credentialId: true,
	guard: true,
	secret: true,
	entropy: true,
	envelopeMac: true,
	prfSalt: true,
})

/** A stored row sorted by the unlock that may open it, with only the fields that sorting checked.
 *  `retired` is a passkey row from before 1.1, which no unlock opens; `unreadable` matches no
 *  unlock. Neither means hidden. */
export type ClassifiedProfileRow =
	| { kind: "password"; slots: SealedSlots }
	| { kind: "passkey"; credentialId: string; prfSalt: string; slots: SealedSlots }
	| { kind: "retired" }
	| { kind: "unreadable" }

/** Sorts a decoded row before any of its sealed fields is read; never throws. */
export function classifyProfileRow(raw: unknown): ClassifiedProfileRow {
	const password = PasswordUnlock.safeParse(raw)
	if (password.success) {
		const { guard, secret, entropy } = password.data
		return { kind: "password", slots: { guard, secret, entropy } }
	}
	const passkey = PasskeyUnlock.safeParse(raw)
	if (passkey.success) {
		const { guard, secret, entropy, credentialId, prfSalt } = passkey.data
		return { kind: "passkey", credentialId, prfSalt, slots: { guard, secret, entropy } }
	}
	if (RetiredShape.safeParse(raw).success) return { kind: "retired" }
	return { kind: "unreadable" }
}

/** What a row's envelope MAC binds: the row's storage key plus its sealed fields. */
export type EnvelopeFields = { id: string; slots: SealedSlots; dekSealed: string; walletFingerprint: string }

/** The envelope MAC v3 fields of a sealed profile record, in canonical order: the three sealed
 *  slots, the sealed DEK, then the plaintext fingerprint (binding it makes blinding the duplicate
 *  guard a detectable tamper). The id is not part of the envelope; `computeEnvelopeMacV3` binds it
 *  separately. */
export function macEnvelopeV3(slots: SealedSlots, dekSealed: string, walletFingerprint: string): MacEnvelopeV3 {
	return { guard: slots.guard, secret: slots.secret, entropy: slots.entropy, dek: dekSealed, walletFingerprint }
}

/** The v3 tag for a row. `id` must be the row's OWN storage key and final (after allocation or the
 *  restore id loop): it is bound first, which kills whole-envelope swaps between profiles that
 *  share an unlock, so a tag computed over a provisional id never verifies. */
export function envelopeMacFor(fields: EnvelopeFields, master: MasterSecretBytes, dek: ImportedKeysDek): Promise<string> {
	return computeEnvelopeMacV3(fields.id, master, dek, macEnvelopeV3(fields.slots, fields.dekSealed, fields.walletFingerprint))
}

/** A new password row with its envelope MAC. Always mints a fresh `pxeGeneration`, even for a
 *  same-id re-import, so the PXE fence tells this incarnation from a deleted one. The key order
 *  is persisted bytes. */
export async function newPasswordRow(
	fields: EnvelopeFields & { name: string },
	master: MasterSecretBytes,
	dek: ImportedKeysDek,
): Promise<Extract<Profile, { type: "password" }>> {
	const envelopeMac = await envelopeMacFor(fields, master, dek)
	return {
		id: fields.id,
		name: fields.name,
		type: "password",
		pxeGeneration: mintPxeGeneration(),
		dekSealed: fields.dekSealed,
		walletFingerprint: fields.walletFingerprint,
		guard: fields.slots.guard,
		secret: fields.slots.secret,
		entropy: fields.slots.entropy,
		envelopeMac,
	}
}

/** A new passkey row: a password row's fields, sealed under the passkey unlock key, plus the
 *  credential and the PRF input that rebuild it. Same fresh `pxeGeneration` and persisted
 *  key-order contract as {@link newPasswordRow}. */
export async function newPasskeyRow(
	fields: EnvelopeFields & { name: string; credentialId: string; prfSalt: string },
	master: MasterSecretBytes,
	dek: ImportedKeysDek,
): Promise<Extract<Profile, { type: "passkey" }>> {
	const envelopeMac = await envelopeMacFor(fields, master, dek)
	return {
		id: fields.id,
		name: fields.name,
		type: "passkey",
		pxeGeneration: mintPxeGeneration(),
		dekSealed: fields.dekSealed,
		walletFingerprint: fields.walletFingerprint,
		guard: fields.slots.guard,
		secret: fields.slots.secret,
		entropy: fields.slots.entropy,
		envelopeMac,
		credentialId: fields.credentialId,
		prfSalt: fields.prfSalt,
	}
}
