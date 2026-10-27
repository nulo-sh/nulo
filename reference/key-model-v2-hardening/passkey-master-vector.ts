/**
 * RETIRED. The passkey derivation of profiles made before 1.1, recorded with its reference values:
 * those profiles' master came from their passkey alone, and this build neither derives it nor
 * opens them. Kept as the record behind `NULO_KDF_SPEC`'s `passkeyMaster` line, which stays in the
 * spec byte for byte. The values were the wallet's pins V3 (master), V3b (backup check) and V8 (PRF
 * input label) until 1.1.
 *
 * Computed EXCLUSIVELY from node:crypto's HKDF and HMAC plus the published 5.0.1 `Fr` — never from
 * the repo's own wallet-crypto code, and via a DIFFERENT HKDF implementation than the wallet's
 * WebCrypto.
 *
 * Chain (NULO-ACCOUNT-KDF v2, passkey branch — 512-bit low-skew form):
 *   prfInput = SHA-256( UTF8("nulo:profile:v1") )             (the fixed PRF eval input, V8)
 *   ikm    = base64decode(prf)                                (WebAuthn PRF eval output)
 *   salt   = SHA-256( UTF8("nulo:kdf:v1") || credentialIdBytes )
 *   okm64  = HKDF-SHA256(ikm, salt, info = UTF8("nulo:master:v1"), 64 bytes)
 *   master = Fr.fromBufferReduce(okm64)                        (big-endian, mod BN254 Fr, V3)
 *   macKey = HKDF-SHA256(ikm, salt, info = UTF8("nulo:backup-mac:v1"), 64 bytes)
 *   mac    = HMAC-SHA256(macKey, UTF8(hex(SHA-256("hunter2"))))  (a backup's check, V3b)
 *
 * Inputs: PRF = bytes 0x00..0x1f; credentialId = "test-credential-id".
 */
import { createHash, createHmac, hkdfSync } from "node:crypto"
import { Fr } from "@aztec/foundation/curves/bn254"

const V3_PRF_B64 = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
const V3_CREDENTIAL_ID_B64 = "dGVzdC1jcmVkZW50aWFsLWlk"

const ikm = Buffer.from(V3_PRF_B64, "base64")
const credentialId = Buffer.from(V3_CREDENTIAL_ID_B64, "base64")
const salt = createHash("sha256")
	.update(Buffer.concat([Buffer.from("nulo:kdf:v1", "utf8"), credentialId]))
	.digest()
const okm64 = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("nulo:master:v1", "utf8"), 64))
const master = Fr.fromBufferReduce(okm64)
const macKey = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("nulo:backup-mac:v1", "utf8"), 64))
const checksum = createHash("sha256").update("hunter2").digest("hex")
const backupMac = createHmac("sha256", macKey).update(checksum).digest("base64")
const prfInput = createHash("sha256").update("nulo:profile:v1").digest("hex")

console.log(
	JSON.stringify(
		{
			prfB64: V3_PRF_B64,
			credentialIdB64: V3_CREDENTIAL_ID_B64,
			hkdfOutputBytes: 64,
			expectedMasterHex: master.toBuffer().toString("hex"),
			prfInputLabel: "nulo:profile:v1",
			prfInputHex: prfInput,
			backupMacChecksumInput: "hunter2",
			expectedBackupMacB64: backupMac,
		},
		null,
		2,
	),
)
