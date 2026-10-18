import { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import { OriginType } from "@/wallet/services/transaction/client"
import { FEE_METHODS } from "@/utils/tx-enrichment"
import { formatGas } from "@/utils/fee-estimation"

export interface GasDetailsRaw {
	feePerL2Gas: string | bigint
	feePerDaGas: string | bigint
	l2GasLimit: number | string
	daGasLimit: number | string
	teardownL2GasLimit: number | string
	teardownDaGasLimit: number | string
}

/** The gas limits already hold the teardown's, so the L2 and DA lines alone add up to the fee limit.
 *  The costs stay in base units for the row to price. */
export interface GasBreakdown {
	l2Gas: string
	daGas: string
	l2Cost: bigint
	daCost: bigint
}

export function buildGasBreakdown(gd: GasDetailsRaw | undefined | null): GasBreakdown | null {
	if (!gd) return null
	return {
		l2Gas: formatGas(Number(gd.l2GasLimit)),
		daGas: formatGas(Number(gd.daGasLimit)),
		l2Cost: BigInt(gd.l2GasLimit) * BigInt(gd.feePerL2Gas),
		daCost: BigInt(gd.daGasLimit) * BigInt(gd.feePerDaGas),
	}
}

export function computeFeeSavings(fee: string | bigint | undefined, estimatedFee: string | bigint | undefined): string | null {
	if (!fee || !estimatedFee) return null
	const actual = BigInt(fee)
	const estimated = BigInt(estimatedFee)
	if (estimated === 0n || actual >= estimated) return null
	const pct = Number(((estimated - actual) * 100n) / estimated)
	return `${pct}% less than estimate`
}

export interface FeePaymentLabelInput {
	feePaymentMethod?: number
	calls?: { method?: string }[]
	origin?: { type: number; name?: string }
}

export function describeFeePaymentMethod(tx: FeePaymentLabelInput | undefined | null): string | null {
	if (!tx) return null
	const method = tx.feePaymentMethod
	if (method === AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE) return "Public Fee Juice"
	if (method === AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM) return "Public Fee Juice (with claim)"
	if (method === AccountFeePaymentMethodOptions.EXTERNAL) {
		const fpcMethod = tx.calls?.find((c) => c.method && FEE_METHODS.has(c.method))?.method
		if (fpcMethod === "sponsor_unconditionally") return "Sponsored"
		if (fpcMethod === "fee_entrypoint_private") return "Private Fee Juice"
		if (fpcMethod === "pay_fee") return "Private Fee Juice"
		if (tx.origin?.type === OriginType.DAPP) return `Set by ${tx.origin.name ?? "the app"}`
		return "External FPC"
	}
	return method !== undefined ? `Unknown (${method})` : null
}
