import { describe, expect, test, vi } from "vitest"
import { mintPxeGeneration, type Profile, toProfileInfo } from "./spec"

describe("mintPxeGeneration", () => {
	test("is 16 random bytes as lowercase zero-padded hex", () => {
		const sizes: number[] = []
		const spy = vi.spyOn(globalThis.crypto, "getRandomValues").mockImplementation(<T extends ArrayBufferView | null>(array: T): T => {
			const bytes = array as unknown as Uint8Array
			sizes.push(bytes.length)
			for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 17 + 3) & 0xff
			return array
		})
		try {
			expect(mintPxeGeneration()).toBe("031425364758697a8b9cadbecfe0f102")
			expect(sizes).toEqual([16])
		} finally {
			spy.mockRestore()
		}
	})
})

describe("toProfileInfo", () => {
	const row = { id: "p1", name: "Main", type: "password", dekSealed: "sealed", guard: "g", secret: "s" } as unknown as Profile

	test("projects the identity alone and marks recovery mode when true", () => {
		expect(toProfileInfo(row, true)).toEqual({ id: "p1", name: "Main", type: "password", recoveryMode: true })
	})

	test("carries no recoveryMode key when false", () => {
		const info = toProfileInfo(row, false)
		expect(info).toEqual({ id: "p1", name: "Main", type: "password" })
		expect("recoveryMode" in info).toBe(false)
	})
})
