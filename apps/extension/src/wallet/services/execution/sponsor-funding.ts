/**
 * Whether the contract that pays an estimate can cover its fee: the node refuses a transaction whose
 * fee payer's public Fee Juice, plus any setup-phase Fee Juice claim to it, is below
 * `gasSettings.getFeeLimit()` (Σ maxFeesPerGas × gasLimits, teardown excluded), and accepts at
 * equality. Nulo builds no claim to a sponsor, so the balance alone decides; a sponsor contract
 * that claims to itself during setup can read short.
 */

import type { PrivateExecutionResult } from "@aztec-labs/stdlib/tx"
import type { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { feeJuiceAddress } from "@/wallet/utils/fee-juice"
import { type PublicStorageReader, readPublicFeeJuiceBalance } from "@/wallet/utils/fee-juice-balance"
import { sameFieldAddress } from "@nulo/wallet-bridge"
import type { FeeEstimate } from "./fee/fee-strategy"
import type { AppPayerFunding, SponsorFunding } from "./spec"

export const SPONSOR_PROBE_TIMEOUT_MS = 5_000

type ProbeOutcome = "funded" | "short" | "failed"
type ProbeLog = (msg: string, data: { outcome: ProbeOutcome }) => void

/** Whether `payer`'s public Fee Juice covers `built`'s fee limit, or `undefined` when the read fails.
 *  Logs one fixed line per probe: an RPC error can carry addresses, figures or the endpoint URL. */
async function coversFeeLimit(
	built: FeeEstimate,
	payer: AztecAddress,
	read: PublicStorageReader,
	log: ProbeLog,
	label: string,
): Promise<boolean | undefined> {
	let funded: boolean
	try {
		const balance = await readPublicFeeJuiceBalance(read, built.network, payer, SPONSOR_PROBE_TIMEOUT_MS)
		funded = balance >= built.txRequest.txContext.gasSettings.getFeeLimit().toBigInt()
	} catch {
		log(label, { outcome: "failed" })
		return undefined
	}
	log(label, { outcome: funded ? "funded" : "short" })
	return funded
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
