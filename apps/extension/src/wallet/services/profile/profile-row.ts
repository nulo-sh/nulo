import { computeEnvelopeMacV3, type ImportedKeysDek, type MacEnvelopeV3, type MasterSecretBytes } from "@nulo/wallet-crypto"
import { z } from "zod"
import { mintPxeGeneration, type Profile } from "./spec"

type SealedSlots = { guard: string; secret: string; entropy: string }

const profileBase = { id: z.string(), name: z.string(), pxeGeneration: z.string(), dekSealed: z.string(), walletFingerprint: z.string() }
const PasswordRow = z.object({
	...profileBase,
	type: z.literal("password"),
	guard: z.string(),
	secret: z.string(),
	entropy: z.string(),
	envelopeMac: z.string(),
})
const PasskeyRow = z.object({ ...profileBase, type: z.literal("passkey"), credentialId: z.string() })
/** Every profile row a build writes, as the stored-shape registry records it. */
export const ProfileRowSchema = z.discriminatedUnion("type", [PasswordRow, PasskeyRow])

// Only the fields that decide which unlock opens a row. The envelope MAC, the DEK slot and the
// fingerprint are checked at open, where a failure opens derived-only, so a row damaged in one of
// them must still classify.
const PasswordUnlock = PasswordRow.pick({ type: true, guard: true, secret: true, entropy: true })
const PasskeyUnlock = PasskeyRow.pick({ type: true, credentialId: true })

/** A stored row sorted by the unlock that may open it, with only the fields that sorting checked.
 *  `unreadable` matches no unlock; it does not mean hidden. */
export type ClassifiedProfileRow =
	| { kind: "password"; slots: SealedSlots }
	| { kind: "passkey"; credentialId: string }
	| { kind: "unreadable" }

/** Sorts a decoded row before any of its sealed fields is read; never throws. */
export function classifyProfileRow(raw: unknown): ClassifiedProfileRow {
	const password = PasswordUnlock.safeParse(raw)
	if (password.success) {
		const { type: _type, ...slots } = password.data
		return { kind: "password", slots }
	}
	const passkey = PasskeyUnlock.safeParse(raw)
	if (passkey.success) return { kind: "passkey", credentialId: passkey.data.credentialId }
	return { kind: "unreadable" }
}

/** What a password row's envelope MAC binds: the row's storage key plus its sealed fields. */
export type EnvelopeFields = { id: string; slots: SealedSlots; dekSealed: string; walletFingerprint: string }

/** The envelope MAC v3 fields of a sealed profile record, in canonical order: the three
 *  password-sealed slots, the sealed DEK, then the plaintext fingerprint (binding it makes
 *  blinding the duplicate guard a detectable tamper). The id is not part of the envelope;
 *  `computeEnvelopeMacV3` binds it separately. */
export function macEnvelopeV3(slots: SealedSlots, dekSealed: string, walletFingerprint: string): MacEnvelopeV3 {
	return { guard: slots.guard, secret: slots.secret, entropy: slots.entropy, dek: dekSealed, walletFingerprint }
}

/** The v3 tag for a password row. `id` must be the row's OWN storage key and final (after
 *  allocation or the restore id loop): it is bound first, which kills whole-envelope swaps
 *  between same-password profiles, so a tag computed over a provisional id never verifies. */
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

/** A new passkey row (no envelope MAC: nothing on it is password-sealed). Same fresh
 *  `pxeGeneration` and persisted key-order contract as {@link newPasswordRow}. */
export function newPasskeyRow(fields: {
	id: string
	name: string
	dekSealed: string
	walletFingerprint: string
	credentialId: string
}): Extract<Profile, { type: "passkey" }> {
	return {
		id: fields.id,
		name: fields.name,
		type: "passkey",
		pxeGeneration: mintPxeGeneration(),
		dekSealed: fields.dekSealed,
		walletFingerprint: fields.walletFingerprint,
		credentialId: fields.credentialId,
	}
}
