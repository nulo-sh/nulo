import { formatListAmount, getDecimalSeparator } from "./amount"

/** The characters an activity row gives a token amount; its compact form folds larger values to K/M/B/T. */
export const ROW_AMOUNT_LENGTH = 8

/**
 * The amount a snack or chip prints, at the list rule's decimals: the activity row's compact form
 * while it spells every whole-number digit (its `<0.000001` hint keeps the one it has), otherwise
 * the uncapped form, never the row's K/M/B/T form.
 */
export function formatSnackAmount(amount: bigint, decimals: number): string {
	const full = formatListAmount(amount, decimals)
	const short = formatListAmount(amount, decimals, ROW_AMOUNT_LENGTH)
	const whole = full.split(getDecimalSeparator())[0] ?? full
	return short.replace(/^</, "").startsWith(whole) ? short : full
}
