import { describe, expect, test } from "vitest"
import { deriveRowKeys, keyedSegment, openRow, type RowBinding, sealRow } from "./row-seal"
import { asMasterSecretBytes, type MasterSecretBytes } from "./secret-types"

const master = (fill: number): MasterSecretBytes => asMasterSecretBytes(new Uint8Array(32).fill(fill) as Uint8Array<ArrayBuffer>)
const BINDING: RowBinding = { root: "nulo:core:contacts", storageKey: "nulo:core:contacts@c1", profileId: "p1" }
const ROW = JSON.stringify({ id: "c1", profileId: "p1", name: "Ada" })

describe("row seal", () => {
	test("a sealed row opens under its own keys and binding", async () => {
		const keys = await deriveRowKeys(master(1), "p1", "g1")
		expect(await openRow(keys, await sealRow(keys, ROW, BINDING), BINDING)).toBe(ROW)
	})

	// Each class an offline writer can try: the same ciphertext under another binding, or keys of
	// another profile, incarnation or master. Every one must fail authentication, never decode.
	test.each([
		["another storage key", { storageKey: "nulo:core:contacts@c2" }, {}],
		["another root", { root: "nulo:core:dappSessions" }, {}],
		["another profile in the AAD", { profileId: "p2" }, {}],
		["keys of another profile", {}, { profileId: "p2" }],
		["keys of another incarnation", {}, { generation: "g2" }],
		["keys of another master", {}, { fill: 2 }],
	] as const)("a row opened with %s fails closed", async (_label, bindingChange, keyChange) => {
		const keys = await deriveRowKeys(master(1), "p1", "g1")
		const sealed = await sealRow(keys, ROW, BINDING)
		const k = keyChange as { profileId?: string; generation?: string; fill?: number }
		const otherKeys = await deriveRowKeys(master(k.fill ?? 1), k.profileId ?? "p1", k.generation ?? "g1")
		await expect(openRow(otherKeys, sealed, { ...BINDING, ...bindingChange })).rejects.toThrow()
	})

	test("a flipped ciphertext byte and a foreign frame version fail closed", async () => {
		const keys = await deriveRowKeys(master(1), "p1", "g1")
		const bytes = Buffer.from(await sealRow(keys, ROW, BINDING), "base64")
		const flipped = Buffer.from(bytes)
		flipped[20] ^= 1
		await expect(openRow(keys, flipped.toString("base64"), BINDING)).rejects.toThrow()
		const versioned = Buffer.from(bytes)
		versioned[0] = 2
		await expect(openRow(keys, versioned.toString("base64"), BINDING)).rejects.toThrow()
	})

	test("keyed segments are stable within a profile and differ across profiles and incarnations", async () => {
		const a = await deriveRowKeys(master(1), "p1", "g1")
		const address = `0x${"0b".repeat(32)}`
		const value = await keyedSegment(a, address)
		expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/)
		expect(await keyedSegment(await deriveRowKeys(master(1), "p1", "g1"), address)).toBe(value)
		expect(await keyedSegment(await deriveRowKeys(master(1), "p2", "g1"), address)).not.toBe(value)
		expect(await keyedSegment(await deriveRowKeys(master(1), "p1", "g2"), address)).not.toBe(value)
	})

	test("a master of the wrong length is refused before any derivation", async () => {
		await expect(deriveRowKeys(asMasterSecretBytes(new Uint8Array(31) as Uint8Array<ArrayBuffer>), "p1", "g1")).rejects.toThrow(
			/32-byte/,
		)
	})
})
