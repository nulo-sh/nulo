import { TxSimulationResultWithAppOffset } from "@aztec-labs/aztec.js/wallet"
import { Fr } from "@aztec-labs/foundation/curves/bn254"
import type { PrivateCallExecutionResult, TxSimulationResult } from "@aztec-labs/stdlib/tx"
import { describe, expect, test } from "vitest"
import { toJsonSafe } from "@/wallet/services/wallet-sdk/to-json-safe"
import { toAppFacingSimulationResult } from "./app-facing-results"
import { type SimulationFixture, type SimulationFixtureOptions, simulationFixture } from "./app-facing-results.fixtures"

type Json = Record<string, unknown>

/** Serialised as the response line does: the SDK's parse would strip an unknown key before a test saw it. */
function wire(result: TxSimulationResult): Json {
	return JSON.parse(JSON.stringify(toJsonSafe(result)))
}

/** Buffers in hex, so a field element inside bytecode or serialised public inputs stays searchable. */
function wireText(json: unknown): string {
	return JSON.stringify(json, (_key, value) => (isBufferJson(value) ? Buffer.from(value.data).toString("hex") : value))
}

function isBufferJson(value: unknown): value is { type: "Buffer"; data: number[] } {
	return typeof value === "object" && value !== null && (value as Json).type === "Buffer" && Array.isArray((value as Json).data)
}

function dropped(fixture: SimulationFixture): string[] {
	return [...fixture.droppedFields, ...fixture.droppedCounters.map(String), ...fixture.droppedStrings]
}

/** Counters are matched as whole numbers, so a hex run that happens to contain the digits does not count. */
function found(text: string, fixture: SimulationFixture): string[] {
	return dropped(fixture).filter((value) => (/^\d+$/.test(value) ? new RegExp(`\\b${value}\\b`).test(text) : text.includes(value)))
}

const CALL_KEYS = [
	"acir",
	"contractClassLogs",
	"nestedExecutionResults",
	"newNotes",
	"noteHashNullifierCounterMap",
	"offchainEffects",
	"partialWitness",
	"publicInputs",
	"returnValues",
	"taggingIndexRanges",
	"vk",
]

function callKeySets(call: Json): string[][] {
	const nested = call.nestedExecutionResults as Json[]
	return [Object.keys(call).sort(), ...nested.flatMap(callKeySets)]
}

function frames(call: PrivateCallExecutionResult): PrivateCallExecutionResult[] {
	return [call, ...call.nestedExecutionResults.flatMap(frames)]
}

const VARIANTS: Array<[string, SimulationFixtureOptions]> = [
	["a public tail, a public output and an app call offset", { tail: "public", publicOutput: true, appCallOffset: 1 }],
	["a rollup tail and no public output", { tail: "rollup", publicOutput: false }],
]

describe("toAppFacingSimulationResult", () => {
	test.each(VARIANTS)("the dApp's wire carries no dropped value, with %s", (_name, opts) => {
		const fixture = simulationFixture(opts)

		// The search finds every dropped value on the unreduced result, so its silence below is evidence.
		expect(found(wireText(wire(fixture.result)), fixture)).toEqual(dropped(fixture))
		expect(found(wireText(wire(toAppFacingSimulationResult(fixture.result))), fixture)).toEqual([])
	})

	test.each(VARIANTS)(
		"the answer, its execution, every call and the public output have exactly the schema's keys, with %s",
		(_name, opts) => {
			const json = wire(toAppFacingSimulationResult(simulationFixture(opts).result))
			const root = ["privateExecutionResult", "publicInputs"]
			if (opts.publicOutput) root.push("publicOutput")
			if (opts.appCallOffset !== undefined) root.push("appCallOffset")

			expect(Object.keys(json).sort()).toEqual(root.sort())
			const execution = json.privateExecutionResult as Json
			expect(Object.keys(execution).sort()).toEqual(["entrypoint", "firstNullifier", "publicFunctionCalldata"])
			expect(callKeySets(execution.entrypoint as Json)).toEqual([CALL_KEYS, CALL_KEYS, CALL_KEYS])
			if (opts.publicOutput) {
				expect(Object.keys(json.publicOutput as Json).sort()).toEqual([
					"debugLogs",
					"gasUsed",
					"globalVariables",
					"publicReturnValues",
					"txEffect",
				])
			}
		},
	)

	test.each(VARIANTS)("the dApp's own schema parse keeps what aztec.js reads, with %s", async (_name, opts) => {
		const input = simulationFixture(opts).result
		const parsed = await TxSimulationResultWithAppOffset.schema.parseAsync(wire(toAppFacingSimulationResult(input)))

		const app = parsed.getPrivateReturnValuesOfAppCall(0)
		expect(app?.values).toEqual([new Fr(41)])
		expect(app?.nested.map((n) => n.values)).toEqual([[new Fr(42)]])
		const effects = (r: TxSimulationResult) => r.offchainEffects.map((e) => [e.contractAddress.toString(), e.data.map(String)])
		expect(effects(parsed)).toEqual(effects(input))
		expect(effects(parsed)).toHaveLength(3)
		expect(parsed.gasUsed).toEqual(input.gasUsed)

		const kept = frames(input.privateExecutionResult.entrypoint)
		const got = frames(parsed.privateExecutionResult.entrypoint)
		expect(got).toHaveLength(3)
		got.forEach((frame, i) => {
			const want = kept[i].publicInputs
			expect(frame.publicInputs.callContext.toBuffer()).toEqual(want.callContext.toBuffer())
			expect(frame.publicInputs.argsHash).toEqual(want.argsHash)
			expect(frame.publicInputs.minRevertibleSideEffectCounter).toEqual(want.minRevertibleSideEffectCounter)
			expect(frame.publicInputs.publicCallRequests.toBuffer()).toEqual(want.publicCallRequests.toBuffer())
		})
		expect(parsed.privateExecutionResult.publicFunctionCalldata).toEqual(input.privateExecutionResult.publicFunctionCalldata)

		const tail = parsed.publicInputs
		expect(tail.constants.toBuffer()).toEqual(input.publicInputs.constants.toBuffer())
		expect(tail.constants.anchorBlockHeader.globalVariables.timestamp).toBe(1_234n)
		expect([tail.gasUsed, tail.feePayer, tail.expirationTimestamp]).toEqual([
			input.publicInputs.gasUsed,
			input.publicInputs.feePayer,
			input.publicInputs.expirationTimestamp,
		])
		const callRequests = (t: typeof tail) =>
			t.forPublic && [
				t.forPublic.nonRevertibleAccumulatedData.publicCallRequests.map(String),
				t.forPublic.revertibleAccumulatedData.publicCallRequests.map(String),
				t.forPublic.publicTeardownCallRequest.toString(),
			]
		expect(callRequests(tail)).toEqual(callRequests(input.publicInputs))
		expect(tail.forRollup === undefined).toBe(input.publicInputs.forRollup === undefined)

		expect(parsed.getPublicReturnValues()).toEqual(input.getPublicReturnValues())
		expect(input.stats).toBeDefined()
		expect(parsed.stats).toBeUndefined()
		expect(parsed.appCallOffset).toBe(opts.appCallOffset)
	})
})
