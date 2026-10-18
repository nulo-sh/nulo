import { formatBaseUnits } from "@/utils/amount"

/**
 * Aztec Fee Juice has a fixed 18-decimal scale; the wallet does not
 * read this from chain and the value is unlikely to change for the
 * lifetime of the network.
 */
export const FEE_JUICE_DECIMALS = 18

/** Every fee prints at this many of Fee Juice's decimals, rounded half-up. */
export const FEE_DECIMALS = 6

/** One unit of a fee's last printed digit. The worker cuts the queued cap to it and asks again only
 *  for a rise of at least one, so a figure on screen is the figure enforced. */
export const FEE_READOUT_UNIT = 10n ** BigInt(FEE_JUICE_DECIMALS - FEE_DECIMALS)

/** Balances truncate, so a shown balance never exceeds the real one: Send keeps the sub-cent digits
 *  a fee is paid from, Home drops them. */
export const BALANCE_DECIMALS = { send: 4, home: 2 } as const

/** The one Fee Juice balance formatter. */
export function formatGasBalance(raw: string | null | undefined, maxDecimals: number = BALANCE_DECIMALS.send): string {
	return formatBaseUnits(raw ?? "0", FEE_JUICE_DECIMALS, { maxDecimals })
}

type AssetPricing = {
	address: string
	usdRate: number
	symbol: string
	decimals: number
}

/**
 * Live Fee Juice pricing from the price feed's AZTEC quote (1 FJ = 1 AZTEC).
 * `undefined` in → `undefined` out: with no usable quote (stale cache, fiat
 * display disabled, provider down) fee USD is OMITTED, never faked — the old
 * hardcoded 0.02 rate is gone.
 */
function feeJuicePricingFromUsd(usd: number | undefined): AssetPricing | undefined {
	if (usd === undefined || !Number.isFinite(usd) || usd <= 0) return undefined
	return {
		address: "0x0000000000000000000000000000000000000000000000000000000000000005",
		usdRate: usd,
		symbol: "FJ",
		decimals: FEE_JUICE_DECIMALS,
	}
}

/**
 * Half-up round a base-units value to `targetDecimals` precision, returning
 * a bigint at the target scale. Pure bigint — no float, no BN.
 *
 * Example: halfUpRound(3454999999999999n, 18, 6) → 3455n
 *          (= 0.003455 in 6-decimal scale; was 0.003455 with rounding from 18-decimal raw)
 */
function halfUpRound(value: bigint, fromDecimals: number, toDecimals: number): bigint {
	const shift = fromDecimals - toDecimals
	if (shift <= 0) return value
	const divisor = 10n ** BigInt(shift)
	// Half-up only valid for non-negative; fees are always non-negative.
	return (value + divisor / 2n) / divisor
}

/**
 * Format a raw fee amount (18 decimals) for display. Half-up rounded to
 * `maxDecimals` digits, with trailing zeros trimmed. Costs (paid fee /
 * estimated fee) prefer half-up over truncate so the displayed value
 * doesn't systematically understate the actual paid amount.
 */
function formatFeeJuice(amount: bigint, maxDecimals: number = FEE_DECIMALS): string {
	if (amount === 0n) return "0"
	if (maxDecimals < 0) maxDecimals = 0
	if (maxDecimals >= FEE_JUICE_DECIMALS) {
		return formatBaseUnits(amount, FEE_JUICE_DECIMALS)
	}
	const rounded = halfUpRound(amount, FEE_JUICE_DECIMALS, maxDecimals)
	if (rounded === 0n) return "0"
	return formatBaseUnits(rounded, maxDecimals)
}

/** USD rate scaled to 6 decimal precision so we can stay in bigint domain. */
const RATE_SCALE = 1_000_000n

/**
 * Compute USD value from a raw fee amount. Pure bigint via a scaled rate
 * (avoids `Number` precision loss when fees are 18-decimal). Half-up
 * rounded to 3 decimals (`$X.XXX` shape), with the `<$0.001` hint when
 * the unrounded USD value is below $0.001.
 *
 * `pricing` has no default anymore: callers pass a LIVE pricing (see
 * `feeJuicePricingFromUsd`) and get `null` back when none is available —
 * the fee-USD element is omitted, not faked.
 */
function feeToUsd(feeAmount: bigint, pricing: AssetPricing | undefined): string | null {
	if (!pricing) return null
	if (feeAmount === 0n) return "$0.000"
	const scaledRate = BigInt(Math.round(pricing.usdRate * Number(RATE_SCALE)))
	const tokenScale = 10n ** BigInt(pricing.decimals)
	// USD * (RATE_SCALE * tokenScale) = feeAmount * scaledRate
	// USD * 1000 (milli) = feeAmount * scaledRate / (RATE_SCALE * tokenScale / 1000)
	//                    = feeAmount * scaledRate / (1000 * tokenScale)   [since RATE_SCALE = 1e6]
	const milliDivisor = 1_000n * tokenScale
	const num = feeAmount * scaledRate
	// Hint: unrounded USD < 0.001 ⟺ num < milliDivisor
	if (num < milliDivisor) return "<$0.001"
	const usdMilli = (num + milliDivisor / 2n) / milliDivisor
	return `$${formatBaseUnits(usdMilli, 3, { minDecimals: 3, trimTrailingZeros: false })}`
}

/** A fee as every screen prints it: the amount at `FEE_DECIMALS`, and its USD at today's quote, or
 *  null without a usable one. */
export interface FeeDisplay {
	amount: string
	usd: string | null
}

/** `raw` is a fee in base units, as the worker sends it. */
export function feeDisplay(raw: string | bigint, usdPerFeeJuice: number | undefined): FeeDisplay {
	const fee = BigInt(raw)
	return { amount: formatFeeJuice(fee), usd: feeToUsd(fee, feeJuicePricingFromUsd(usdPerFeeJuice)) }
}

/** The figure of the one fee grammar: `~X FJ`. */
export function feeFigure({ amount }: FeeDisplay): string {
	return `~${amount} FJ`
}

/** The one fee grammar, `~X FJ ($Y)`, for a fee inside a string. */
export function feeText(display: FeeDisplay): string {
	return display.usd ? `${feeFigure(display)} (${display.usd})` : feeFigure(display)
}

/** Format a gas amount with thousands separators */
export function formatGas(gas: number): string {
	return gas.toLocaleString("en-US")
}
