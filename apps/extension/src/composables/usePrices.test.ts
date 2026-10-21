/**
 * `usePrices` composable: reactive quote plumbing (event + initial refresh),
 * price-map resolution, fiat math delegation, ticker-driven staleness, and
 * dispose semantics. The client is faked at the composable's seam.
 */

import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { defineComponent, h } from "vue"
import { EventHandler } from "@nulo/wallet-core/utils"
import { CHAIN_IDS } from "@/utils/chain-ids"
import { QUOTE_TTL_MS, type PriceSnapshot, type PriceState } from "@/wallet/services/price/spec"
import type { PriceServiceClient } from "@/wallet/services/price/client"
import { usePrices, useTokenFlags } from "./usePrices"
import { captureWindowDocument } from "@/utils/window-document"
import { flaggedKeysOf } from "@/utils/token-flag"
import { TEST_FLAGGED, TEST_PRICED_TOKENS, TEST_TOKENS } from "@/wallet/services/token-list/list.fixture"

const TEST_USDC = TEST_TOKENS.USDC

const snap = (quotes: PriceState, { flagged = [TEST_FLAGGED] } = {}): PriceSnapshot => ({
	quotes,
	pricedTokens: TEST_PRICED_TOKENS,
	flaggedTokens: flaggedKeysOf(flagged),
})
/** A row as a restored backup may store it: upper-case hex. */
const FLAGGED_ROW = { chainId: TEST_FLAGGED.chainId, contract: `0x${TEST_FLAGGED.address.slice(2).toUpperCase()}` }

function quoteState(now: number, overrides?: Partial<PriceState>): PriceState {
	return {
		"usd-coin": { coingeckoId: "usd-coin", usd: 0.999857, fetchedAt: now, providerUpdatedAt: null },
		aztec: { coingeckoId: "aztec", usd: 0.0147, fetchedAt: now, providerUpdatedAt: null },
		...overrides,
	}
}

function fakeClient(initial: PriceState = {}) {
	return {
		onQuotesUpdated: new EventHandler<PriceSnapshot>(),
		onConnected: new EventHandler<void>(),
		getQuotes: vi.fn().mockResolvedValue(snap({})),
		refreshIfStale: vi.fn().mockResolvedValue(snap(initial)),
	} as unknown as PriceServiceClient & {
		onQuotesUpdated: EventHandler<PriceSnapshot>
		getQuotes: ReturnType<typeof vi.fn>
		refreshIfStale: ReturnType<typeof vi.fn>
	}
}

/** Mount a host component so useTicker's onUnmounted has a scope. Hosts are
 *  unmounted per-test so the SHARED ticker registry (keyed by period) never
 *  leaks a real-timer interval into a fake-timer test. */
const hosts: { unmount(): void }[] = []
async function withPrices(client: ReturnType<typeof fakeClient>) {
	let api: ReturnType<typeof usePrices> = null as never
	const host = mount(
		defineComponent({
			setup() {
				api = usePrices(client as unknown as PriceServiceClient)
				return () => h("div")
			},
		}),
	)
	hosts.push(host)
	await flushPromises()
	return { api, host }
}

afterEach(() => {
	for (const host of hosts.splice(0)) host.unmount()
	vi.useRealTimers()
})

describe("composables/usePrices", () => {
	test("initial mount refreshes stale-on-connect and adopts the result", async () => {
		const client = fakeClient(quoteState(Date.now()))
		const { api } = await withPrices(client)
		expect(client.refreshIfStale).toHaveBeenCalledTimes(1)
		expect(Object.keys(api.usableQuotes.value).sort()).toEqual(["aztec", "usd-coin"])
	})

	test("settled turns true on the first price answer: a refresh that resolves or rejects, or a broadcast", async () => {
		let answer: (state: PriceSnapshot) => void = () => {}
		const held = fakeClient()
		held.refreshIfStale.mockReturnValue(
			new Promise<PriceSnapshot>((resolve) => {
				answer = resolve
			}),
		)
		const { api } = await withPrices(held)
		expect(api.settled.value).toBe(false)
		answer(snap({}))
		await flushPromises()
		expect(api.settled.value).toBe(true)

		const failed = fakeClient()
		failed.refreshIfStale.mockRejectedValue(new Error("offline"))
		expect((await withPrices(failed)).api.settled.value).toBe(true)

		const broadcast = fakeClient()
		broadcast.refreshIfStale.mockReturnValue(new Promise(() => {}))
		const { api: live } = await withPrices(broadcast)
		expect(live.settled.value).toBe(false)
		broadcast.onQuotesUpdated.invoke(snap(quoteState(Date.now())))
		expect(live.settled.value).toBe(true)
	})

	test("the mapping arrives from the network-free read before the refresh answers", async () => {
		const client = fakeClient()
		client.refreshIfStale.mockReturnValue(new Promise(() => {}))
		const { api } = await withPrices(client)
		expect(api.settled.value).toBe(false)
		expect(api.mapped.value).toBe(true)
		expect(api.isPriced(CHAIN_IDS.TESTNET, TEST_USDC)).toBe(true)
		expect(api.isPriced(CHAIN_IDS.TESTNET, TEST_TOKENS.GBPC)).toBe(false)
	})

	test("the list's flags arrive from the network-free read while the refresh waits, and a broadcast replaces them", async () => {
		const client = fakeClient()
		client.refreshIfStale.mockReturnValue(new Promise(() => {}))
		const { api } = await withPrices(client)
		expect(api.isFlagged(FLAGGED_ROW)).toBe(true)
		expect(api.isFlagged({ chainId: CHAIN_IDS.TESTNET, contract: TEST_USDC })).toBe(false)

		client.onQuotesUpdated.invoke(snap({}, { flagged: [] }))
		expect(api.isFlagged(FLAGGED_ROW)).toBe(false)
	})

	test("a reconnect reads the list again without waiting on the refresh; a read older than a broadcast is dropped", async () => {
		const client = fakeClient()
		client.getQuotes.mockResolvedValue(snap({}, { flagged: [] }))
		client.refreshIfStale.mockResolvedValue(snap({}, { flagged: [] }))
		const { api } = await withPrices(client)
		expect(api.isFlagged(FLAGGED_ROW)).toBe(false)

		client.getQuotes.mockResolvedValue(snap({}))
		client.refreshIfStale.mockReturnValue(new Promise(() => {}))
		;(client as unknown as { onConnected: EventHandler<void> }).onConnected.invoke()
		await flushPromises()
		expect(api.isFlagged(FLAGGED_ROW)).toBe(true)

		let answer: (s: PriceSnapshot) => void = () => {}
		client.getQuotes.mockReturnValue(new Promise<PriceSnapshot>((resolve) => (answer = resolve)))
		;(client as unknown as { onConnected: EventHandler<void> }).onConnected.invoke()
		client.onQuotesUpdated.invoke(snap({}, { flagged: [] }))
		answer(snap({}))
		await flushPromises()
		expect(api.isFlagged(FLAGGED_ROW)).toBe(false)
	})

	test("a refreshIfStale rejection is swallowed (surfaces render token-only)", async () => {
		const client = fakeClient()
		client.refreshIfStale.mockRejectedValue(new Error("offline"))
		const { api } = await withPrices(client)
		expect(api.usableQuotes.value).toEqual({})
	})

	test("onQuotesUpdated events replace the quote state", async () => {
		const client = fakeClient()
		const { api } = await withPrices(client)
		expect(api.usableQuotes.value).toEqual({})
		client.onQuotesUpdated.invoke(snap(quoteState(Date.now())))
		expect(api.usableQuotes.value["usd-coin"]).toBeDefined()
	})

	test("an empty broadcast (kill-switch) clears every quote", async () => {
		const client = fakeClient(quoteState(Date.now()))
		const { api } = await withPrices(client)
		client.onQuotesUpdated.invoke(snap({}))
		expect(api.usableQuotes.value).toEqual({})
	})

	test("quoteFor resolves tokens through the mapping the worker sent", async () => {
		const client = fakeClient(quoteState(Date.now()))
		const { api } = await withPrices(client)
		expect(api.quoteFor(CHAIN_IDS.TESTNET, TEST_USDC)?.coingeckoId).toBe("usd-coin")
		// Case-insensitive contract match.
		expect(api.quoteFor(CHAIN_IDS.TESTNET, TEST_USDC.toUpperCase().replace("0X", "0x"))?.coingeckoId).toBe("usd-coin")
	})

	test("quoteFor is undefined for unmapped tokens and missing args", async () => {
		const client = fakeClient(quoteState(Date.now()))
		const { api } = await withPrices(client)
		expect(api.quoteFor(CHAIN_IDS.TESTNET, "0xdeadbeef")).toBeUndefined()
		expect(api.quoteFor(12345, TEST_USDC)).toBeUndefined()
		expect(api.quoteFor(undefined, undefined)).toBeUndefined()
	})

	test("feeJuiceQuote resolves the chain-independent aztec mapping", async () => {
		const client = fakeClient(quoteState(Date.now()))
		const { api } = await withPrices(client)
		expect(api.feeJuiceQuote.value?.usd).toBe(0.0147)
	})

	test("tokenFiatMicro computes bigint fiat for a priced token, undefined otherwise", async () => {
		const client = fakeClient(quoteState(Date.now()))
		const { api } = await withPrices(client)
		const token = { chainId: CHAIN_IDS.TESTNET, contract: TEST_USDC, decimals: 18, hasDecimals: true }
		expect(api.tokenFiatMicro(token, 1_250n * 10n ** 18n)).toBe(1_249_821_250n)
		expect(api.tokenFiatMicro({ chainId: 1, contract: "0x1", decimals: 18, hasDecimals: true }, 10n ** 18n)).toBeUndefined()
		expect(api.tokenFiatMicro(undefined, 10n ** 18n)).toBeUndefined()
	})

	test("fiatOfRow prices both sides of a well-formed row, and no malformed one", async () => {
		const client = fakeClient(quoteState(Date.now()))
		const { api } = await withPrices(client)
		const token = { chainId: CHAIN_IDS.TESTNET, contract: TEST_USDC, decimals: 18, hasDecimals: true }
		const unit = 10n ** 18n
		expect(api.fiatOfRow({ token, publicBalance: (250n * unit).toString(), privateBalance: (1_000n * unit).toString() })).toBe(
			1_249_821_250n,
		)
		expect(api.fiatOfRow({ token, publicBalance: "1e18", privateBalance: "0" })).toBeUndefined()
		expect(api.fiatOfRow({ token: { ...token, decimals: 78 }, publicBalance: "1" })).toBeUndefined()
	})

	test("a priced token whose decimals the wallet does not know has no fiat; known, it has", async () => {
		const client = fakeClient(quoteState(Date.now()))
		const { api } = await withPrices(client)
		const token = { chainId: CHAIN_IDS.TESTNET, contract: TEST_USDC, decimals: 0, hasDecimals: false }
		expect(api.tokenFiatMicro(token, 1_250n)).toBeUndefined()
		expect(api.tokenFiatLabel(token, 1_250n)).toBeUndefined()
		expect(api.tokenFiatMicro({ ...token, hasDecimals: true }, 1_250n)).toBe(1_249_821_250n)
	})

	test("tokenFiatLabel renders the ≈-prefixed display string", async () => {
		const client = fakeClient(quoteState(Date.now()))
		const { api } = await withPrices(client)
		const token = { chainId: CHAIN_IDS.TESTNET, contract: TEST_USDC, decimals: 18, hasDecimals: true }
		expect(api.tokenFiatLabel(token, 1_250n * 10n ** 18n)).toBe("≈ $1,249.82")
		expect(api.tokenFiatLabel({ chainId: 1, contract: "0x1", decimals: 18, hasDecimals: true }, 1n)).toBeUndefined()
	})

	test("staleness flips reactively via the ticker — a quote crossing the TTL disappears", async () => {
		vi.useFakeTimers()
		const now = Date.now()
		// One quote 30s from expiry, one far from it.
		const client = fakeClient(
			quoteState(now, {
				"usd-coin": { coingeckoId: "usd-coin", usd: 0.999857, fetchedAt: now - QUOTE_TTL_MS + 30_000, providerUpdatedAt: null },
			}),
		)
		const { api } = await withPrices(client)
		expect(api.usableQuotes.value["usd-coin"]).toBeDefined()

		await vi.advanceTimersByTimeAsync(61_000) // two ticker periods past expiry
		expect(api.usableQuotes.value["usd-coin"]).toBeUndefined()
		expect(api.usableQuotes.value.aztec).toBeDefined()
	})

	test("dispose unsubscribes from quote events", async () => {
		const client = fakeClient()
		const { api } = await withPrices(client)
		api.dispose()
		client.onQuotesUpdated.invoke(snap(quoteState(Date.now())))
		expect(api.usableQuotes.value).toEqual({})
	})

	test("client RECONNECT re-snapshots: quotes invalidated while detached are dropped (kill-switch honored)", async () => {
		const client = fakeClient(quoteState(Date.now()))
		const { api } = await withPrices(client)
		expect(Object.keys(api.usableQuotes.value)).toHaveLength(2)

		// While the port was down, fiat was disabled elsewhere — the new SW
		// returns {} on the reconnect resnapshot.
		client.refreshIfStale.mockResolvedValue(snap({}))
		;(client as unknown as { onConnected: EventHandler<void> }).onConnected.invoke()
		await flushPromises()

		expect(api.usableQuotes.value).toEqual({})
	})

	test("client RECONNECT re-snapshots the mapping: a token a new list stopped pricing loses its quote", async () => {
		const client = fakeClient(quoteState(Date.now()))
		const { api } = await withPrices(client)
		expect(api.quoteFor(CHAIN_IDS.TESTNET, TEST_USDC)).toBeDefined()

		client.refreshIfStale.mockResolvedValue({ quotes: quoteState(Date.now()), pricedTokens: {} })
		;(client as unknown as { onConnected: EventHandler<void> }).onConnected.invoke()
		await flushPromises()

		expect(api.quoteFor(CHAIN_IDS.TESTNET, TEST_USDC)).toBeUndefined()
		expect(api.usableQuotes.value["usd-coin"]).toBeDefined()
	})
})

describe("composables/usePrices in a window document", () => {
	beforeEach(() => captureWindowDocument("#/windows/execute?requestId=r1"))
	afterEach(() => captureWindowDocument(""))
	const reconnect = (client: ReturnType<typeof fakeClient>) =>
		(client as unknown as { onConnected: EventHandler<void> }).onConnected.invoke()

	test("mount and every reconnect read the cache whole and never ask for a refresh; a broadcast is adopted", async () => {
		const client = fakeClient()
		client.getQuotes.mockResolvedValue(snap(quoteState(Date.now())))
		const { api } = await withPrices(client)
		expect(client.getQuotes).toHaveBeenCalledTimes(1)
		expect(Object.keys(api.usableQuotes.value).sort()).toEqual(["aztec", "usd-coin"])
		expect(api.isFlagged(FLAGGED_ROW)).toBe(true)
		expect(api.settled.value).toBe(true)

		client.getQuotes.mockResolvedValue(snap({}, { flagged: [] }))
		reconnect(client)
		await flushPromises()
		expect(client.getQuotes).toHaveBeenCalledTimes(2)
		expect(api.usableQuotes.value).toEqual({})
		expect(api.isFlagged(FLAGGED_ROW)).toBe(false)

		client.onQuotesUpdated.invoke(snap(quoteState(Date.now())))
		expect(api.quoteFor(CHAIN_IDS.TESTNET, TEST_USDC)).toBeDefined()
		expect(client.refreshIfStale).not.toHaveBeenCalled()
	})

	test("a cache read begun before a broadcast is dropped, and a failed one settles token-only", async () => {
		const client = fakeClient()
		let answer: (s: PriceSnapshot) => void = () => {}
		client.getQuotes.mockReturnValue(new Promise<PriceSnapshot>((resolve) => (answer = resolve)))
		const { api } = await withPrices(client)
		expect(api.settled.value).toBe(false)
		client.onQuotesUpdated.invoke(snap(quoteState(Date.now()), { flagged: [] }))
		answer(snap({}))
		await flushPromises()
		expect(Object.keys(api.usableQuotes.value)).toHaveLength(2)
		expect(api.isFlagged(FLAGGED_ROW)).toBe(false)

		const failed = fakeClient()
		failed.getQuotes.mockRejectedValue(new Error("worker gone"))
		const { api: offline } = await withPrices(failed)
		expect(offline.settled.value).toBe(true)
		expect(offline.usableQuotes.value).toEqual({})
		expect(client.refreshIfStale).not.toHaveBeenCalled()
		expect(failed.refreshIfStale).not.toHaveBeenCalled()
	})
})

describe("composables/useTokenFlags", () => {
	const reconnect = (client: ReturnType<typeof fakeClient>) =>
		(client as unknown as { onConnected: EventHandler<void> }).onConnected.invoke()

	test("flags come from the network-free read, on mount and on every reconnect, and no refresh is ever asked", async () => {
		const client = fakeClient()
		const flags = useTokenFlags(client as unknown as PriceServiceClient)
		expect(flags.mapped.value).toBe(false)
		expect(flags.isFlagged(FLAGGED_ROW)).toBe(false)
		await flushPromises()
		expect(flags.mapped.value).toBe(true)
		expect(flags.isFlagged(FLAGGED_ROW)).toBe(true)
		expect(flags.isFlagged({ chainId: CHAIN_IDS.TESTNET, contract: TEST_USDC })).toBe(false)
		expect(flags.isFlagged(undefined)).toBe(false)

		client.getQuotes.mockResolvedValue(snap({}, { flagged: [] }))
		reconnect(client)
		await flushPromises()
		expect(flags.isFlagged(FLAGGED_ROW)).toBe(false)
		expect(client.getQuotes).toHaveBeenCalledTimes(2)
		expect(client.refreshIfStale).not.toHaveBeenCalled()
	})

	test("a broadcast replaces the flags, and a read begun before it is dropped", async () => {
		const client = fakeClient()
		let answer: (s: PriceSnapshot) => void = () => {}
		client.getQuotes.mockReturnValue(new Promise<PriceSnapshot>((resolve) => (answer = resolve)))
		const flags = useTokenFlags(client as unknown as PriceServiceClient)
		client.onQuotesUpdated.invoke(snap({}, { flagged: [] }))
		expect(flags.mapped.value).toBe(true)
		answer(snap({}))
		await flushPromises()
		expect(flags.isFlagged(FLAGGED_ROW)).toBe(false)

		client.onQuotesUpdated.invoke(snap({}))
		expect(flags.isFlagged(FLAGGED_ROW)).toBe(true)
	})

	test("a failed read leaves the list unmapped, so nothing reads as flagged or cleared", async () => {
		const client = fakeClient()
		client.getQuotes.mockRejectedValue(new Error("worker gone"))
		const flags = useTokenFlags(client as unknown as PriceServiceClient)
		await flushPromises()
		expect(flags.mapped.value).toBe(false)
		expect(flags.isFlagged(FLAGGED_ROW)).toBe(false)
	})

	test("dispose stops both the broadcast and the reconnect read", async () => {
		const client = fakeClient()
		client.getQuotes.mockResolvedValue(snap({}, { flagged: [] }))
		const flags = useTokenFlags(client as unknown as PriceServiceClient)
		await flushPromises()
		flags.dispose()
		client.onQuotesUpdated.invoke(snap({}))
		client.getQuotes.mockResolvedValue(snap({}))
		reconnect(client)
		await flushPromises()
		expect(flags.isFlagged(FLAGGED_ROW)).toBe(false)
		expect(client.getQuotes).toHaveBeenCalledTimes(1)
	})
})
