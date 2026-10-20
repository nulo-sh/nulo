/**
 * Reference vectors for the AES-256-GCM frame `version(1) ‖ iv(12) ‖ ct ‖ tag(16)` that the
 * wallet's boxes share (the independent source of key-vectors.test.ts's frame pins).
 *
 * Computed EXCLUSIVELY with node:crypto (HKDF, AES-GCM), a different implementation than the
 * wallet's WebCrypto, and never with the repo's own helpers, so a consistently mis-wired wallet
 * box cannot self-consistently pass. Run from the repo root: `bun reference/row-seal-v1/frame-vectors.ts`.
 * No dependency beyond node:crypto.
 *
 * Inputs mirror key-vectors.test.ts verbatim: IV = 12 × 0xAA (V2's), DEK = 32 × 0x5A and the
 * master 31 × 0x00 ‖ 0x42 (V11's).
 */
import { createCipheriv, createHmac, hkdfSync } from "node:crypto"

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

// row-seal v1: base = HKDF-SHA256(master, salt = JSON ["nulo:row-seal:v1", profileId, pxeGeneration]);
// aead = 32 bytes under info "nulo:row-seal:aead:v1"; index = a 32-byte HMAC-SHA256 key under
// info "nulo:row-seal:index:v1"; AAD = JSON ["nulo:row:v1", root, storageKey, profileId];
// keyed segment = unpadded base64url HMAC(index, segment).
const MASTER = Buffer.alloc(32)
MASTER[31] = 0x42
const PROFILE_ID = "profile-fixture-1"
const PXE_GENERATION = "generation-fixture-1"
const salt = Buffer.from(JSON.stringify(["nulo:row-seal:v1", PROFILE_ID, PXE_GENERATION]), "utf8")
const aeadKey = Buffer.from(hkdfSync("sha256", MASTER, salt, Buffer.from("nulo:row-seal:aead:v1", "utf8"), 32))
const indexKey = Buffer.from(hkdfSync("sha256", MASTER, salt, Buffer.from("nulo:row-seal:index:v1", "utf8"), 32))
const ROOT = "nulo:core:contacts"
const STORAGE_KEY = "nulo:core:contacts@contact-1"
const ROW = JSON.stringify({ id: "contact-1", profileId: PROFILE_ID, name: "Ada", address: ADDRESS })
const rowAad = Buffer.from(JSON.stringify(["nulo:row:v1", ROOT, STORAGE_KEY, PROFILE_ID]), "utf8")
const keyedSegment = createHmac("sha256", indexKey).update(ADDRESS, "utf8").digest("base64url")

console.log(
	JSON.stringify(
		{
			ivHex: IV.toString("hex"),
			rowSeal: {
				masterHex: MASTER.toString("hex"),
				profileId: PROFILE_ID,
				pxeGeneration: PXE_GENERATION,
				root: ROOT,
				storageKey: STORAGE_KEY,
				row: ROW,
				expectedFrameB64: frame(aeadKey, Buffer.from(ROW, "utf8"), rowAad),
				segment: ADDRESS,
				expectedKeyedSegment: keyedSegment,
			},
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
