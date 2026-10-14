/** Vendor */
import { computed, readonly, ref } from "vue"

/** Composables */
import { useTicker } from "@/composables/ticker"

/** Services */
import type { PriceServiceClient, PriceSnapshot, PriceState, PriceQuote } from "@/wallet/services/price/client"
import { isQuoteFresh } from "@/wallet/services/price/spec"
import { getPriceMapEntry, FEE_JUICE_ENTRY, type PricedTokens } from "@/wallet/services/price/price-map"
import { tokenAmountToUsdMicro, formatUsdMicro } from "@/wallet/services/price/convert"
import { knownDecimals } from "@/utils/token-amount"

/** A token as pricing reads it: priced only when its decimals are known (`knownDecimals`). */
export type PricedToken = { chainId?: number; contract?: string; decimals?: number; hasDecimals?: boolean }

/**
 * C1 composable over the price feed. Receives the CONNECTED client from the
 * parent (which owns connect/disconnect per the composable conventions) and
 * exposes reactive, freshness-aware quotes.
 *
 * Staleness is re-evaluated against a shared 30s ticker, not only on service
 * events — a quote crossing the 15-min TTL flips to absent without any
 * broadcast. Every fiat surface hides rather than showing a stale number.
 */
export function usePrices(priceService: PriceServiceClient) {
	const quotes = ref<PriceState>({})
	/** Which token each id prices. It comes from the signed list, through the worker, with the quotes. */
	const pricedTokens = ref<PricedTokens>({})
	/** The mapping has arrived. Until then no surface can tell a priced token from an unpriced one. */
	const mapped = ref(false)
	/** The first price answer has arrived: a refresh result or failure, or a broadcast. */
	const settled = ref(false)
	const now = useTicker(30_000)

	const onQuotesUpdated = (snapshot: PriceSnapshot) => {
		quotes.value = snapshot.quotes
		pricedTokens.value = snapshot.pricedTokens
		mapped.value = true
		settled.value = true
	}
	priceService.onQuotesUpdated.add(onQuotesUpdated)

	// The mapping first, from a read that never touches the network: a refresh can wait on the price
	// provider, and a surface must not wait with it to learn that a token has no price at all.
	priceService
		.getQuotes()
		.then((snapshot) => {
			if (mapped.value) return
			pricedTokens.value = snapshot.pricedTokens
			mapped.value = true
		})
		.catch(() => {})

	// Stale-on-connect refresh; the service no-ops when the cache is fresh
	// (and returns {} when fiat display is disabled).
	const resnapshot = () => {
		priceService
			.refreshIfStale()
			.then(onQuotesUpdated)
			.catch(() => {
				// Price data is best-effort; surfaces render token-only without it.
				settled.value = true
			})
	}
	resnapshot()
	// Re-snapshot after every reconnect (MV3 SW restarts drop the port): the
	// held quotes and mapping may have changed while we were detached — e.g. the
	// kill-switch flipped from another context, or a new list landed, and we
	// missed the broadcast.
	priceService.onConnected.add(resnapshot)

	/** Fresh usable quotes only (ticker-reactive). */
	const usableQuotes = computed<PriceState>(() => {
		const nowMs = now.value ?? Date.now()
		const usable: PriceState = {}
		for (const [id, quote] of Object.entries(quotes.value)) {
			if (isQuoteFresh(quote, nowMs)) usable[id] = quote
		}
		return usable
	})

	/** Quote for a mapped token, or undefined (unmapped / unpriced / stale / disabled). */
	const quoteFor = (chainId: number | undefined, contract: string | undefined): PriceQuote | undefined => {
		if (chainId === undefined || contract === undefined) return undefined
		const entry = getPriceMapEntry(pricedTokens.value, chainId, contract)
		if (!entry) return undefined
		return usableQuotes.value[entry.coingeckoId]
	}

	/** The signed list prices this token. False until `mapped`. */
	const isPriced = (chainId: number | undefined, contract: string | undefined): boolean =>
		chainId !== undefined && contract !== undefined && getPriceMapEntry(pricedTokens.value, chainId, contract) !== undefined

	/** Fee Juice quote (chain-independent mapping). */
	const feeJuiceQuote = computed<PriceQuote | undefined>(() => usableQuotes.value[FEE_JUICE_ENTRY.coingeckoId])

	/**
	 * Fiat value (micro-USD, summable) of `raw` base units of a token —
	 * undefined when the token has no usable quote.
	 */
	const tokenFiatMicro = (token: PricedToken | undefined, raw: bigint): bigint | undefined => {
		const decimals = knownDecimals(token)
		if (!token || decimals === null) return undefined
		const quote = quoteFor(token.chainId, token.contract)
		if (!quote) return undefined
		return tokenAmountToUsdMicro(raw, decimals, quote.usd)
	}

	/** `≈ $1,249.38`-style display string, or undefined when unpriced. */
	const tokenFiatLabel = (token: PricedToken | undefined, raw: bigint): string | undefined => {
		const micro = tokenFiatMicro(token, raw)
		if (micro === undefined) return undefined
		return `≈ ${formatUsdMicro(micro)}`
	}

	const dispose = () => {
		priceService.onQuotesUpdated.remove(onQuotesUpdated)
		priceService.onConnected.remove(resnapshot)
	}

	return {
		usableQuotes,
		settled: readonly(settled),
		mapped: readonly(mapped),
		isPriced,
		quoteFor,
		feeJuiceQuote,
		tokenFiatMicro,
		tokenFiatLabel,
		formatUsdMicro,
		dispose,
	}
}
