import { importSeed, type PinnedKey, publicKeyOf } from "./envelope"

/** A fresh Ed25519 key per call: no private key is ever committed. */
export async function freshKey(keyId = "test-1"): Promise<{ seedHex: string; pinned: PinnedKey; privateKey: CryptoKey }> {
	const seedHex = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("")
	const privateKey = await importSeed(seedHex)
	return { seedHex, privateKey, pinned: { keyId, publicKey: await publicKeyOf(privateKey) } }
}
