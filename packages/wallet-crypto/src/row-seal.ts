/**
 * Per-profile keys that seal a profile's stored rows at rest (NULO-ROW-SEAL v1).
 *
 * `HKDF-SHA256(master)` with the salt bound to `(profileId, pxeGeneration)`: the generation is
 * minted per profile incarnation, so rows a deleted incarnation left never open under a later
 * profile that reuses its id. Two keys come out, both non-extractable:
 *
 *  - an AES-256-GCM key that seals each row as an `aes-gcm-frame` whose AAD binds the row to its
 *    root, its storage key and its profile, so a row moved to another key, root or profile fails
 *    authentication;
 *  - an HMAC-SHA256 key that replaces a storage-key segment carrying an address or a hash with an
 *    opaque, per-profile value. Its input is the segment alone, so one address maps to one value
 *    across every root of a profile.
 *
 * Master only, not `master ‖ dek`: recovery mode holds the master without the DEK and must still
 * read accounts and what its repair backup carries. The price is that a same-phrase sibling
 * profile can derive these keys; it can already spend from every derived account.
 *
 * A password change touches neither input, so nothing re-seals. The labels are pinned by
 * key-vectors.test.ts V12 against a node:crypto reference: changing one hides every sealed row.
 */
import { toBase64 } from "@nulo/wallet-core/utils"
import { openFrame, sealFrame } from "./aes-gcm-frame"
import type { MasterSecretBytes } from "./secret-types"

/** Exported for the key-vector pin ONLY. */
export const ROW_SEAL_LABELS = {
	salt: "nulo:row-seal:v1",
	aead: "nulo:row-seal:aead:v1",
	index: "nulo:row-seal:index:v1",
	aad: "nulo:row:v1",
} as const

/** A profile incarnation's row keys. Both are non-extractable `CryptoKey`s. */
export interface RowKeys {
	readonly aead: CryptoKey
	readonly index: CryptoKey
}

/** Where a sealed row lives; all three are bound into its AAD. */
export interface RowBinding {
	readonly root: string
	readonly storageKey: string
	readonly profileId: string
}

const utf8 = (text: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(text) as Uint8Array<ArrayBuffer>

/** Canonical JSON of a string tuple: injective, unlike a separator join over free-form ids. */
const tuple = (...parts: string[]): Uint8Array<ArrayBuffer> => utf8(JSON.stringify(parts))

/** Derive the row keys of one profile incarnation. The master stays caller-owned. */
export async function deriveRowKeys(master: MasterSecretBytes, profileId: string, pxeGeneration: string): Promise<RowKeys> {
	if (master.length !== 32) throw new Error("row keys require a 32-byte master")
	const base = await globalThis.crypto.subtle.importKey("raw", master, "HKDF", false, ["deriveKey"])
	const salt = tuple(ROW_SEAL_LABELS.salt, profileId, pxeGeneration)
	const hkdf = (info: string): HkdfParams => ({ name: "HKDF", hash: "SHA-256", salt, info: utf8(info) })
	const [aead, index] = await Promise.all([
		globalThis.crypto.subtle.deriveKey(hkdf(ROW_SEAL_LABELS.aead), base, { name: "AES-GCM", length: 256 }, false, [
			"encrypt",
			"decrypt",
		]),
		globalThis.crypto.subtle.deriveKey(hkdf(ROW_SEAL_LABELS.index), base, { name: "HMAC", hash: "SHA-256", length: 256 }, false, [
			"sign",
		]),
	])
	return { aead, index }
}

const rowAad = (binding: RowBinding): Uint8Array<ArrayBuffer> =>
	tuple(ROW_SEAL_LABELS.aad, binding.root, binding.storageKey, binding.profileId)

/** Seal a row's serialized plaintext. Returns the base64 frame. */
export function sealRow(keys: RowKeys, plaintext: string, binding: RowBinding): Promise<string> {
	return sealFrame(keys.aead, utf8(plaintext), rowAad(binding))
}

/** Open a sealed row. Throws on a wrong key or binding, or on any corruption. */
export async function openRow(keys: RowKeys, frame: string, binding: RowBinding): Promise<string> {
	const bytes = await openFrame(keys.aead, frame, rowAad(binding))
	return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
}

/** The opaque per-profile replacement for a storage-key segment: unpadded base64url HMAC. */
export async function keyedSegment(keys: RowKeys, segment: string): Promise<string> {
	const mac = new Uint8Array(await globalThis.crypto.subtle.sign("HMAC", keys.index, utf8(segment)))
	return toBase64(mac).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}
