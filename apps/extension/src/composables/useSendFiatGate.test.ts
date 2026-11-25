import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { type EffectScope, effectScope, ref } from "vue"
import type { PricedToken } from "@/composables/usePrices"
import { SNAPSHOT_MAX_AGE_MS } from "@/utils/send-fiat-gate"
import type { PriceMapEntry } from "@/wallet/services/price/price-map"
import type { PriceQuote } from "@/wallet/services/price/spec"
import { useSendFiatGate } from "./useSendFiatGate"

const T0 = 1_750_000_000_000
const TOKEN_A = { chainId: 1, contract: "0xa" }
const TOKEN_B = { chainId: 1, contract: "0xb" }
/** Listed with a ticker but no usable quote. */
const TOKEN_UNQUOTED = { chainId: 1, contract: "0xc" }

const scopes: EffectScope[] = []
const keyOf = (chainId: number | undefined, contract: string | undefined) => `${chainId}:${contract}`

function setup() {
	const usd = ref<Record<string, number>>({ "1:0xa": 2, "1:0xb": 5 })
	const tickers: Record<string, string> = { "1:0xa": "AAA", "1:0xb": "BBB", "1:0xc": "CCC" }
	const quoteFor = vi.fn((chainId: number | undefined, contract: string | undefined): PriceQuote | undefined => {
		const key = keyOf(chainId, contract)
		return key in usd.value ? { coingeckoId: key, usd: usd.value[key], fetchedAt: T0, providerUpdatedAt: null } : undefined
	})
	const priceEntryFor = vi.fn((chainId: number | undefined, contract: string | undefined): PriceMapEntry | undefined => {
		const ticker = tickers[keyOf(chainId, contract)]
		return ticker ? ({ coingeckoId: keyOf(chainId, contract), ticker } as unknown as PriceMapEntry) : undefined
	})
	const token = ref<PricedToken | undefined>(TOKEN_A)
	const now = ref<number | undefined>(T0)
	const scope = effectScope()
	scopes.push(scope)
	const gate = scope.run(() => useSendFiatGate({ prices: { quoteFor, priceEntryFor }, token, now }))
	if (!gate) throw new Error("no scope")
	/** USD mode on a session quote frozen at `frozenUsd`, `frozenAt`. */
	const freeze = (frozenUsd = 2, frozenAt = T0) => {
		gate.fiatMode.value = true
		gate.fiatGuard.value = { frozenUsd, frozenAt, converting: false }
	}
	return { usd, quoteFor, priceEntryFor, token, now, gate, freeze }
}

describe("useSendFiatGate", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.setSystemTime(T0)
	})
	afterEach(() => {
		for (const scope of scopes.splice(0)) scope.stop()
		vi.useRealTimers()
	})

	test("the live quote and its proxy ticker are the token's, read on its chain and contract", () => {
		const { gate, quoteFor, priceEntryFor } = setup()
		expect(gate.liveQuote.value?.usd).toBe(2)
		expect(gate.proxyTicker.value).toBe("AAA")
		expect(quoteFor).toHaveBeenCalledWith(1, "0xa")
		expect(priceEntryFor).toHaveBeenCalledWith(1, "0xa")
	})

	test("a token without a usable quote has neither a quote nor a ticker, though the list prices it", () => {
		const { gate, token } = setup()
		token.value = TOKEN_UNQUOTED
		expect(gate.liveQuote.value).toBeNull()
		expect(gate.proxyTicker.value).toBeNull()
		token.value = undefined
		expect(gate.liveQuote.value).toBeNull()
	})

	test("a token change re-reads the quote and the ticker", () => {
		const { gate, token } = setup()
		expect(gate.liveQuote.value?.usd).toBe(2)
		token.value = TOKEN_B
		expect(gate.liveQuote.value?.usd).toBe(5)
		expect(gate.proxyTicker.value).toBe("BBB")
	})

	test("outside USD mode the gate is inert, at the press too, whatever the guard", () => {
		const { gate, usd } = setup()
		gate.fiatGuard.value = { frozenUsd: 2, frozenAt: T0 - SNAPSHOT_MAX_AGE_MS, converting: true }
		usd.value = {}
		expect(gate.fiatQuoteBlocked.value).toBe(false)
		expect(gate.fiatNeedsRequote.value).toBe(false)
		expect(gate.allowsSendNow()).toBe(true)
	})

	test("USD mode without a guard is blocked and asks no requote, at the press too", () => {
		const { gate } = setup()
		gate.fiatMode.value = true
		expect(gate.fiatQuoteBlocked.value).toBe(true)
		expect(gate.fiatNeedsRequote.value).toBe(false)
		expect(gate.allowsSendNow()).toBe(false)
	})

	test("the card's writes are read in the task that makes them: a conversion in flight blocks, asking no requote", () => {
		const { gate, freeze } = setup()
		freeze()
		expect(gate.fiatQuoteBlocked.value).toBe(false)
		gate.fiatGuard.value = { frozenUsd: 2, frozenAt: T0, converting: true }
		expect(gate.fiatGuard.value?.converting).toBe(true)
		expect(gate.fiatQuoteBlocked.value).toBe(true)
		expect(gate.fiatNeedsRequote.value).toBe(false)
		expect(gate.allowsSendNow()).toBe(false)
	})

	test("a snapshot past its age at an unchanged price needs a requote and reads stale, not moved", () => {
		const { gate, freeze } = setup()
		freeze(2, T0 - SNAPSHOT_MAX_AGE_MS)
		expect(gate.fiatQuoteBlocked.value).toBe(true)
		expect(gate.fiatNeedsRequote.value).toBe(true)
		expect(gate.fiatQuoteMoved.value).toBe(false)
	})

	test("a live quote that drifted past the limit needs a requote and reads moved", () => {
		const { gate, freeze, usd } = setup()
		freeze()
		expect(gate.fiatNeedsRequote.value).toBe(false)
		usd.value = { "1:0xa": 2.1 }
		expect(gate.fiatNeedsRequote.value).toBe(true)
		expect(gate.fiatQuoteMoved.value).toBe(true)
		expect(gate.allowsSendNow()).toBe(false)
	})

	test("the reactive gate re-evaluates on each tick: a tick past the snapshot's age blocks it while the wall clock stands", () => {
		const { gate, freeze, now } = setup()
		freeze()
		expect(gate.fiatNeedsRequote.value).toBe(false)
		now.value = T0 + SNAPSHOT_MAX_AGE_MS
		expect(Date.now()).toBe(T0)
		expect(gate.fiatNeedsRequote.value).toBe(true)
	})

	test("the press reads the wall clock: an expiry between ticks refuses the send while the reactive gate still passes", () => {
		const { gate, freeze } = setup()
		freeze()
		vi.setSystemTime(T0 + SNAPSHOT_MAX_AGE_MS)
		expect(gate.fiatQuoteBlocked.value).toBe(false)
		expect(gate.allowsSendNow()).toBe(false)
	})

	test("a fresh guard at the live quote passes, on the ticker and at the press", () => {
		const { gate, freeze } = setup()
		freeze()
		vi.setSystemTime(T0 + SNAPSHOT_MAX_AGE_MS - 1)
		expect(gate.fiatQuoteBlocked.value).toBe(false)
		expect(gate.allowsSendNow()).toBe(true)
	})
})
