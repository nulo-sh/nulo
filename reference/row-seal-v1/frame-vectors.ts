/**
 * Reference vectors for the AES-256-GCM frame `version(1) ‖ iv(12) ‖ ct ‖ tag(16)` that the
 * wallet's boxes share (the independent source of key-vectors.test.ts's frame pins).
 *
 * Computed EXCLUSIVELY with node:crypto (HKDF, AES-GCM), a different implementation than the
 * wallet's WebCrypto, and never with the repo's own helpers, so a consistently mis-wired wallet
 * box cannot self-consistently pass. Run from the repo root: `bun reference/row-seal-v1/frame-vectors.ts`.
 * No dependency beyond node:crypto.
 *
 * Inputs mirror key-vectors.test.ts verbatim: IV = 12 × 0xAA (V2's), DEK = 32 × 0x5A (V11's).
 */
import { createCipheriv, hkdfSync } from "node:crypto"

const IV = Buffer.alloc(12, 0xaa)

function frame(key: Buffer, plaintext: Buffer, aad?: Buffer): string {
	const cipher = createCipheriv("aes-256-gcm", key, IV)
	if (aad) cipher.setAAD(aad)
	const ct = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()])
	return Buffer.concat([Buffer.from([1]), IV, ct]).toString("base64")
}

// imported-account-key-box v2: key = HKDF-SHA256(dek, salt = 32 zero bytes,
// info = "nulo:imported-account-key:v2|<chainId>|<address>"), no AAD.
const DEK = Buffer.alloc(32, 0x5a)
const CHAIN_ID = 11155111
const ADDRESS = `0x${"0b".repeat(32)}`
const SIGNING_KEY = Buffer.from(Array.from({ length: 32 }, (_, i) => i + 1))
const rowKey = Buffer.from(
	hkdfSync("sha256", DEK, Buffer.alloc(32), Buffer.from(`nulo:imported-account-key:v2|${CHAIN_ID}|${ADDRESS}`, "utf8"), 32),
)

// imported-keys-dek-box: the raw AES-GCM wrap key seals the DEK under AAD "nulo:profile-imported-dek:v1".
const WRAP_KEY = Buffer.alloc(32, 0x7e)
const DEK_AAD = Buffer.from("nulo:profile-imported-dek:v1", "utf8")

console.log(
	JSON.stringify(
		{
			ivHex: IV.toString("hex"),
			importedSigningKey: {
				dekHex: DEK.toString("hex"),
				chainId: CHAIN_ID,
				address: ADDRESS,
				signingKeyHex: SIGNING_KEY.toString("hex"),
				expectedFrameB64: frame(rowKey, SIGNING_KEY),
			},
			importedKeysDek: {
				wrapKeyHex: WRAP_KEY.toString("hex"),
				dekHex: DEK.toString("hex"),
				expectedFrameB64: frame(WRAP_KEY, DEK, DEK_AAD),
			},
		},
		null,
		2,
	),
)
