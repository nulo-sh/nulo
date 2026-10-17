import { describe, expect, test } from "vitest"
import { ref } from "vue"
import { aggregateFiat, isPriceableHolding, type PriceMapping, pricesUnavailable } from "./token-aggregate"

type Row = { publicBalance?: string; privateBalance?: string; token: { symbol: string; decimals: number } }
const row = (symbol: string, pub = "0", priv = "0"): Row => ({ publicBalance: pub, privateBalance: priv, token: { symbol, decimals: 6 } })
const fiatBy = (prices: Record<string, bigint>) => (tb: Row) => prices[tb.token.symbol]

describe("aggregateFiat", () => {
	test("sums priced holdings; zero rows are neither holdings nor gaps", () => {
		const out = aggregateFiat([row("A", "10"), row("B", "0", "5"), row("Z")], fiatBy({ A: 100n, B: 7n, Z: 1n }))
		expect(out).toEqual({ micro: 107n, priced: 2, holdings: 2, partial: false })
	})

	test("an unpriced holding makes the total partial", () => {
		const out = aggregateFiat([row("A", "10"), row("U", "1")], fiatBy({ A: 100n }))
		expect(out).toEqual({ micro: 100n, priced: 1, holdings: 2, partial: true })
	})

	test("a malformed row is a holding with no price → partial, never a throw", () => {
		const out = aggregateFiat([row("A", "10"), row("BAD", "1.5")], fiatBy({ A: 100n, BAD: 999n }))
		expect(out).toEqual({ micro: 100n, priced: 1, holdings: 2, partial: true })
	})

	test("a zero-balance row with invalid decimals is still a malformed holding → partial", () => {
		const bad = { ...row("BAD"), token: { symbol: "BAD", decimals: 500 } }
		expect(aggregateFiat([row("A", "10"), bad], fiatBy({ A: 100n, BAD: 999n }))).toEqual({
			micro: 100n,
			priced: 1,
			holdings: 2,
			partial: true,
		})
	})

	test("nothing held → $0.00 and not partial", () => {
		expect(aggregateFiat([row("A"), row("B")], fiatBy({}))).toEqual({ micro: 0n, priced: 0, holdings: 0, partial: false })
	})
})

describe("aggregateFiat — row reads", () => {
	test("a row without a token but with a parseable balance is a holding with no price", () => {
		const tokenless = { publicBalance: "3", privateBalance: "0" } as unknown as Row
		expect(aggregateFiat([row("A", "10"), tokenless], fiatBy({ A: 100n }))).toEqual({
			micro: 100n,
			priced: 1,
			holdings: 2,
			partial: true,
		})
	})

	test("each balance property is read once per row", () => {
		const reads = { pub: 0, priv: 0 }
		const counted = {
			get publicBalance() {
				reads.pub++
				return "5"
			},
			get privateBalance() {
				reads.priv++
				return "0"
			},
			token: { symbol: "C", decimals: 6 },
		}
		aggregateFiat([counted], () => 1n)
		expect(reads).toEqual({ pub: 1, priv: 1 })
	})
})

describe("isPriceableHolding and pricesUnavailable", () => {
	type Held = { publicBalance: string; privateBalance: string; token: { chainId: number; contract: string; decimals: number } }
	const held = (contract: string, pub = "5"): Held => ({
		publicBalance: pub,
		privateBalance: "0",
		token: { chainId: 1, contract, decimals: 6 },
	})
	const mapping = (mapped: boolean): PriceMapping => ({ mapped: ref(mapped), isPriced: (_chain, contract) => contract === "0xp" })
	const quoted = (micro: Record<string, bigint | undefined>) => (tb: Held) => micro[tb.token.contract]

	test.each([
		{ name: "a priced holding with no quote", rows: [held("0xp")], mapped: true, quotes: {}, priceable: [true], unavailable: true },
		{
			name: "one quote among priced holdings",
			rows: [held("0xp"), held("0xp")],
			mapped: true,
			quotes: { "0xp": 5n },
			priceable: [true, true],
			unavailable: false,
		},
		{ name: "nothing held", rows: [], mapped: true, quotes: {}, priceable: [], unavailable: false },
		{ name: "unpriced holdings only", rows: [held("0xu")], mapped: true, quotes: {}, priceable: [false], unavailable: false },
		{ name: "before the mapping, any holding", rows: [held("0xu")], mapped: false, quotes: {}, priceable: [true], unavailable: true },
		{ name: "a zero balance", rows: [held("0xp", "0")], mapped: true, quotes: {}, priceable: [false], unavailable: false },
	])("$name", ({ rows, mapped, quotes, priceable, unavailable }) => {
		const prices = mapping(mapped)
		expect(rows.map((tb) => isPriceableHolding(tb, prices))).toEqual(priceable)
		expect(pricesUnavailable(rows, quoted(quotes), prices)).toBe(unavailable)
	})
})
