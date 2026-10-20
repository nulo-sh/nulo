import { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import { OriginType } from "@/wallet/services/transaction/client"
import { FEE_METHODS } from "@/utils/tx-enrichment"
import { isPrivateFpc } from "@/wallet/services/fpc/private-fpc-address"

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
	l2Cost: bigint
	daCost: bigint
}

export function buildGasBreakdown(gd: GasDetailsRaw | undefined | null): GasBreakdown | null {
	if (!gd) return null
	return {
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
	calls?: { contract?: string; method?: string }[]
	origin?: { type: number; name?: string }
	feeSpender?: string
	/** Who chose the fee (`Tx.feeChoice`); a row without a known one reads as it did before. */
	feeChoice?: string
}

export function describeFeePaymentMethod(tx: FeePaymentLabelInput | undefined | null): string | null {
	if (!tx) return null
	if (tx.feeChoice === "app" || tx.feeChoice === "app_protocol_sponsor") return describeAppFee(tx)
	const method = tx.feePaymentMethod
	if (method === AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE) return "Public Fee Juice"
	if (method === AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM) return "Public Fee Juice (with claim)"
	if (method === AccountFeePaymentMethodOptions.EXTERNAL) return describeExternalFee(tx)
	return method !== undefined ? `Unknown (${method})` : null
}

function describeExternalFee(tx: FeePaymentLabelInput): string {
	const feeCall = tx.calls?.find((c) => c.method && FEE_METHODS.has(c.method))
	if (feeCall?.method === "sponsor_unconditionally") return "Sponsored"
	// A dApp can name its own fee function `pay_fee`: only the PrivateFPC's charges Private Fee Juice.
	if (feeCall?.method === "pay_fee" && isPrivateFpc(feeCall.contract)) return "Private Fee Juice"
	// A popup Send records only its transfer, so the FPC it paid through is its only fee trace.
	if (!feeCall && tx.origin?.type === OriginType.UI) return isPrivateFpc(tx.feeSpender) ? "Private Fee Juice" : "Sponsored"
	// The person's own pick names no app, whatever the row's origin.
	if (tx.feeChoice === "wallet") return "External FPC"
	if (tx.origin?.type === OriginType.DAPP) return `Set by ${tx.origin.name ?? "the app"}`
	return "External FPC"
}

/** The app's own fee payment. Only a contract address proves a method: the protocol sponsor was
 *  matched when the row was written, the PrivateFPC is matched here against its pinned address. */
function describeAppFee(tx: FeePaymentLabelInput): string | null {
	const method = tx.feePaymentMethod
	const app = tx.origin?.name ?? "the app"
	// The wallet's own entrypoint makes the claim to the sender, so its method is known whoever chose it.
	if (method === AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM) return `Public Fee Juice (with claim), set by ${app}`
	if (method === AccountFeePaymentMethodOptions.EXTERNAL) {
		const proven = provenAppMethod(tx)
		return proven ? `${proven}, set by ${app}` : `Set by ${app}`
	}
	if (method === AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE) return `Set by ${app}`
	return method !== undefined ? `Unknown (${method})` : null
}

function provenAppMethod(tx: FeePaymentLabelInput): string | undefined {
	if (tx.feeChoice === "app_protocol_sponsor") return "Sponsored"
	const charged = tx.calls?.some((c) => (c.method === "pay_fee" || c.method === "mint_and_pay_fee") && isPrivateFpc(c.contract))
	return charged ? "Private Fee Juice" : undefined
}
