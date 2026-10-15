import { createHash } from "node:crypto"
import { describe, expect, test } from "vitest"
import { NULO_KDF_DIGEST, NULO_KDF_SPEC, REGIMES, V6_REGIME } from "./address-freeze"
import { FROZEN_ACCOUNT_CLASS_ID, FROZEN_ARTIFACT_SHA256 } from "./frozen-artifact"
import { FROZEN_DESCRIPTOR_DIGEST, NULO_DESCRIPTOR_VERSION } from "./instantiation-descriptor"

/**
 * Paired anti-tamper test for the regime record. EVERY entry (not just the newest) is
 * independently hardcoded here as literals — moving any digest requires a coherent edit of the
 * source modules, the record, AND this file, in one reviewed, signed, branch-protected diff.
 * Editing or deleting a historical entry reds this test: never "fix" it by re-pinning an entry; a
 * rotation appends a new one, on the owner's recorded decision (CLAUDE.md "Account-address
 * freeze"). (The nulo-v5 baseline was redefined in place twice inside the pre-launch carve-out
 * window `address-freeze.ts` describes, owner-ratified both times; that window closed at V5's
 * first store build, and nulo-v6's closes at its own.)
 */
const EXPECTED_KDF_DIGEST = "29eca1a04b7acde8bb95905a2ac630b29f1edcf04d584274e90fd9f81736166d"

const EXPECTED_REGIMES: Record<string, Record<string, unknown>> = {
	"nulo-v5": {
		id: "nulo-v5",
		artifactSha256: "36562cde36667a43cc9c6d8cbfc18bcf0ac13cdc9f816720273350ee59a92a63",
		classId: "0x0db539838feacc4420c8e33b01ffe733a8bae58bba2c403653691b1ed8d3d0c5",
		descriptorVersion: 1,
		descriptorDigest: "3883065f0d6603d1be25db42348ec25b7a9dc29746d85b925b09efbd2a460605",
		kdf: "nulo-account-kdf-v2",
		kdfDigest: EXPECTED_KDF_DIGEST,
		ack:
			"I acknowledge that regime nulo-v5 (artifact sha256 " +
			"36562cde36667a43cc9c6d8cbfc18bcf0ac13cdc9f816720273350ee59a92a63, class id " +
			"0x0db539838feacc4420c8e33b01ffe733a8bae58bba2c403653691b1ed8d3d0c5, descriptor v1 " +
			"digest 3883065f0d6603d1be25db42348ec25b7a9dc29746d85b925b09efbd2a460605, kdf " +
			`nulo-account-kdf-v2 digest ${EXPECTED_KDF_DIGEST}) fixes every ` +
			"Nulo V5 account address; changing any of these inputs rotates all derived addresses " +
			"and ships ONLY as a new extension major with a new appended regime entry.",
	},
	"nulo-v6": {
		id: "nulo-v6",
		artifactSha256: "4b4933a146a80872b184f47af22cd8ba3faa00f810d7a26217490c9d13507f94",
		classId: "0x010cc0891c8748de2009734bf117485efbaf3aad0be125f151b4e6744f8f1842",
		descriptorVersion: 1,
		descriptorDigest: "3883065f0d6603d1be25db42348ec25b7a9dc29746d85b925b09efbd2a460605",
		kdf: "nulo-account-kdf-v2",
		kdfDigest: EXPECTED_KDF_DIGEST,
		ack:
			"I acknowledge that regime nulo-v6 (artifact sha256 " +
			"4b4933a146a80872b184f47af22cd8ba3faa00f810d7a26217490c9d13507f94, class id " +
			"0x010cc0891c8748de2009734bf117485efbaf3aad0be125f151b4e6744f8f1842, descriptor v1 " +
			"digest 3883065f0d6603d1be25db42348ec25b7a9dc29746d85b925b09efbd2a460605, kdf " +
			`nulo-account-kdf-v2 digest ${EXPECTED_KDF_DIGEST}) fixes every ` +
			"Nulo V6 account address; changing any of these inputs rotates all derived addresses " +
			"and ships ONLY as a new extension major with a new appended regime entry.",
	},
	"nulo-v6.1": {
		id: "nulo-v6.1",
		artifactSha256: "9aebda2a0b8cf96e833dba4379bef6a2ed0f93e975e9689afaa26ac71203cdc8",
		classId: "0x2a5784fa8315d0150f36a1fba87b41cdb9cd8ebea611ceaa80c7a787e83efa60",
		descriptorVersion: 1,
		descriptorDigest: "3883065f0d6603d1be25db42348ec25b7a9dc29746d85b925b09efbd2a460605",
		kdf: "nulo-account-kdf-v2",
		kdfDigest: EXPECTED_KDF_DIGEST,
		ack:
			"I acknowledge that regime nulo-v6.1 (artifact sha256 " +
			"9aebda2a0b8cf96e833dba4379bef6a2ed0f93e975e9689afaa26ac71203cdc8, class id " +
			"0x2a5784fa8315d0150f36a1fba87b41cdb9cd8ebea611ceaa80c7a787e83efa60, descriptor v1 " +
			"digest 3883065f0d6603d1be25db42348ec25b7a9dc29746d85b925b09efbd2a460605, kdf " +
			`nulo-account-kdf-v2 digest ${EXPECTED_KDF_DIGEST}) fixes every account address a ` +
			"Nulo V6 build bound to it derives. It supersedes nulo-v6 in place, a non-Mainnet rotation " +
			"on the owner's recorded decision; changing any of these inputs rotates all derived addresses " +
			"and ships only as a new appended regime entry.",
	},
}

describe("address-freeze regime record", () => {
	test("every regime entry matches its independently hardcoded expectation exactly", () => {
		expect(REGIMES).toEqual(EXPECTED_REGIMES)
	})

	test("kdfDigest is the sha256 of the canonical KDF spec (the mechanical KDF tripwire)", () => {
		expect(createHash("sha256").update(NULO_KDF_SPEC, "utf8").digest("hex")).toBe(EXPECTED_KDF_DIGEST)
		expect(NULO_KDF_DIGEST).toBe(EXPECTED_KDF_DIGEST)
	})

	test("the KDF spec pins the v2 constructions verbatim", () => {
		// Independent literals — a drive-by edit to the spec text cannot survive this file.
		expect(NULO_KDF_SPEC).toContain("PBKDF2-HMAC-SHA512")
		expect(NULO_KDF_SPEC).toContain("2048, 64B")
		expect(NULO_KDF_SPEC).toContain("Fr.fromBufferReduce")
		expect(NULO_KDF_SPEC).toContain("2720999938")
		expect(NULO_KDF_SPEC).toContain("914717451")
		expect(NULO_KDF_SPEC).toContain("deriveSecretKeyFromSigningKey")
	})

	test("the KDF spec pins the passkey branch verbatim (the branch it was previously blind to)", () => {
		// Byte-precise passkey clause: PRF ikm, label-salted SHA-256, HKDF-SHA256, the 64-byte
		// low-skew expand, and the reduce. Any drift in the passkey derivation must red this.
		expect(NULO_KDF_SPEC).toContain(
			"passkeyMaster = Fr.fromBufferReduce(HKDF-SHA256(ikm=prfBytes, salt=SHA-256(UTF8('nulo:kdf:v1')||credentialIdBytes), info=UTF8('nulo:master:v1'), 64B))",
		)
	})

	test("regime ids are unique and equal their record keys", () => {
		const ids = Object.values(REGIMES).map((r) => r.id)
		expect(new Set(ids).size).toBe(ids.length)
		for (const [key, regime] of Object.entries(REGIMES)) {
			expect(regime.id).toBe(key)
		}
	})

	test("each ack embeds its own entry's digests (unbound acks are red)", () => {
		for (const regime of Object.values(REGIMES)) {
			expect(regime.ack).toContain(regime.id)
			expect(regime.ack).toContain(regime.artifactSha256)
			expect(regime.ack).toContain(regime.classId)
			expect(regime.ack).toContain(regime.descriptorDigest)
			expect(regime.ack).toContain(`descriptor v${regime.descriptorVersion}`)
			expect(regime.ack).toContain(regime.kdfDigest)
		}
	})

	test("the nulo-v6.1 entry is consistent with the live freeze modules", () => {
		const bound = REGIMES["nulo-v6.1"]
		expect(bound.artifactSha256).toBe(FROZEN_ARTIFACT_SHA256)
		expect(bound.classId).toBe(FROZEN_ACCOUNT_CLASS_ID)
		expect(bound.descriptorVersion).toBe(NULO_DESCRIPTOR_VERSION)
		expect(bound.descriptorDigest).toBe(FROZEN_DESCRIPTOR_DIGEST)
	})

	test("this build binds to exactly the nulo-v6.1 regime", () => {
		expect(V6_REGIME).toBe(REGIMES["nulo-v6.1"])
	})

	test("the bound regime is the last entry, so no build binds an earlier one", () => {
		const ids = Object.keys(REGIMES)
		expect(ids).toEqual(["nulo-v5", "nulo-v6", "nulo-v6.1"])
		expect(V6_REGIME).toBe(REGIMES[ids[ids.length - 1] as keyof typeof REGIMES])
	})
})
