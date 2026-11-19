import { describe, expect, test } from "vitest"
import { ref } from "vue"
import { aggregateFiat, awaitingFirstPriceAnswer, isPriceableHolding, type PriceMapping, pricesUnavailable } from "./token-aggregate"

type Row = { publicBalance?: string; privateBalance?: string; token: { symbol: string; decimals: number } }
const row = (symbol: string, pub = "0", priv = "0"): Row => ({ publicBalance: pub, privateBalance: priv, token: { symbol, decimals: 6 } })
const fiatBy = (prices: Record<string, bigint>) => (tb: Row) => prices[tb.token.symbol]

describe("aggregateFiat", () => {
	test("sums priced holdings; a zero row adds nothing whatever its price", () => {
		expect(aggregateFiat([row("A", "10"), row("B", "0", "5"), row("Z")], fiatBy({ A: 100n, B: 7n, Z: 1n }))).toBe(107n)
	})

	test("an unpriced holding adds nothing", () => {
		expect(aggregateFiat([row("A", "10"), row("U", "1")], fiatBy({ A: 100n }))).toBe(100n)
	})

	test("a malformed row adds nothing, even when its token has a price, and never throws", () => {
		expect(aggregateFiat([row("A", "10"), row("BAD", "1.5")], fiatBy({ A: 100n, BAD: 999n }))).toBe(100n)
	})

	test("nothing held → $0.00", () => {
		expect(aggregateFiat([row("A"), row("B")], fiatBy({}))).toBe(0n)
	})
})

describe("aggregateFiat — row reads", () => {
	test("a row without a token but with a parseable balance adds nothing", () => {
		const tokenless = { publicBalance: "3", privateBalance: "0" } as unknown as Row
		expect(aggregateFiat([row("A", "10"), tokenless], fiatBy({ A: 100n }))).toBe(100n)
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

describe("isPriceableHolding, pricesUnavailable and awaitingFirstPriceAnswer", () => {
	type Held = { publicBalance: string; privateBalance: string; token: { chainId: number; contract: string; decimals: number } }
	const held = (contract: string, pub = "5"): Held => ({
		publicBalance: pub,
		privateBalance: "0",
		token: { chainId: 1, contract, decimals: 6 },
	})
	const mapping = (mapped: boolean): PriceMapping => ({
		mapped: ref(mapped),
		isPriced: (_chain, contract) => contract === "0xp" || contract === "0xq",
	})
	const quoted = (micro: Record<string, bigint | undefined>) => (tb: Held) => micro[tb.token.contract]

	test.each([
		{
			name: "a priced holding with no quote",
			rows: [held("0xp")],
			mapped: true,
			quotes: {},
			priceable: [true],
			unavailable: true,
			awaiting: true,
		},
		{
			name: "one quote among priced holdings",
			rows: [held("0xp"), held("0xq")],
			mapped: true,
			quotes: { "0xp": 5n },
			priceable: [true, true],
			unavailable: false,
			awaiting: true,
		},
		{ name: "nothing held", rows: [], mapped: true, quotes: {}, priceable: [], unavailable: false, awaiting: false },
		{
			name: "unpriced holdings only",
			rows: [held("0xu")],
			mapped: true,
			quotes: {},
			priceable: [false],
			unavailable: false,
			awaiting: false,
		},
		{
			name: "before the mapping, any holding",
			rows: [held("0xu")],
			mapped: false,
			quotes: {},
			priceable: [true],
			unavailable: true,
			awaiting: true,
		},
		{
			name: "a zero balance",
			rows: [held("0xp", "0")],
			mapped: true,
			quotes: {},
			priceable: [false],
			unavailable: false,
			awaiting: false,
		},
	])("$name", ({ rows, mapped, quotes, priceable, unavailable, awaiting }) => {
		const prices = mapping(mapped)
		expect(rows.map((tb) => isPriceableHolding(tb, prices))).toEqual(priceable)
		expect(pricesUnavailable(rows, quoted(quotes), prices)).toBe(unavailable)
		expect(awaitingFirstPriceAnswer(rows, { ...prices, settled: ref(false) })).toBe(awaiting)
	})

	test("once the first price answer or its rejection is in, no holding waits for one", () => {
		expect(awaitingFirstPriceAnswer([held("0xp")], { ...mapping(true), settled: ref(true) })).toBe(false)
		expect(awaitingFirstPriceAnswer([held("0xu")], { ...mapping(false), settled: ref(true) })).toBe(false)
	})
})
