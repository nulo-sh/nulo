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
	UtilityExecutionResult,
} from "@aztec-labs/stdlib/tx"

const EMPTY_BUFFER = Buffer.alloc(0)

/**
 * The simulation answer a dApp receives: only what an app reads, rebuilt from the upstream classes
 * so it still parses as `TxSimulationResultWithAppOffset`; a field upstream adds to a call's public
 * inputs arrives empty. The offset is read structurally because the fast path's merge builds it in
 * another package, and the stats are omitted because they time and count the wallet's own sync too.
 */
export function toAppFacingSimulationResult(
	result: TxSimulationResult & { readonly appCallOffset?: number },
): TxSimulationResultWithAppOffset {
	const { entrypoint, publicFunctionCalldata } = result.privateExecutionResult
	return new TxSimulationResultWithAppOffset(
		PrivateExecutionResult.from({ entrypoint: appFacingCall(entrypoint), firstNullifier: Fr.ZERO, publicFunctionCalldata }),
		appFacingTail(result.publicInputs),
		result.publicOutput && appFacingPublicOutput(result.publicOutput),
		undefined,
		result.appCallOffset,
	)
}

/**
 * The utility answer a dApp receives: the call's return values, its offchain effects and the anchor
 * block's timestamp, which aztec.js stamps on the offchain messages. The stats are omitted, as for a
 * simulation, because they time and count the wallet's own sync.
 */
export function toAppFacingUtilityResult(result: UtilityExecutionResult): UtilityExecutionResult {
	return new UtilityExecutionResult(result.result, result.offchainEffects, result.anchorBlockTimestamp)
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
