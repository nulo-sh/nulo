/**
 * Fiat aggregate over held tokens: Σ balance × price in micro-USD. A zero-balance row is worth
 * exactly $0.00 whether priced or not, so it is neither a holding nor a pricing gap; a malformed
 * row IS a holding with no price, so the total reads as partial rather than complete.
 */
import type { Ref } from "vue"
import { type FiatOf, isUnknownParsedRow, parseRawBalance } from "@/utils/token-amount"

export type Aggregate = { micro: bigint; priced: number; holdings: number; partial: boolean }

export function aggregateFiat<T extends { publicBalance?: string; privateBalance?: string; token?: { decimals?: unknown } }>(
	rows: readonly T[],
	fiatOf: FiatOf<T>,
): Aggregate {
	let micro = 0n
	let priced = 0
	let holdings = 0
	for (const tb of rows) {
		const raw = parseRawBalance(tb)
		// Invalid decimals make the row unreadable even when its raw balance parses to zero.
		const malformed = isUnknownParsedRow(raw, tb)
		if (raw === 0n && !malformed) continue
		holdings += 1
		if (malformed) continue
		const value = fiatOf(tb)
		if (value === undefined) continue
		micro += value
		priced += 1
	}
	return { micro, priced, holdings, partial: priced < holdings }
}

/** What the price predicates read of `usePrices`; the composable itself is passed, so `mapped` is
 *  read where the predicate runs and a computed over it stays reactive. */
export type PriceMapping = {
	mapped: Readonly<Ref<boolean>>
	isPriced(chainId: number | undefined, contract: string | undefined): boolean
}

type Holding = { publicBalance?: string; privateBalance?: string; token?: { chainId?: number; contract?: unknown; decimals?: unknown } }

/** A positive holding a price could cover. Before the mapping arrives, any holding may be priced. */
export function isPriceableHolding(tb: Holding, prices: PriceMapping): boolean {
	const contract = tb.token?.contract
	return (
		typeof contract === "string" &&
		(parseRawBalance(tb) ?? 0n) > 0n &&
		(!prices.mapped.value || prices.isPriced(tb.token?.chainId, contract))
	)
}

/** No priceable holding has a price, whatever the cause: an expired quote, one an answer left out, a
 *  failed fetch. An empty or unpriced wallet has none to miss. */
export function pricesUnavailable<T extends Holding>(rows: readonly T[], fiatOf: FiatOf<T>, prices: PriceMapping): boolean {
	const holdings = rows.filter((tb) => isPriceableHolding(tb, prices))
	return holdings.length > 0 && holdings.every((tb) => fiatOf(tb) === undefined)
}
