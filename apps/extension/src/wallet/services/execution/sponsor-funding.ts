/**
 * Whether the payer of an estimate can cover its fee: the node refuses a transaction whose fee
 * payer's public Fee Juice, plus any setup-phase Fee Juice claim to it, is below
 * the fee limit (`feeLimitOf`: Σ maxFeesPerGas × gasLimits, teardown counted once), and accepts at
 * equality. Nulo builds no claim to a sponsor or to an account paying from its own balance, so the
 * balance alone decides; a sponsor contract that claims to itself during setup can read short.
 */

import { AccountFeePaymentMethodOptions } from "@aztec-labs/entrypoints/account"
import type { PrivateExecutionResult } from "@aztec-labs/stdlib/tx"
import type { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { feeJuiceAddress } from "@/wallet/utils/fee-juice"
import { type PublicStorageReader, readPublicFeeJuiceBalance } from "@/wallet/utils/fee-juice-balance"
import { sameFieldAddress } from "@nulo/wallet-bridge"
import type { FeeEstimate } from "./fee/fee-strategy"
import { feeLimitOf } from "./tx-fee-details"
import type { AppPayerFunding, FeeJuiceShortfall, SponsorFunding } from "./spec"

export const SPONSOR_PROBE_TIMEOUT_MS = 5_000

type ProbeOutcome = "funded" | "short" | "failed"
type ProbeLog = (msg: string, data: { outcome: ProbeOutcome }) => void

/** `payer`'s public Fee Juice and `built`'s fee limit, or `undefined` when the read fails. Logs one
 *  fixed line per probe: an RPC error can carry addresses, figures or the endpoint URL. */
async function readCoverage(
	built: FeeEstimate,
	payer: AztecAddress,
	read: PublicStorageReader,
	log: ProbeLog,
	label: string,
): Promise<{ balance: bigint; limit: bigint } | undefined> {
	let coverage: { balance: bigint; limit: bigint }
	try {
		const balance = await readPublicFeeJuiceBalance(read, built.network, payer, SPONSOR_PROBE_TIMEOUT_MS)
		coverage = { balance, limit: feeLimitOf(built.txRequest) }
	} catch {
		log(label, { outcome: "failed" })
		return undefined
	}
	log(label, { outcome: coverage.balance >= coverage.limit ? "funded" : "short" })
	return coverage
}

async function coversFeeLimit(...args: Parameters<typeof readCoverage>): Promise<boolean | undefined> {
	const coverage = await readCoverage(...args)
	return coverage && coverage.balance >= coverage.limit
}

/** The account's shortfall when it pays from its own public Fee Juice and that balance is below the
 *  fee limit; `undefined` when it covers it, another payer pays, or the read fails. */
export async function probeOwnFeeJuice(
	built: FeeEstimate,
	read: PublicStorageReader,
	log: ProbeLog,
): Promise<FeeJuiceShortfall | undefined> {
	if (built.feePaymentMethod !== AccountFeePaymentMethodOptions.PREEXISTING_FEE_JUICE) return undefined
	const coverage = await readCoverage(built, built.account.address, read, log, "own fee juice probe")
	if (!coverage || coverage.balance >= coverage.limit) return undefined
	return { maxFee: coverage.limit.toString(), balance: coverage.balance.toString() }
}

/** The verdict on `built`'s sponsor, or `undefined` when no sponsor pays or the read fails. */
export async function probeSponsorFunding(
	built: FeeEstimate,
	read: PublicStorageReader,
	log: ProbeLog,
): Promise<SponsorFunding | undefined> {
	const { sponsor } = built
	if (!sponsor) return undefined
	const funded = await coversFeeLimit(built, sponsor.address, read, log, "sponsor probe")
	return funded === undefined ? undefined : { fpcId: sponsor.fpcId, address: sponsor.address.toString(), funded }
}

/** The verdict on the app's own fee contract, or `undefined` when none pays or the read fails. */
export async function probeAppPayerFunding(
	built: FeeEstimate,
	read: PublicStorageReader,
	log: ProbeLog,
): Promise<AppPayerFunding | undefined> {
	const { appPayer } = built
	if (!appPayer) return undefined
	const funded = await coversFeeLimit(built, appPayer.address, read, log, "app payer probe")
	if (funded === undefined) return undefined
	return { address: appPayer.address.toString(), funded, provenShort: !funded && !appPayer.callsFeeJuice }
}

/**
 * Whether any private call of the execution, nested calls included, targets the Fee Juice contract.
 * Only its private `claim` and `claim_and_end_setup` can credit a balance (its one public writer is
 * only-self), so a transaction that makes no such call cannot fund its payer. A missing tree counts
 * as a call.
 */
export function callsFeeJuice(execution: PrivateExecutionResult | undefined): boolean {
	if (!execution?.entrypoint) return true
	const stack = [execution.entrypoint]
	for (let call = stack.pop(); call; call = stack.pop()) {
		const target = call.publicInputs?.callContext?.contractAddress
		if (!target || sameFieldAddress(target.toString(), feeJuiceAddress)) return true
		stack.push(...(call.nestedExecutionResults ?? []))
	}
	return false
}
