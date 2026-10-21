/** Vendor */
import { computed, readonly, ref } from "vue"

/** Composables */
import { useTicker } from "@/composables/ticker"

/** Services */
import type { PriceServiceClient, PriceSnapshot, PriceState, PriceQuote } from "@/wallet/services/price/client"
import { isQuoteFresh } from "@/wallet/services/price/spec"
import { getPriceMapEntry, FEE_JUICE_ENTRY, type PricedTokens } from "@/wallet/services/price/price-map"
import { tokenAmountToUsdMicro, formatUsdMicro } from "@/wallet/services/price/convert"
import { knownDecimals, parseRawBalance, safeFiatOf } from "@/utils/token-amount"
import { isFlaggedToken } from "@/utils/token-flag"

/** A token as pricing reads it: priced only when its decimals are known (`knownDecimals`). */
export type PricedToken = { chainId?: number; contract?: string; decimals?: number; hasDecimals?: boolean }

/** A balance row as pricing reads it. */
type PricedRow = { token?: PricedToken; publicBalance?: string; privateBalance?: string }

/** The signed list's half of every snapshot: which token each id prices and which pairs it flags. */
function listState() {
	/** Which token each id prices. It comes from the signed list, through the worker, with the quotes. */
	const pricedTokens = ref<PricedTokens>({})
	/** The pairs the signed list flags as scams, as `flaggedKeysOf` keys. */
	const flaggedTokens = ref<ReadonlySet<string>>(new Set())
	/** The mapping has arrived. Until then no surface can tell a priced token from an unpriced one. */
	const mapped = ref(false)
	/** Bumped by each full snapshot, a broadcast or a refresh answer: a list read begun before one is older. */
	let adopted = 0

	const adopt = (snapshot: PriceSnapshot) => {
		pricedTokens.value = snapshot.pricedTokens
		flaggedTokens.value = new Set(snapshot.flaggedTokens)
		mapped.value = true
	}
	return {
		pricedTokens,
		flaggedTokens,
		mapped,
		adoptFull(snapshot: PriceSnapshot) {
			adopted++
			adopt(snapshot)
		},
		/** From a read that never touches the network: a refresh can wait on the price provider, and a
		 *  surface must not wait with it to learn what the list says. */
		read(priceService: PriceServiceClient) {
			const before = adopted
			priceService
				.getQuotes()
				.then((snapshot) => {
					if (adopted === before) adopt(snapshot)
				})
				.catch(() => {})
		},
	}
}

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
	const list = listState()
	/** The first price answer has arrived: a refresh result or failure, or a broadcast. */
	const settled = ref(false)
	const now = useTicker(30_000)

	const adopt = (snapshot: PriceSnapshot) => {
		quotes.value = snapshot.quotes
		list.adoptFull(snapshot)
		settled.value = true
	}
	priceService.onQuotesUpdated.add(adopt)

	// Stale-on-connect refresh; the service no-ops when the cache is fresh
	// (and returns {} when fiat display is disabled).
	const resnapshot = () => {
		list.read(priceService)
		priceService
			.refreshIfStale()
			.then(adopt)
			.catch(() => {
				settled.value = true
			})
	}
	resnapshot()
	// A worker restart drops the port and any broadcast sent meanwhile (a new list, the kill-switch).
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
		const entry = getPriceMapEntry(list.pricedTokens.value, chainId, contract)
		if (!entry) return undefined
		return usableQuotes.value[entry.coingeckoId]
	}

	/** The signed list prices this token. False until `mapped`. */
	const isPriced = (chainId: number | undefined, contract: string | undefined): boolean =>
		chainId !== undefined && contract !== undefined && getPriceMapEntry(list.pricedTokens.value, chainId, contract) !== undefined

	/** The signed list flags this token as a scam, on its chain and contract. False until `mapped`. */
	const isFlagged = (token: PricedToken | undefined): boolean => isFlaggedToken(list.flaggedTokens.value, token)

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

	/** A balance row's fiat value (micro-USD), or undefined for an unpriced or malformed row. The
	 *  `0n` is never read: `safeFiatOf` refuses a row whose balance does not parse. */
	const fiatOfRow = safeFiatOf((row: PricedRow) => tokenFiatMicro(row.token, parseRawBalance(row) ?? 0n))

	/** `≈ $1,249.38`-style display string, or undefined when unpriced. */
	const tokenFiatLabel = (token: PricedToken | undefined, raw: bigint): string | undefined => {
		const micro = tokenFiatMicro(token, raw)
		if (micro === undefined) return undefined
		return `≈ ${formatUsdMicro(micro)}`
	}

	const dispose = () => {
		priceService.onQuotesUpdated.remove(adopt)
		priceService.onConnected.remove(resnapshot)
	}

	return {
		usableQuotes,
		settled: readonly(settled),
		mapped: readonly(list.mapped),
		isPriced,
		isFlagged,
		quoteFor,
		feeJuiceQuote,
		tokenFiatMicro,
		fiatOfRow,
		tokenFiatLabel,
		formatUsdMicro,
		dispose,
	}
}

/**
 * The signed list's flags alone, from the network-free read and the worker's broadcasts, for a
 * surface inside transaction execution: it never asks the worker for a price fetch (Privacy Policy
 * § 5.2). Receives the connected client, as `usePrices` does.
 */
export function useTokenFlags(priceService: PriceServiceClient) {
	const list = listState()
	const read = () => list.read(priceService)
	priceService.onQuotesUpdated.add(list.adoptFull)
	priceService.onConnected.add(read)
	read()
	return {
		mapped: readonly(list.mapped),
		/** The signed list flags this token as a scam, on its chain and contract. False until `mapped`. */
		isFlagged: (token: PricedToken | undefined): boolean => isFlaggedToken(list.flaggedTokens.value, token),
		dispose: () => {
			priceService.onQuotesUpdated.remove(list.adoptFull)
			priceService.onConnected.remove(read)
		},
	}
}
