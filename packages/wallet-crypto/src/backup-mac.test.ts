import { createHash, createHmac, hkdfSync } from "node:crypto"
import { describe, expect, test } from "vitest"
import { computeBackupMac, verifyBackupMac } from "./backup-mac"
import { PasskeyCredential } from "./passkey-credential"

const PRF = "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
const CREDENTIAL_ID = "dGVzdC1jcmVkZW50aWFsLWlk"
const CHECKSUM = createHash("sha256").update("hunter2").digest("hex")

/** node:crypto's HKDF and HMAC, a different implementation than the wallet's WebCrypto. WebCrypto
 *  sizes an HMAC key it derives at the hash's block size, 64 bytes for SHA-256. */
function referenceMac(prf: string, credentialId: string, checksum: string): string {
	const salt = createHash("sha256")
		.update(Buffer.concat([Buffer.from("nulo:kdf:v1"), Buffer.from(credentialId, "base64")]))
		.digest()
	const key = Buffer.from(hkdfSync("sha256", Buffer.from(prf, "base64"), salt, "nulo:backup-mac:v1", 64))
	return createHmac("sha256", key).update(checksum).digest("base64")
}

const credential = (prf = PRF, id = CREDENTIAL_ID) => PasskeyCredential.create({ id, prf })

describe("passkey backup MAC", () => {
	test("matches the reference vector", async () => {
		const mac = await computeBackupMac(await credential(), CHECKSUM)
		expect(mac).toBe("Euf6WPQjR3N5bM4XkXoIxwiJs8I2NJXloIwkJEbWJ2w=")
		expect(referenceMac(PRF, CREDENTIAL_ID, CHECKSUM)).toBe(mac)
	})

	test("verifies only the checksum and the credential it was made for", async () => {
		const mac = await computeBackupMac(await credential(), CHECKSUM)
		expect(await verifyBackupMac(await credential(), CHECKSUM, mac)).toBe(true)
		expect(await verifyBackupMac(await credential(), CHECKSUM.replace(/^./, "0"), mac)).toBe(false)
		const otherPrf = Buffer.from(new Uint8Array(32).fill(9)).toString("base64")
		expect(await verifyBackupMac(await credential(otherPrf), CHECKSUM, mac)).toBe(false)
		expect(await verifyBackupMac(await credential(PRF, "b3RoZXItY3JlZGVudGlhbA=="), CHECKSUM, mac)).toBe(false)
	})

	test("a malformed or truncated MAC is false, never a throw", async () => {
		const mac = await computeBackupMac(await credential(), CHECKSUM)
		expect(await verifyBackupMac(await credential(), CHECKSUM, "not base64!")).toBe(false)
		expect(await verifyBackupMac(await credential(), CHECKSUM, mac.slice(0, 20))).toBe(false)
		expect(await verifyBackupMac(await credential(), CHECKSUM, "")).toBe(false)
	})
})
