/**
 * Fiat aggregate over held tokens: Σ balance × price in micro-USD. A zero-balance, unpriced or
 * malformed row adds nothing; a malformed row's price is never read, since its amount is unknown.
 */
import type { Ref } from "vue"
import { type FiatOf, isUnknownParsedRow, parseRawBalance } from "@/utils/token-amount"

export function aggregateFiat<T extends { publicBalance?: string; privateBalance?: string; token?: { decimals?: unknown } }>(
	rows: readonly T[],
	fiatOf: FiatOf<T>,
): bigint {
	let micro = 0n
	for (const tb of rows) {
		const raw = parseRawBalance(tb)
		// Invalid decimals make the row unreadable even when its raw balance parses to zero.
		if (raw === 0n || isUnknownParsedRow(raw, tb)) continue
		micro += fiatOf(tb) ?? 0n
	}
	return micro
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

/** No price answer, nor its rejection, has arrived and a holding could be priced: a figure shown now
 *  would be about to change. An empty or unpriced wallet has nothing to wait for. */
export function awaitingFirstPriceAnswer(rows: readonly Holding[], prices: PriceMapping & { settled: Readonly<Ref<boolean>> }): boolean {
	return !prices.settled.value && rows.some((tb) => isPriceableHolding(tb, prices))
}

/** No priceable holding has a price, whatever the cause: an expired quote, one an answer left out, a
 *  failed fetch. An empty or unpriced wallet has none to miss. */
export function pricesUnavailable<T extends Holding>(rows: readonly T[], fiatOf: FiatOf<T>, prices: PriceMapping): boolean {
	const holdings = rows.filter((tb) => isPriceableHolding(tb, prices))
	return holdings.length > 0 && holdings.every((tb) => fiatOf(tb) === undefined)
}
