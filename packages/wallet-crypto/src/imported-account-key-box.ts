/**
 * Encrypts an IMPORTED account's Schnorr signing key at rest, bound to its row identity.
 *
 * The key is sealed under `HKDF(dek, info = "nulo:imported-account-key:v2" || chainId ||
 * address)`. The root is the profile's CREDENTIAL-sealed imported-keys DEK, never the master: two
 * profiles created from the same recovery phrase share the master, so a master-rooted key is
 * readable by the sibling profile BY CONSTRUCTION — the DEK is the isolation boundary. (Isolation
 * between same-phrase profiles therefore requires distinct CREDENTIALS; reusing one password
 * across them collapses the boundary, and is the confused-deputy case the plan records as an
 * accepted residual — that attacker can unlock the sibling profile outright anyway.)
 *
 * The per-row `info` means a ciphertext transplanted to a DIFFERENT account row (or sealed under a
 * different profile's DEK) fails to decrypt, not just fails a later address check. It deliberately
 * excludes `profileId` — full-backup restore remaps profile ids, which would otherwise strand the
 * key; a restored backup's rows are instead rewrapped from the source DEK onto the destination
 * profile's freshly minted one (clone divergence).
 *
 * Uses `globalThis.crypto` for the same cross-env reason as `mnemonic-master.ts`.
 */
import { openFrame, sealFrame } from "./aes-gcm-frame"
import type { ImportedKeysDek } from "./secret-types"

const INFO_PREFIX_V2 = "nulo:imported-account-key:v2"

async function rowKey(dek: ImportedKeysDek, chainId: number, address: string): Promise<CryptoKey> {
	const ikm = await globalThis.crypto.subtle.importKey("raw", dek, "HKDF", false, ["deriveKey"])
	const info = new TextEncoder().encode(`${INFO_PREFIX_V2}|${chainId}|${address}`)
	return globalThis.crypto.subtle.deriveKey(
		{ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info },
		ikm,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	)
}

/** Seal a 32-byte signing key for `(profile DEK, chainId, address)`. Returns the base64
 *  `aes-gcm-frame` (no AAD; the row identity is in the HKDF info). Caller owns + zeroes
 *  `signingKey`. */
export async function sealImportedSigningKeyV2(
	dek: ImportedKeysDek,
	chainId: number,
	address: string,
	signingKey: Uint8Array<ArrayBuffer>,
): Promise<string> {
	return sealFrame(await rowKey(dek, chainId, address), signingKey)
}

/** Unseal a signing key. Throws on wrong DEK / transplanted ciphertext / corruption (AES-GCM
 *  authentication). Caller owns + zeroes the returned buffer. */
export async function unsealImportedSigningKeyV2(
	dek: ImportedKeysDek,
	chainId: number,
	address: string,
	sealed: string,
): Promise<Uint8Array<ArrayBuffer>> {
	return openFrame(await rowKey(dek, chainId, address), sealed)
}
