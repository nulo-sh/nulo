import { TxSimulationResultWithAppOffset } from "@aztec-labs/aztec.js/wallet"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import {
	PartialPrivateTailPublicInputsForPublic,
	PartialPrivateTailPublicInputsForRollup,
	PrivateCircuitPublicInputs,
	PrivateKernelTailCircuitPublicInputs,
	PrivateToPublicAccumulatedData,
	PrivateToRollupAccumulatedData,
} from "@aztec-labs/stdlib/kernel"
import {
	PrivateCallExecutionResult,
	PrivateExecutionResult,
	PublicSimulationOutput,
	TxEffect,
	type TxSimulationResult,
} from "@aztec-labs/stdlib/tx"

const EMPTY_BUFFER = Buffer.alloc(0)

/**
 * The simulation result a dApp receives: an allowlist rebuilt from the upstream classes, so it
 * still parses as `TxSimulationResultWithAppOffset` and every aztec.js reader keeps working.
 *
 * Kept: each call's return values, offchain effects, call context, args hash, revertible counter
 * and public call requests; the public calldata; the tail's constants, gas, fee payer, expiry and
 * public call requests; the public return values and gas; the stats; the app call offset, read
 * structurally because the fast path's merge builds it in another package. Everything else
 * (bytecode, vks, witnesses, notes, tagging ranges, key validation requests, side effects, the
 * first nullifier, the public tx effect, revert reason and debug logs) comes back empty, and a
 * field upstream adds to the call's public inputs arrives empty.
 */
export function toAppFacingSimulationResult(
	result: TxSimulationResult & { readonly appCallOffset?: number },
): TxSimulationResultWithAppOffset {
	const { entrypoint, publicFunctionCalldata } = result.privateExecutionResult
	return new TxSimulationResultWithAppOffset(
		PrivateExecutionResult.from({ entrypoint: appFacingCall(entrypoint), firstNullifier: Fr.ZERO, publicFunctionCalldata }),
		appFacingTail(result.publicInputs),
		result.publicOutput && appFacingPublicOutput(result.publicOutput),
		result.stats,
		result.appCallOffset,
	)
}

function appFacingCall(call: PrivateCallExecutionResult): PrivateCallExecutionResult {
	const { callContext, argsHash, minRevertibleSideEffectCounter, publicCallRequests } = call.publicInputs
	return PrivateCallExecutionResult.from({
		acir: EMPTY_BUFFER,
		vk: EMPTY_BUFFER,
		partialWitness: new Map(),
		publicInputs: PrivateCircuitPublicInputs.from({
			...PrivateCircuitPublicInputs.empty(),
			callContext,
			argsHash,
			minRevertibleSideEffectCounter,
			publicCallRequests,
		}),
		newNotes: [],
		noteHashNullifierCounterMap: new Map(),
		returnValues: call.returnValues,
		offchainEffects: call.offchainEffects,
		taggingIndexRanges: [],
		nestedExecutionResults: call.nestedExecutionResults.map(appFacingCall),
		contractClassLogs: [],
	})
}

function appFacingTail(tail: PrivateKernelTailCircuitPublicInputs): PrivateKernelTailCircuitPublicInputs {
	const forPublic =
		tail.forPublic &&
		new PartialPrivateTailPublicInputsForPublic(
			callRequestsOnly(tail.forPublic.nonRevertibleAccumulatedData),
			callRequestsOnly(tail.forPublic.revertibleAccumulatedData),
			tail.forPublic.publicTeardownCallRequest,
		)
	const forRollup = tail.forRollup && new PartialPrivateTailPublicInputsForRollup(PrivateToRollupAccumulatedData.empty())
	return new PrivateKernelTailCircuitPublicInputs(
		tail.constants,
		tail.gasUsed,
		tail.feePayer,
		tail.expirationTimestamp,
		forPublic,
		forRollup,
	)
}

function callRequestsOnly(data: PrivateToPublicAccumulatedData): PrivateToPublicAccumulatedData {
	return PrivateToPublicAccumulatedData.from({
		...PrivateToPublicAccumulatedData.empty(),
		publicCallRequests: data.publicCallRequests,
	})
}

function appFacingPublicOutput(output: PublicSimulationOutput): PublicSimulationOutput {
	return new PublicSimulationOutput(undefined, output.globalVariables, TxEffect.empty(), output.publicReturnValues, output.gasUsed, [])
}
