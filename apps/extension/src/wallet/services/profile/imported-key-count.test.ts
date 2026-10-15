import { beforeEach, describe, expect, test, vi } from "vitest"

/** Every buffer the real unseals hand out, so a test can see each one wiped. */
const handedOut = vi.hoisted(() => ({ deks: [] as Uint8Array[], keys: [] as Uint8Array[] }))
vi.mock("@nulo/wallet-crypto", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@nulo/wallet-crypto")>()
	return {
		...actual,
		unsealDekUnderWrapKey: async (...args: Parameters<typeof actual.unsealDekUnderWrapKey>) => {
			const dek = await actual.unsealDekUnderWrapKey(...args)
			handedOut.deks.push(dek)
			return dek
		},
		unsealImportedSigningKeyV2: async (...args: Parameters<typeof actual.unsealImportedSigningKeyV2>) => {
			const key = await actual.unsealImportedSigningKeyV2(...args)
			handedOut.keys.push(key)
			return key
		},
	}
})

import { generateImportedKeysDek, sealDekUnderWrapKey, sealImportedSigningKeyV2 } from "@nulo/wallet-crypto"
import { probeDekAndCount, type SealedImportedKey } from "./imported-key-count"

const wiped = (bytes: Uint8Array) => bytes.every((b) => b === 0)

async function wrapKey(): Promise<CryptoKey> {
	return crypto.subtle.importKey("raw", new Uint8Array(32).fill(9), "AES-GCM", false, ["encrypt", "decrypt"])
}

async function sealedRow(dek: Uint8Array, chainId: number, address: string): Promise<SealedImportedKey> {
	return {
		chainId,
		address,
		encryptedSigningKey: await sealImportedSigningKeyV2(dek as never, chainId, address, new Uint8Array(32).fill(5)),
	}
}

beforeEach(() => {
	handedOut.deks.length = 0
	handedOut.keys.length = 0
})

describe("probeDekAndCount", () => {
	test("counts the rows that do not open, and wipes the DEK and every key that opened", async () => {
		const key = await wrapKey()
		const dek = generateImportedKeysDek()
		const sealed = await sealDekUnderWrapKey(key, dek)
		const rows = [
			await sealedRow(dek, 1, "0xaa"),
			await sealedRow(generateImportedKeysDek(), 1, "0xbb"),
			await sealedRow(dek, 2, "0xcc"),
		]

		expect(await probeDekAndCount(key, sealed, rows)).toEqual({ opens: true, unopened: 1 })
		expect(handedOut.keys).toHaveLength(2)
		expect(handedOut.keys.every(wiped)).toBe(true)
		expect(handedOut.deks.every(wiped)).toBe(true)
	})

	test("a DEK that does not open counts nothing", async () => {
		const key = await wrapKey()
		const other = await crypto.subtle.importKey("raw", new Uint8Array(32).fill(1), "AES-GCM", false, ["encrypt", "decrypt"])
		const sealed = await sealDekUnderWrapKey(other, generateImportedKeysDek())
		expect(await probeDekAndCount(key, sealed, [await sealedRow(generateImportedKeysDek(), 1, "0xaa")])).toEqual({
			opens: false,
			unopened: 0,
		})
	})

	test("a count that throws aborts, with the DEK and the keys opened before it wiped", async () => {
		const key = await wrapKey()
		const dek = generateImportedKeysDek()
		const sealed = await sealDekUnderWrapKey(key, dek)

		await expect(probeDekAndCount(key, sealed, [await sealedRow(dek, 1, "0xaa"), null as never])).rejects.toThrow(TypeError)
		expect(handedOut.deks).toHaveLength(1)
		expect(handedOut.deks.every(wiped)).toBe(true)
		expect(handedOut.keys.every(wiped)).toBe(true)
	})

	test("with no rows, only the DEK is proven", async () => {
		const key = await wrapKey()
		const sealed = await sealDekUnderWrapKey(key, generateImportedKeysDek())
		expect(await probeDekAndCount(key, sealed)).toEqual({ opens: true, unopened: 0 })
		expect(handedOut.deks.every(wiped)).toBe(true)
	})
})
