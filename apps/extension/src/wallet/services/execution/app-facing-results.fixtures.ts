import { TxSimulationResultWithAppOffset } from "@aztec-labs/aztec.js/wallet"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import { FunctionSelector, NoteSelector } from "@aztec-labs/stdlib/abi"
import { AztecAddress } from "@aztec-labs/stdlib/aztec-address"
import { SimulationError } from "@aztec-labs/stdlib/errors"
import { Gas } from "@aztec-labs/stdlib/gas"
import {
	CountedPublicCallRequest,
	KeyValidationRequest,
	KeyValidationRequestAndSeparator,
	NoteHash,
	Nullifier,
	PartialPrivateTailPublicInputsForPublic,
	PartialPrivateTailPublicInputsForRollup,
	PrivateCircuitPublicInputs,
	PrivateKernelTailCircuitPublicInputs,
	PrivateCallRequest,
	PrivateLogData,
	PrivateToPublicAccumulatedData,
	PrivateToRollupAccumulatedData,
	PublicCallRequest,
	ReadRequest,
	ScopedReadRequest,
} from "@aztec-labs/stdlib/kernel"
import { AppTaggingSecret, ContractClassLog, ContractClassLogFields, DebugLog, PrivateLog } from "@aztec-labs/stdlib/logs"
import { Note } from "@aztec-labs/stdlib/note"
import {
	BlockHeader,
	CallContext,
	CountedContractClassLog,
	GlobalVariables,
	HashedValues,
	NestedProcessReturnValues,
	NoteAndSlot,
	PrivateCallExecutionResult,
	PrivateExecutionResult,
	PublicSimulationOutput,
	type SimulationStats,
	TxConstantData,
	TxContext,
	TxEffect,
	TxSimulationResult,
} from "@aztec-labs/stdlib/tx"

/** A simulation result with a unique value in each populated field the app-facing shape drops. */
export interface SimulationFixture {
	result: TxSimulationResult
	/** The dropped field elements, as 64 hex digits: how they read in a field's JSON and inside a buffer. */
	droppedFields: string[]
	droppedCounters: number[]
	droppedStrings: string[]
}

export interface SimulationFixtureOptions {
	tail: "public" | "rollup"
	publicOutput: boolean
	appCallOffset?: number
}

const ACCOUNT = AztecAddress.fromBigIntUnsafe(0xa1n)
const APP = AztecAddress.fromBigIntUnsafe(0xa2n)
const NESTED = AztecAddress.fromBigIntUnsafe(0xa3n)

/**
 * The app call (depth 1) returns 41 and the call it makes (depth 2) returns 42. Kept values are
 * small and each dropped one is unique, so a dropped value on the wire names the field kept by mistake.
 */
export function simulationFixture(opts: SimulationFixtureOptions): SimulationFixture {
	const droppedFields: Fr[] = []
	const droppedCounters: number[] = []
	const drop = (): Fr => {
		const fr = new Fr(0x5e47_0000_0000n + BigInt(droppedFields.length + 1))
		droppedFields.push(fr)
		return fr
	}
	const dropCounter = (): number => {
		const counter = 7_340_000 + droppedCounters.length + 1
		droppedCounters.push(counter)
		return counter
	}

	const call = (
		msgSender: AztecAddress,
		contract: AztecAddress,
		seed: number,
		returnValues: Fr[],
		nested: PrivateCallExecutionResult[],
	): PrivateCallExecutionResult =>
		PrivateCallExecutionResult.from({
			acir: drop().toBuffer(),
			vk: drop().toBuffer(),
			partialWitness: new Map([[1, drop().toString()]]),
			publicInputs: callPublicInputs(msgSender, contract, seed, drop),
			newNotes: [new NoteAndSlot(new Note([drop()]), drop(), drop(), NoteSelector.fromField(new Fr(seed)))],
			noteHashNullifierCounterMap: new Map([[dropCounter(), dropCounter()]]),
			returnValues,
			offchainEffects: [{ data: [new Fr(seed + 500)] }],
			taggingIndexRanges: [{ extendedSecret: new AppTaggingSecret(drop(), contract), lowestIndex: 3, highestIndex: 5 }],
			nestedExecutionResults: nested,
			contractClassLogs: [new CountedContractClassLog(new ContractClassLog(contract, classLogFields(drop), 1), 9)],
		})

	const depth2 = call(APP, NESTED, 300, [new Fr(42)], [])
	const depth1 = call(ACCOUNT, APP, 200, [new Fr(41)], [depth2])
	const root = call(AztecAddress.ZERO, ACCOUNT, 100, [], [depth1])

	const privateExecutionResult = PrivateExecutionResult.from({
		entrypoint: root,
		firstNullifier: drop(),
		publicFunctionCalldata: [new HashedValues([new Fr(61)], new Fr(62))],
	})
	const publicInputs = opts.tail === "public" ? publicTail(drop) : rollupTail(drop)
	const droppedStrings = opts.publicOutput ? ["dropped-revert-reason", "dropped-debug-log"] : []
	const publicOutput = opts.publicOutput
		? new PublicSimulationOutput(
				new SimulationError(droppedStrings[0], []),
				GlobalVariables.empty({ timestamp: 4_321n }),
				TxEffect.from({
					...TxEffect.empty(),
					noteHashes: [drop()],
					nullifiers: [drop()],
					l2ToL1Msgs: [drop()],
					privateLogs: [privateLog(drop)],
				}),
				[new NestedProcessReturnValues([new Fr(71)])],
				{ totalGas: new Gas(1, 2), publicGas: new Gas(3, 4), teardownGas: new Gas(5, 6), billedGas: new Gas(7, 8) },
				[new DebugLog(APP, "info", droppedStrings[1], [drop()])],
			)
		: undefined
	const stats: SimulationStats = {
		timings: { sync: 1, perFunction: [{ functionName: "transfer", time: 2 }], unaccounted: 3, total: 6 },
		nodeRPCCalls: {
			perMethod: { getBlockNumber: { times: [4] } },
			roundTrips: { roundTrips: 0, totalBlockingTime: 0, roundTripDurations: [], roundTripMethods: [] },
		},
	}
	const result =
		opts.appCallOffset === undefined
			? new TxSimulationResult(privateExecutionResult, publicInputs, publicOutput, stats)
			: new TxSimulationResultWithAppOffset(privateExecutionResult, publicInputs, publicOutput, stats, opts.appCallOffset)
	return { result, droppedFields: droppedFields.map(hexDigits), droppedCounters, droppedStrings }
}

function callPublicInputs(msgSender: AztecAddress, contract: AztecAddress, seed: number, drop: () => Fr): PrivateCircuitPublicInputs {
	const pi = PrivateCircuitPublicInputs.empty()
	pi.callContext = new CallContext(msgSender, contract, FunctionSelector.fromField(new Fr(seed + 1)), false)
	pi.argsHash = new Fr(seed + 2)
	pi.minRevertibleSideEffectCounter = new Fr(seed + 3)
	pi.publicCallRequests.array[0] = new CountedPublicCallRequest(new PublicCallRequest(contract, contract, false, new Fr(seed + 4)), 5)
	pi.publicCallRequests.claimedLength = 1
	pi.returnsHash = drop()
	pi.protocolNullifier = drop()
	pi.privateCallRequests.array[0] = new PrivateCallRequest(pi.callContext, drop(), drop(), 6, 7)
	pi.privateCallRequests.claimedLength = 1
	pi.keyValidationRequestsAndSeparators.array[0] = new KeyValidationRequestAndSeparator(new KeyValidationRequest(drop(), drop()), drop())
	pi.keyValidationRequestsAndSeparators.claimedLength = 1
	pi.noteHashReadRequests.array[0] = new ScopedReadRequest(new ReadRequest(drop(), 1), contract)
	pi.noteHashReadRequests.claimedLength = 1
	pi.noteHashes.array[0] = new NoteHash(drop(), 2)
	pi.noteHashes.claimedLength = 1
	pi.nullifiers.array[0] = new Nullifier(drop(), drop(), 3)
	pi.nullifiers.claimedLength = 1
	pi.privateLogs.array[0] = new PrivateLogData(privateLog(drop), 2, 4)
	pi.privateLogs.claimedLength = 1
	return pi
}

function publicTail(drop: () => Fr): PrivateKernelTailCircuitPublicInputs {
	const phase = (seed: number): PrivateToPublicAccumulatedData => {
		const data = PrivateToPublicAccumulatedData.empty()
		data.noteHashes[0] = drop()
		data.nullifiers[0] = drop()
		data.privateLogs[0] = privateLog(drop)
		data.publicCallRequests[0] = new PublicCallRequest(ACCOUNT, APP, false, new Fr(seed))
		return data
	}
	const teardown = new PublicCallRequest(ACCOUNT, APP, false, new Fr(83))
	return tail(new PartialPrivateTailPublicInputsForPublic(phase(81), phase(82), teardown), undefined)
}

function rollupTail(drop: () => Fr): PrivateKernelTailCircuitPublicInputs {
	const end = PrivateToRollupAccumulatedData.empty()
	end.noteHashes[0] = drop()
	end.nullifiers[0] = drop()
	end.privateLogs[0] = privateLog(drop)
	return tail(undefined, new PartialPrivateTailPublicInputsForRollup(end))
}

function tail(
	forPublic: PartialPrivateTailPublicInputsForPublic | undefined,
	forRollup: PartialPrivateTailPublicInputsForRollup | undefined,
): PrivateKernelTailCircuitPublicInputs {
	const anchor = BlockHeader.empty({ globalVariables: GlobalVariables.empty({ timestamp: 1_234n }) })
	return new PrivateKernelTailCircuitPublicInputs(
		new TxConstantData(anchor, TxContext.empty(31, 32), new Fr(33), new Fr(34)),
		new Gas(10, 20),
		ACCOUNT,
		999n,
		forPublic,
		forRollup,
	)
}

function classLogFields(drop: () => Fr): ContractClassLogFields {
	const fields = ContractClassLogFields.empty()
	fields.fields[0] = drop()
	return fields
}

function privateLog(drop: () => Fr): PrivateLog {
	const log = PrivateLog.empty()
	log.fields[0] = drop()
	log.emittedLength = 1
	return log
}

function hexDigits(fr: Fr): string {
	return fr.toBuffer().toString("hex")
}
