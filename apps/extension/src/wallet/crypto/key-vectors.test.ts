/**
 * Cryptographic derivation test vectors.
 *
 * Purpose
 * -------
 * Lock the cryptographic derivation invariants used to
 *   (a) encrypt the profile master secret at rest (`EncryptionKey`),
 *   (b) derive the per-account signing key from the account seed
 *       (`deriveSigningKeyFromSeed` — NULO-ACCOUNT-KDF v2 in
 *       `@nulo/wallet-crypto`, the signing-key-root model adopted at
 *       Aztec 5.0.0; upstream's removed `deriveSigningKey` construction
 *       under the dedicated Nulo separator, reference-vectored in
 *       `reference/key-model-v2/`).
 *
 * Any accidental drift in a refactor here, or a silent upstream change
 * in `@aztec-labs/foundation` or `@aztec-labs/stdlib`, fails one of these tests
 * before it bricks every existing wallet on disk.
 *
 * On upgrading the Aztec line — the ritual
 * ------------------------------------
 * Some vectors are Aztec-stack sensitive: V7a (`deriveSigningKeyFromSeed` = sha512-to-grumpkin-scalar + the
 * NULO_SIGNING_ROOT_SEP domain separator). When you bump `@aztec-labs/foundation`,
 * `@aztec-labs/stdlib`, or `@aztec-labs/accounts`:
 *
 *   1. Run `bun run test`.
 *   2. If any vector in this file fails, **do not blindly regenerate**.
 *   3. Classify each failure:
 *        (a) Neutral wrap / rename — upstream just moved the code.
 *            Confirm the underlying math is equivalent (independent
 *            recomputation or published reference). Then regenerate
 *            the fixture constant in this file and commit with
 *            "chore(crypto): regenerate fixtures for @aztec X.Y.Z —
 *            verified equivalent".
 *        (b) Backward-compatible primitive optimization — output bytes
 *            are identical. Test shouldn't fail; if it did, investigate
 *            why (endianness, serialization-order change).
 *        (c) Breaking derivation change — output bytes differ for the
 *            same inputs. **Stop and think.** This means existing
 *            wallets will derive different keys and brick. Pin the old
 *            version until a migration exists, or write the migration.
 *            V7a is the canary for this class — if it fails, the
 *            signing key of every wallet on disk just changed.
 *   4. Document the decision in the commit message.
 *
 * Aztec-independent vectors (V1, V2, V6, V9, P1) survive any
 * Aztec bump — they exercise Web Crypto or constants only.
 *
 * Break-it-to-prove-it
 * --------------------
 * Each vector was validated by temporarily breaking the constant it
 * pins and confirming the test fails. See the per-vector header
 * comment for what's locked.
 *
 * Deferred vectors
 * ----------------
 * V4 (poseidon2Hash account secret) and P2 (Barretenberg Poseidon2 cross-check) require `@aztec-foundation/bb.js`
 * WASM poseidon2, which crashes in the vitest jsdom environment with
 * `BBApiException: std::bad_cast` on the WASM boundary. The downstream
 * chain V7a feeds (signingKey → privacy secret → NuloAccount address —
 * the old deferred V7b) IS now pinned end-to-end in a node environment:
 * `packages/aztec-runtime/src/account/derivation-vectors.test.ts`
 * against the committed regime-B reference vectors. The unit-level
 * locks V1–V9 still catch the bulk of regressions a refactor in this
 * area could introduce.
 */

import { describe, expect, test } from "vitest"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { deriveSigningKeyFromSeed } from "@nulo/wallet-crypto"
import { EncryptionKey } from "@nulo/wallet-crypto"
import {
	PXE_STORE_KDF_LABEL,
	asImportedKeysDek,
	asMasterSecretBytes,
	ROW_SEAL_LABELS,
	derivePxeStoreKey,
	deriveRowKeys,
	keyedSegment,
	openRow,
	sealRow,
	sealDekUnderWrapKey,
	sealImportedSigningKeyV2,
	unsealDekUnderWrapKey,
	unsealImportedSigningKeyV2,
} from "@nulo/wallet-crypto"
import { AccountType } from "@/wallet/services/account/spec"

/** Reusable hex helper — keeps fixture constants readable. */
const toHex = (buf: ArrayBuffer | Uint8Array) => {
	const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
	return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")
}
const fromHex = (hex: string) => new Uint8Array(hex.match(/.{2}/g)!.map((b) => Number.parseInt(b, 16)))

/** Runs `fn` with `getRandomValues` answering `bytes`, so an AES-GCM box draws a fixed IV. */
async function withFixedRandom<T>(bytes: Uint8Array, fn: () => Promise<T>): Promise<T> {
	const original = self.crypto.getRandomValues.bind(self.crypto)
	self.crypto.getRandomValues = (<A extends ArrayBufferView | null>(target: A) => {
		if (target instanceof Uint8Array) target.set(bytes.slice(0, target.length))
		return target
	}) as typeof self.crypto.getRandomValues
	try {
		return await fn()
	} finally {
		self.crypto.getRandomValues = original
	}
}

describe("cryptographic derivation vectors", () => {
	// ── V1: password hash ────────────────────────────────────────────
	//
	// Locks: SHA-256(UTF-8(password)). Platform Web Crypto, no Aztec dep.
	// Break it: change `getPasshash` from SHA-256 to SHA-384, this fails.
	test("V1 — getPasshash('hunter2') matches fixture", async () => {
		const passhash = await EncryptionKey.getPasshash("hunter2")
		expect(toHex(passhash)).toBe("f52fbd32b2b3b86ff88ef6c490628285f482af15ddcb29541f94bcf526a3f6c7")
	})

	// ── V2: AES-GCM round-trip with fixed IV ─────────────────────────
	//
	// Locks: PBKDF2-SHA256 at 600_000 iterations, salt = SHA-256(iv),
	// AES-GCM-256, 13-byte prefix [version][iv].
	// The committed ciphertext was captured by running the current
	// encrypt() with the same password, plaintext, and IV. Two
	// assertions hold it in place:
	//   (a) decrypt(COMMITTED_CIPHERTEXT) === PLAINTEXT (verifies the
	//       full decrypt chain against a real stored value), and
	//   (b) encrypt(PLAINTEXT, mocked IV) === COMMITTED_CIPHERTEXT
	//       (verifies encrypt's prefix assembly + AES tag emission).
	// Break it: change PBKDF2_ITERATIONS — both assertions fail.
	const V2_PASSWORD = "hunter2"
	const V2_PLAINTEXT_HEX = "deadbeefcafebabe0011223344556677"
	const V2_IV_HEX = "aaaaaaaaaaaaaaaaaaaaaaaa" // 12 bytes of 0xAA
	const V2_CIPHERTEXT_HEX = "00aaaaaaaaaaaaaaaaaaaaaaaabbf9b797c51cbfaff2e2be5c04eee5303a5eac28711a196e271c960d5ab16a49"

	test("V2a — decrypt(COMMITTED_CIPHERTEXT, password) === PLAINTEXT", async () => {
		const key = await EncryptionKey.fromPassword(V2_PASSWORD)
		const plaintext = await key.decrypt(fromHex(V2_CIPHERTEXT_HEX))
		expect(toHex(plaintext)).toBe(V2_PLAINTEXT_HEX)
	}, 10_000)

	test("V2b — encrypt(PLAINTEXT, mocked IV) === COMMITTED_CIPHERTEXT", async () => {
		const ct = await withFixedRandom(fromHex(V2_IV_HEX), async () => {
			const key = await EncryptionKey.fromPassword(V2_PASSWORD)
			return key.encrypt(fromHex(V2_PLAINTEXT_HEX))
		})
		expect(toHex(ct)).toBe(V2_CIPHERTEXT_HEX)
	}, 10_000)

	// V3, V3b and V8 pinned the passkey derivation of profiles made before 1.1. They are recorded,
	// retired, with their generator in reference/key-model-v2-hardening/.

	// ── V6: getHashHex (backup checksum) ─────────────────────────────
	//
	// Used by pages/import.vue + export/full.vue to verify backup integrity.
	// If byte→hex encoding drifts (case change, TextEncoder swap,
	// SHA-256 substitution), backup import silently fails.
	// Platform Web Crypto, no Aztec dep.
	test("V6 — getHashHex('hunter2') matches fixture", async () => {
		const hex = await EncryptionKey.getHashHex("hunter2")
		expect(hex).toBe("f52fbd32b2b3b86ff88ef6c490628285f482af15ddcb29541f94bcf526a3f6c7")
	})

	// ── V7a: deriveSigningKeyFromSeed(seed) — NULO-ACCOUNT-KDF v2 ────
	//
	// The signing key is the account's OWNERSHIP ROOT under the 5.0.0
	// signing-key-root model (the privacy secret derives one-way from
	// it). The construction is upstream's removed `deriveSigningKey`
	// under the dedicated Nulo separator —
	// `sha512ToGrumpkinScalar([seed, NULO_SIGNING_ROOT_SEP])` — and is
	// REFERENCE-VECTORED in `reference/key-model-v2/`
	// (published-5.0.1-tarball provenance; the v1 predecessor vectors
	// stay in `reference/aztec-5.0.0-stable/`). If this
	// fails, the signing key of every wallet on disk just changed:
	// stop, never re-pin from this implementation. AZTEC-SENSITIVE.
	test("V7a — deriveSigningKeyFromSeed(fixedSeed) matches fixture", () => {
		const seed = Fr.fromHexString("0x0000000000000000000000000000000000000000000000000000000000000042")
		const signingKey = deriveSigningKeyFromSeed(seed)
		expect(signingKey.toString()).toBe("0x2aabed87d5340c673eae6dc5faaa57382b8d773fa38247a80bdafbd5277729e3")
	})

	// ── V9: AccountType.Nulo_v1 numeric value ────────────────────────
	//
	// The enum value feeds into poseidon2Hash([master, chainId, type,
	// index]) as the 3rd arg. Flipping Nulo_v1 from 0 to 1 changes
	// every derived account secret. The spec.ts file has a
	// "NEVER change it" SECURITY comment but a paranoid unit lock
	// catches a drive-by refactor before it breaks wallets.
	test("V9 — AccountType.Nulo_v1 === 0", () => {
		expect(AccountType.Nulo_v1).toBe(0)
	})

	// ── V11: derivePxeStoreKey(master, dek, profileId) — NULO-PXE-STORE-KDF v2 ──
	//
	// The per-profile ChaCha20 key for the encrypted SQLite-OPFS PXE stores
	// (HKDF-SHA256 over master ‖ dek, label "nulo:pxe-store:v2", salt bound to
	// the profileId). A Nulo-novel construction, so this is a DRIFT PIN (like
	// a constant pin): it locks what we ship — changing the label, the IKM shape, the salt
	// shape, or the HKDF params orphans every encrypted PXE store on disk
	// (state resets, not data loss: the PXE re-syncs — but never change it
	// casually). v2 mixed the DEK in so a same-phrase sibling (same master)
	// cannot derive a victim profile's store key.
	test("V11 — derivePxeStoreKey(fixedMaster, fixedDek, fixture profileId) matches fixture + is bound to both secrets", async () => {
		expect(PXE_STORE_KDF_LABEL).toBe("nulo:pxe-store:v2")
		const master = asMasterSecretBytes(new Uint8Array(32) as Uint8Array<ArrayBuffer>)
		master[31] = 0x42
		const dek = asImportedKeysDek(new Uint8Array(32).fill(0x5a) as Uint8Array<ArrayBuffer>)
		const key = await derivePxeStoreKey(master, dek, "profile-fixture-1")
		expect(key).toHaveLength(32)
		expect(toHex(key)).toBe("d8061cc5a312e5c1a623385dab782405f2e1f1edaeef884cbd380944edca9ff7")
		// The retired master-only v1 value for the same master + profile must not come back.
		expect(toHex(key)).not.toBe("7bc1e3d33de01d8650471666c8daa55436a18c77644bfcfd683aba02465018d4")
		expect(toHex(key)).not.toBe(toHex(master))
		// Distinct profiles AND distinct DEKs derive distinct keys from the same master.
		const other = await derivePxeStoreKey(master, dek, "profile-fixture-2")
		expect(toHex(other)).not.toBe(toHex(key))
		const otherDek = asImportedKeysDek(new Uint8Array(32).fill(0x5b) as Uint8Array<ArrayBuffer>)
		expect(toHex(await derivePxeStoreKey(master, otherDek, "profile-fixture-1"))).not.toBe(toHex(key))
		// A short DEK is refused before any derivation (the 32+32 IKM split is the contract).
		const shortDek = asImportedKeysDek(new Uint8Array(31).fill(0x5a) as Uint8Array<ArrayBuffer>)
		await expect(derivePxeStoreKey(master, shortDek, "profile-fixture-1")).rejects.toThrow(/32-byte/)
	})

	// ── V12: deriveRowKeys + sealRow + keyedSegment — NULO-ROW-SEAL v1 ──
	//
	// Every sealed row on disk opens only under these labels, this salt and AAD shape, and the
	// shared frame; every keyed-hash storage key is this HMAC. A drift hides every sealed row.
	// REFERENCE-GENERATED by node:crypto in reference/row-seal-v1/frame-vectors.ts; never re-pin
	// from the wallet's own output.
	const V12_MASTER = (() => {
		const bytes = asMasterSecretBytes(new Uint8Array(32) as Uint8Array<ArrayBuffer>)
		bytes[31] = 0x42
		return bytes
	})()
	const V12_BINDING = { root: "nulo:core:contacts", storageKey: "nulo:core:contacts@contact-1", profileId: "profile-fixture-1" }
	const V12_ROW = JSON.stringify({ id: "contact-1", profileId: "profile-fixture-1", name: "Ada", address: `0x${"0b".repeat(32)}` })
	const V12_FRAME =
		"AaqqqqqqqqqqqqqqqkOFIijzGETY7JhN3ppyq3aifz/lfNktjZ4RQo6g3SePxMxzA/dJYmHGgmTYLCuWUSamokV8oOGSHAzXH4h1b7bgSQvVicdeVSBpkkzqP9wPhbdaY0coCX7/1uoNfVCmIKvaWsDN3ORCl3opqarOEb7DzP5PHMsdRb6Cy5L2yEtacPko5yy9wvlnAKGAF7m/N00ujBhoyndQAiqhJm15"

	test("V12a — row-seal labels are frozen", () => {
		expect(ROW_SEAL_LABELS).toEqual({
			salt: "nulo:row-seal:v1",
			aead: "nulo:row-seal:aead:v1",
			index: "nulo:row-seal:index:v1",
			aad: "nulo:row:v1",
		})
	})

	test("V12b — sealRow under a fixed IV matches the reference frame, and openRow opens it", async () => {
		const keys = await deriveRowKeys(V12_MASTER, "profile-fixture-1", "generation-fixture-1")
		const sealed = await withFixedRandom(fromHex(V2_IV_HEX), () => sealRow(keys, V12_ROW, V12_BINDING))
		expect(sealed).toBe(V12_FRAME)
		expect(await openRow(keys, V12_FRAME, V12_BINDING)).toBe(V12_ROW)
	})

	test("V12c — keyedSegment matches the reference HMAC", async () => {
		const keys = await deriveRowKeys(V12_MASTER, "profile-fixture-1", "generation-fixture-1")
		expect(await keyedSegment(keys, `0x${"0b".repeat(32)}`)).toBe("Q2hy5kE9zYMQ8gsZNJG80M6KU1jYmcFXV-60LxBlXiQ")
	})

	// ── V13: the two DEK-rooted AES-GCM boxes, byte for byte ─────────
	//
	// Locks the frame `version(1)=1 ‖ iv(12) ‖ ct ‖ tag` both boxes write, the imported-key row key
	// (HKDF over the DEK, zero salt, info `nulo:imported-account-key:v2|chainId|address`, no AAD) and
	// the DEK slot's AAD. Every imported signing key and passkey DEK slot on disk is in this form.
	// REFERENCE-GENERATED by node:crypto in reference/row-seal-v1/frame-vectors.ts; never re-pin
	// from the boxes' own output.
	const V13_DEK = asImportedKeysDek(new Uint8Array(32).fill(0x5a) as Uint8Array<ArrayBuffer>)
	const V13_CHAIN_ID = 11155111
	const V13_ADDRESS = `0x${"0b".repeat(32)}`
	const V13_SIGNING_KEY_HEX = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20"
	const V13_SIGNING_KEY_FRAME = "AaqqqqqqqqqqqqqqqrwqBwTOb4aVMTtNTiUZX48dwP4oliLSL/l3sOyF80Vm0uuXQMxGC7tvVPJTv58V1g=="
	const V13_DEK_FRAME = "Aaqqqqqqqqqqqqqqqi3bD02pgqgntOcUMtTabJCpIJY35Sv4mXxOssRohEQtZSWck8iSHLVBffWW/WAzCA=="
	const v13WrapKey = () =>
		self.crypto.subtle.importKey("raw", new Uint8Array(32).fill(0x7e), { name: "AES-GCM" }, false, ["encrypt", "decrypt"])

	test("V13a — sealImportedSigningKeyV2 under a fixed IV matches the reference frame, and opens it", async () => {
		const signingKey = fromHex(V13_SIGNING_KEY_HEX) as Uint8Array<ArrayBuffer>
		const sealed = await withFixedRandom(fromHex(V2_IV_HEX), () =>
			sealImportedSigningKeyV2(V13_DEK, V13_CHAIN_ID, V13_ADDRESS, signingKey),
		)
		expect(sealed).toBe(V13_SIGNING_KEY_FRAME)
		expect(toHex(await unsealImportedSigningKeyV2(V13_DEK, V13_CHAIN_ID, V13_ADDRESS, V13_SIGNING_KEY_FRAME))).toBe(V13_SIGNING_KEY_HEX)
	})

	test("V13b — sealDekUnderWrapKey under a fixed IV matches the reference frame, and opens it", async () => {
		const wrapKey = await v13WrapKey()
		const sealed = await withFixedRandom(fromHex(V2_IV_HEX), () => sealDekUnderWrapKey(wrapKey, V13_DEK))
		expect(sealed).toBe(V13_DEK_FRAME)
		expect(toHex(await unsealDekUnderWrapKey(wrapKey, V13_DEK_FRAME))).toBe(toHex(V13_DEK))
	})

	// ── P1: HKDF-SHA256 RFC 5869 Appendix A.1 ────────────────────────
	//
	// Cross-checks the platform HKDF implementation against a
	// canonical external reference, independent of our labels or
	// input shapes. If V11 fails AND P1 passes, the bug is in our
	// label/input construction. If both fail, the platform HKDF
	// changed (upgrade browser / Node).
	test("P1 — HKDF-SHA256 RFC 5869 A.1 matches", async () => {
		const ikm = fromHex("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b")
		const salt = fromHex("000102030405060708090a0b0c")
		const info = fromHex("f0f1f2f3f4f5f6f7f8f9")
		const expected = "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf34007208d5b887185865"

		const baseKey = await self.crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"])
		const bits = await self.crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, baseKey, 42 * 8)
		expect(toHex(bits)).toBe(expected)
	})
})
