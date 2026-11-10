import { describe, expect, test } from "vitest"
import { BUNDLED_TOKEN_CLASS_IDS } from "./class-ids"
import { signEnvelope } from "./envelope"
import { readTokenList, SEQUENCE_FLOOR } from "./index"
import {
	BN254_FR_MODULUS,
	checkPayload,
	checkSource,
	MAX_ENTRIES_PER_CHAIN,
	PayloadError,
	parsePayload,
	selectEntries,
	type TokenListEntry,
	tokenKey,
} from "./parse"
import { MAX_PRICE_FEEDS } from "./price-feeds"
import { freshKey } from "./test-keys"

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
const USD = { min: 0.2, max: 5, ticker: "USDC" }
const flag = (n: bigint, over: Record<string, unknown> = {}) => ({ chainId: 1, address: hex64(n), ...over })
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
		expect(refusedAt(payload([entry(0, { classId: hex64(7n) })]), "strict")).toBe("payload.tokens[0].classId")
		const seventeen = Array.from({ length: MAX_ENTRIES_PER_CHAIN + 1 }, (_, i) => entry(i))
		expect(refusedAt(payload(seventeen), "strict")).toBe(`payload.tokens[${MAX_ENTRIES_PER_CHAIN}].chainId`)
		expect(checkPayload(payload(seventeen), "wallet").tokens).toHaveLength(MAX_ENTRIES_PER_CHAIN + 1)
	})

	test("a signed list carrying a flagged set verifies and parses", async () => {
		const { privateKey, pinned } = await freshKey()
		const flagged = payload([entry(0)], { sequence: SEQUENCE_FLOOR, flagged: [{ chainId: 7, address: hex64(9n) }] })
		const bytes = new TextEncoder().encode(JSON.stringify(flagged))
		const list = await readTokenList(JSON.stringify(await signEnvelope(bytes, privateKey, pinned.keyId)), [pinned])
		expect(list).toMatchObject({ sequence: SEQUENCE_FLOOR, entries: [expect.objectContaining({ symbol: "T0" })] })
	})

	test("both modes parse a flagged set alike, and read an absent one as empty", () => {
		const flagged = [flag(9n), flag(9n, { chainId: 2 })]
		expect(checkPayload(payload([entry(0)], { flagged }), "strict").flagged).toEqual(flagged)
		expect(checkPayload(payload([entry(0)], { flagged }), "wallet")).toEqual(checkPayload(payload([entry(0)], { flagged }), "strict"))
		expect(checkPayload(payload([entry(0)]), "wallet").flagged).toEqual([])
	})

	test("refuses an upper-case, repeated or listed flag in both modes, and an unknown key in a flag in strict", () => {
		for (const mode of ["wallet", "strict"] as const) {
			const upper = flag(0xabcn, { address: hex64(0xabcn).replace("abc", "ABC") })
			expect(refusedAt(payload([], { flagged: [upper] }), mode)).toBe("payload.flagged[0].address")
			expect(refusedAt(payload([], { flagged: [flag(9n), flag(9n)] }), mode)).toBe("payload.flagged[1]")
			expect(refusedAt(payload([entry(0)], { flagged: [flag(1n)] }), mode)).toBe("payload.flagged[0]")
		}
		const extended = payload([], { flagged: [flag(9n, { reason: "scam" })] })
		expect(refusedAt(extended, "strict")).toBe("payload.flagged[0].reason")
		expect(checkPayload(extended, "wallet").flagged).toEqual([flag(9n)])
	})

	test("the source holds tokens, optional flags and optional feeds, under strict rules", () => {
		expect(checkSource({ tokens: [entry(0)] })).toEqual({ tokens: [entry(0)] })
		expect(checkSource({ tokens: [], flagged: [flag(9n)] })).toEqual({ tokens: [], flagged: [flag(9n)] })
		expect(checkSource({ tokens: [entry(0)], priceFeeds: { "usd-coin": USD } })).toEqual({
			tokens: [entry(0)],
			priceFeeds: { "usd-coin": USD },
		})
		expect(() => checkSource({ tokens: [entry(0)], sequence: 5 })).toThrow(PayloadError)
		expect(() => checkSource({ tokens: [entry(0, { priceId: "dogecoin" })], priceFeeds: { "usd-coin": USD } })).toThrow(
			"source.tokens[0].priceId",
		)
	})
})

describe("icon", () => {
	const picture = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`
	const ICON = picture('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><circle cx="1" cy="1" r="1"/></svg>')

	test("both modes keep an accepted picture, after the price id, and selectEntries keeps it", () => {
		const value = payload([entry(0, { icon: ICON }), entry(1)])
		const strict = checkPayload(value, "strict")
		expect(Object.keys(strict.tokens[0]).at(-1)).toBe("icon")
		expect(checkPayload(value, "wallet")).toEqual(strict)
		expect(selectEntries(strict.tokens, { "usd-coin": USD }).map((e) => e.icon)).toEqual([ICON, undefined])
		expect(checkSource({ tokens: [entry(0, { icon: ICON })] })).toEqual({ tokens: [entry(0, { icon: ICON })] })
	})

	test.each([
		["a scripted SVG", picture("<svg><script>x</script></svg>")],
		["an oversize picture", picture(`<svg><desc>${"a".repeat(3000)}</desc></svg>`)],
		["a value that is not a string", 7],
	])("the wallet drops %s and keeps the entry; strict refuses it at the icon", (_, icon) => {
		const value = payload([entry(0, { icon })])
		expect(checkPayload(value, "wallet").tokens).toEqual([entry(0)])
		expect(refusedAt(value, "strict")).toBe("payload.tokens[0].icon")
		expect(() => checkSource({ tokens: [entry(0, { icon })] })).toThrow("source.tokens[0].icon")
	})

	test("a signed list whose picture the wallet refuses still verifies and keeps the entry", async () => {
		const { privateKey, pinned } = await freshKey()
		const value = payload([entry(0, { icon: picture("<svg><script>x</script></svg>") })], { sequence: SEQUENCE_FLOOR })
		const bytes = new TextEncoder().encode(JSON.stringify(value))
		const list = await readTokenList(JSON.stringify(await signEnvelope(bytes, privateKey, pinned.keyId)), [pinned])
		expect(list.entries).toEqual([entry(0, { priceId: undefined })])
	})
})

describe("tokenKey", () => {
	const DIGITS = "0f8df6867e9547fdf90e0f69187ada6fbd7b1f6ad4903ad333200bb032279ecf"

	test.each([
		["a list address", 1, `0x${DIGITS}`, `1:0x${DIGITS}`],
		["a row in upper case", 1, `0x${DIGITS.toUpperCase()}`, `1:0x${DIGITS}`],
		["an upper-case prefix", 1, `0X${DIGITS.toUpperCase()}`, `1:0x${DIGITS}`],
		["a row without 0x, which only the flag match restores", 1, DIGITS.toUpperCase(), `1:${DIGITS}`],
		["the local chain, id 0", 0, `0x${DIGITS}`, `0:0x${DIGITS}`],
	])("%s", (_, chainId, contract, key) => {
		expect(tokenKey(chainId, contract)).toBe(key)
	})
})

describe("price feeds", () => {
	const WETH = { min: 100, max: 100_000, ticker: "WETH" }
	const priced = (value: unknown) => selectEntries(checkPayload(value, "wallet").tokens, checkPayload(value, "wallet").priceFeeds ?? {})

	test("a list with no feed map, as today's, passes strict and prices nothing", () => {
		const today = payload([entry(0), entry(1, { priceId: "dogecoin" })])
		expect(checkPayload(today, "strict")).not.toHaveProperty("priceFeeds")
		expect(priced(today).map((t) => t.priceId)).toEqual([undefined, undefined])
	})

	test("both modes read a feed map alike, and an entry is priced only through its record", () => {
		const value = payload([entry(0), entry(1, { priceId: "weth" })], { priceFeeds: { "usd-coin": USD, weth: WETH } })
		expect(checkPayload(value, "strict")).toEqual(checkPayload(value, "wallet"))
		expect(checkPayload(value, "strict").priceFeeds).toEqual({ "usd-coin": USD, weth: WETH })
		expect(priced(value).map((t) => t.priceId)).toEqual(["usd-coin", "weth"])
		const edges = { "usd-coin": { min: 0.0001, max: 0.1, ticker: "x".repeat(12) }, weth: { min: 1000, max: 1_000_000, ticker: "WETH" } }
		expect(checkPayload(payload([entry(0), entry(1, { priceId: "weth" })], { priceFeeds: edges }), "strict").priceFeeds).toEqual(edges)
	})

	test("strict refuses a record outside the bounds; the wallet drops it, unprices its entry and keeps the flags", () => {
		const cases: [Record<string, unknown>, string][] = [
			[{ min: 0 }, "min"],
			[{ min: -1 }, "min"],
			[{ min: 0.000_09, max: 0.05 }, "min"],
			[{ min: Number.NaN }, "min"],
			[{ min: Number.POSITIVE_INFINITY }, "min"],
			[{ min: "0.2" }, "min"],
			[{ min: 2, max: 2 }, "max"],
			[{ min: 2, max: 1 }, "max"],
			[{ min: 2000, max: 1_000_001 }, "max"],
			[{ min: 1, max: 1001 }, "max"],
			[{ ticker: "" }, "ticker"],
			[{ ticker: "US DC" }, "ticker"],
			[{ ticker: "USDC\u202e" }, "ticker"],
			[{ ticker: "<b>USDC</b>" }, "ticker"],
			[{ ticker: "\u0415TH" }, "ticker"],
			[{ ticker: "x".repeat(13) }, "ticker"],
		]
		for (const [over, field] of cases) {
			const value = payload([entry(0)], { priceFeeds: { "usd-coin": { ...USD, ...over } }, flagged: [flag(9n)] })
			expect(refusedAt(value, "strict")).toBe(`payload.priceFeeds.usd-coin.${field}`)
			expect(checkPayload(value, "wallet").priceFeeds).toEqual({})
			expect(priced(value)[0]).not.toHaveProperty("priceId")
			expect(checkPayload(value, "wallet").flagged).toEqual([flag(9n)])
		}
		expect(refusedAt(payload([entry(0)], { priceFeeds: { "usd-coin": "USDC" } }), "strict")).toBe("payload.priceFeeds.usd-coin")
	})

	test("a feed id with another spelling, Fee Juice's or an inherited name is refused by index in strict and dropped in wallet", () => {
		for (const id of ["USD-COIN", "a&b", "a,b", "a%2C", "a/b", "a?b", "constructor", "aztec", "__proto__"]) {
			const value = JSON.parse(JSON.stringify(payload([entry(0, { priceId: "usd-coin" })]))) as Record<string, unknown>
			value.priceFeeds = JSON.parse(`{"usd-coin": ${JSON.stringify(USD)}, ${JSON.stringify(id)}: ${JSON.stringify(USD)}}`)
			expect(refusedAt(value, "strict")).toBe("payload.priceFeeds[1]")
			expect(Object.keys(checkPayload(value, "wallet").priceFeeds ?? {})).toEqual(["usd-coin"])
		}
		const inherited = payload([entry(0, { priceId: "constructor" }), entry(1, { priceId: "aztec" })], { priceFeeds: {} })
		expect(priced(inherited).map((t) => t.priceId)).toEqual([undefined, undefined])
	})

	test("strict, with a feed map, refuses a price id with no record and a record no entry names", () => {
		const unrecorded = payload([entry(0, { priceId: "tether" })], { priceFeeds: { "usd-coin": USD } })
		expect(refusedAt(unrecorded, "strict")).toBe("payload.tokens[0].priceId")
		expect(refusedAt(payload([entry(0)], { priceFeeds: { "usd-coin": USD, weth: WETH } }), "strict")).toBe("payload.priceFeeds.weth")
		expect(priced(unrecorded)[0]).not.toHaveProperty("priceId")
	})

	test("a feed map is an object of at most 32 records in both modes; strict refuses an unknown field, the wallet ignores it", () => {
		const many = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`id-${i}`, USD]))
		expect(Object.keys(checkPayload(payload([], { priceFeeds: many(MAX_PRICE_FEEDS) }), "wallet").priceFeeds ?? {})).toHaveLength(
			MAX_PRICE_FEEDS,
		)
		for (const mode of ["wallet", "strict"] as const) {
			expect(refusedAt(payload([], { priceFeeds: many(MAX_PRICE_FEEDS + 1) }), mode)).toBe("payload.priceFeeds")
			expect(refusedAt(payload([], { priceFeeds: [USD] }), mode)).toBe("payload.priceFeeds")
		}
		const extended = payload([entry(0)], { priceFeeds: { "usd-coin": { ...USD, logo: "x" } } })
		expect(refusedAt(extended, "strict")).toBe("payload.priceFeeds.usd-coin.logo")
		expect(checkPayload(extended, "wallet").priceFeeds).toEqual({ "usd-coin": USD })
	})

	test("a verified list carries the feeds its kept entries name, and no other", async () => {
		const { privateKey, pinned } = await freshKey()
		const listed = payload([entry(0), entry(1, { priceId: "weth", classId: hex64(7n) })], {
			sequence: SEQUENCE_FLOOR,
			priceFeeds: { "usd-coin": USD, weth: WETH, tether: USD },
		})
		const bytes = new TextEncoder().encode(JSON.stringify(listed))
		const list = await readTokenList(JSON.stringify(await signEnvelope(bytes, privateKey, pinned.keyId)), [pinned])
		expect(list.priceFeeds).toEqual({ "usd-coin": USD })
		expect(list.entries.map((t) => t.priceId)).toEqual(["usd-coin"])
	})
})

describe("selectEntries", () => {
	test("keeps the first 16 bundled-class entries per chain and unprices an id with no feed", () => {
		const tokens = checkPayload(
			payload([
				entry(100, { classId: hex64(7n) }),
				...Array.from({ length: 20 }, (_, i) => entry(i)),
				entry(50, { chainId: 2, priceId: "dogecoin" }),
			]),
			"wallet",
		).tokens
		const selected = selectEntries(tokens, { "usd-coin": USD })
		const chain1 = selected.filter((t) => t.chainId === 1)
		expect(chain1.map((t) => t.symbol)).toEqual(Array.from({ length: MAX_ENTRIES_PER_CHAIN }, (_, i) => `T${i}`))
		expect(selected.find((t) => t.chainId === 2)).toEqual(expect.not.objectContaining({ priceId: expect.anything() }))
		expect(chain1[0].priceId).toBe("usd-coin")
	})
})
