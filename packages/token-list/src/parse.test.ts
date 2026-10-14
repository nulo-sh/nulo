import { describe, expect, test } from "vitest"
import { BUNDLED_TOKEN_CLASS_IDS } from "./class-ids"
import {
	BN254_FR_MODULUS,
	checkPayload,
	checkSource,
	MAX_ENTRIES_PER_CHAIN,
	PayloadError,
	parsePayload,
	selectEntries,
	type TokenListEntry,
} from "./parse"

const CLASS = BUNDLED_TOKEN_CLASS_IDS[0]
const hex64 = (n: bigint) => `0x${n.toString(16).padStart(64, "0")}`
const entry = (n: number, over: Partial<Record<keyof TokenListEntry, unknown>> = {}) => ({
	chainId: 1,
	address: hex64(BigInt(n + 1)),
	classId: CLASS,
	symbol: `T${n}`,
	decimals: 6,
	name: `Token ${n}`,
	priceId: "usd-coin",
	...over,
})
const payload = (tokens: unknown[], over: Record<string, unknown> = {}) => ({
	format: "nulo-token-list/1",
	sequence: 1_760_000_000,
	issuedAt: "2025-10-09T08:53:20.000Z",
	tokens,
	...over,
})

function refusedAt(value: unknown, mode: "wallet" | "strict" = "wallet"): string {
	try {
		checkPayload(value, mode)
	} catch (error) {
		expect(error).toBeInstanceOf(PayloadError)
		return (error as PayloadError).path
	}
	throw new Error("accepted")
}

describe("payload", () => {
	test("a valid payload parses identically in both modes", () => {
		const value = payload([entry(0), entry(1, { priceId: undefined })])
		expect(checkPayload(value, "strict")).toEqual(checkPayload(value, "wallet"))
		expect(parsePayload(new TextEncoder().encode(JSON.stringify(value)), "strict").tokens).toHaveLength(2)
	})

	test("refuses instead of normalizing hex", () => {
		expect(refusedAt(payload([entry(0, { address: hex64(0xabcn).replace("abc", "ABC") })]))).toBe("payload.tokens[0].address")
		expect(refusedAt(payload([entry(0, { address: hex64(0xabcn).replace("0x", "0X") })]))).toBe("payload.tokens[0].address")
		expect(refusedAt(payload([entry(0, { classId: `0x${CLASS.slice(2).toUpperCase()}` })]))).toBe("payload.tokens[0].classId")
		expect(refusedAt(payload([entry(0, { address: hex64(1n).slice(0, 65) })]))).toBe("payload.tokens[0].address")
	})

	test("refuses an address at or above the field modulus", () => {
		expect(() => checkPayload(payload([entry(0, { address: hex64(BN254_FR_MODULUS - 1n) })]), "strict")).not.toThrow()
		expect(refusedAt(payload([entry(0, { address: hex64(BN254_FR_MODULUS) })]))).toBe("payload.tokens[0].address")
		expect(refusedAt(payload([entry(0, { address: hex64((1n << 256n) - 1n) })]))).toBe("payload.tokens[0].address")
	})

	test("refuses a duplicate (chainId, address) but not the same address on two chains", () => {
		expect(refusedAt(payload([entry(0), entry(0, { symbol: "DUP" })]))).toBe("payload.tokens[1]")
		expect(() => checkPayload(payload([entry(0), entry(0, { chainId: 2 })]), "strict")).not.toThrow()
	})

	test("refuses control, bidi and separator characters and out-of-bound fields", () => {
		const cases: [Partial<Record<keyof TokenListEntry, unknown>>, string][] = [
			[{ name: "Test ‮CDSU" }, "name"],
			[{ name: "zero‍width" }, "name"],
			[{ symbol: "US\nDC" }, "symbol"],
			[{ symbol: "" }, "symbol"],
			[{ name: "x".repeat(81) }, "name"],
			[{ symbol: "x".repeat(33) }, "symbol"],
			[{ decimals: 19 }, "decimals"],
			[{ decimals: 6.5 }, "decimals"],
			[{ chainId: 2 ** 32 }, "chainId"],
			[{ chainId: "1" }, "chainId"],
			[{ priceId: "USD Coin" }, "priceId"],
		]
		for (const [over, field] of cases) expect(refusedAt(payload([entry(0, over)]))).toBe(`payload.tokens[0].${field}`)
		expect(checkPayload(payload([entry(0, { name: "x".repeat(80), symbol: "€".repeat(32) })]), "strict").tokens).toHaveLength(1)
	})

	test("refuses a bad envelope-level field", () => {
		expect(refusedAt(payload([], { sequence: 0 }))).toBe("payload.sequence")
		expect(refusedAt(payload([], { sequence: 2 ** 53 }))).toBe("payload.sequence")
		expect(refusedAt(payload([], { issuedAt: "yesterday" }))).toBe("payload.issuedAt")
		expect(refusedAt(payload([], { format: "nulo-token-list/2" }))).toBe("payload.format")
		expect(() => parsePayload(Uint8Array.from([0xff, 0xfe]), "wallet")).toThrow(PayloadError)
	})

	test("the wallet ignores unknown keys and unknown ids; strict refuses them", () => {
		const extended = payload([entry(0, { logo: "https://x" } as never)], { mirror: "https://y" })
		expect(checkPayload(extended, "wallet").tokens[0]).not.toHaveProperty("logo")
		expect(refusedAt(extended, "strict")).toBe("payload.mirror")
		expect(refusedAt(payload([entry(0, { logo: "x" } as never)]), "strict")).toBe("payload.tokens[0].logo")
		expect(refusedAt(payload([entry(0, { priceId: "dogecoin" })]), "strict")).toBe("payload.tokens[0].priceId")
		expect(refusedAt(payload([entry(0, { classId: hex64(7n) })]), "strict")).toBe("payload.tokens[0].classId")
		const seventeen = Array.from({ length: MAX_ENTRIES_PER_CHAIN + 1 }, (_, i) => entry(i))
		expect(refusedAt(payload(seventeen), "strict")).toBe(`payload.tokens[${MAX_ENTRIES_PER_CHAIN}].chainId`)
		expect(checkPayload(payload(seventeen), "wallet").tokens).toHaveLength(MAX_ENTRIES_PER_CHAIN + 1)
	})

	test("the source holds tokens only, under strict rules", () => {
		expect(checkSource({ tokens: [entry(0)] }).tokens).toHaveLength(1)
		expect(() => checkSource({ tokens: [entry(0)], sequence: 5 })).toThrow(PayloadError)
		expect(() => checkSource({ tokens: [entry(0, { priceId: "dogecoin" })] })).toThrow(PayloadError)
	})
})

describe("selectEntries", () => {
	test("keeps the first 16 bundled-class entries per chain and unprices an unknown id", () => {
		const tokens = checkPayload(
			payload([
				entry(100, { classId: hex64(7n) }),
				...Array.from({ length: 20 }, (_, i) => entry(i)),
				entry(50, { chainId: 2, priceId: "dogecoin" }),
			]),
			"wallet",
		).tokens
		const selected = selectEntries(tokens)
		const chain1 = selected.filter((t) => t.chainId === 1)
		expect(chain1.map((t) => t.symbol)).toEqual(Array.from({ length: MAX_ENTRIES_PER_CHAIN }, (_, i) => `T${i}`))
		expect(selected.find((t) => t.chainId === 2)).toEqual(expect.not.objectContaining({ priceId: expect.anything() }))
		expect(chain1[0].priceId).toBe("usd-coin")
	})
})
