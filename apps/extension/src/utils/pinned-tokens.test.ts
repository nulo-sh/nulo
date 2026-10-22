import { describe, expect, test } from "vitest"
import { PINNED_TOKENS_MAX_CHAINS, sanitizePinMap } from "./pinned-tokens"

const addr = (n: number) => `0x${n.toString(16).padStart(64, "0")}`
const A = addr(0xa1)
const B = addr(0xb2)
const C = addr(0xc3)
const D = addr(0xd4)

describe("sanitizePinMap", () => {
	test("rejects every non-map root", () => {
		for (const raw of [undefined, null, 3, "x", [], [A], [[A]]]) expect(sanitizePinMap(raw)).toEqual({})
	})

	test("drops non-canonical chain keys, non-array values, non-string and non-address entries", () => {
		expect(
			sanitizePinMap({
				"00": [A],
				"1e3": [A],
				"-1": [A],
				"12345678901234567": [A],
				"9999999999999999": [A],
				"7": "not-a-list",
				"8": [1, null, "0xzz", `0x${"a".repeat(63)}`, A.toUpperCase(), A, B],
			}),
		).toEqual({ "8": [A, B] })
	})

	test("caps a list at three and the map at 32 chains; an empty list is dropped", () => {
		const big: Record<string, string[]> = {}
		for (let i = 1; i <= PINNED_TOKENS_MAX_CHAINS + 2; i++) big[String(i)] = [A]
		big["999"] = []
		const out = sanitizePinMap({ ...big, "5": [A, B, C, D] })
		expect(Object.keys(out)).toHaveLength(PINNED_TOKENS_MAX_CHAINS)
		expect(out["5"]).toEqual([A, B, C])
		expect(out["999"]).toBeUndefined()
	})
})
