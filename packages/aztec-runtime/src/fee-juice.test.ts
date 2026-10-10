import { describe, expect, test } from "vitest"
import { GasFees } from "@aztec-labs/stdlib/gas"
import { type MinFeeNode, predictedWorstMinFees } from "./fee-juice"

// An error from getPredictedMinFees falls back to the (possibly stale) current min fee only when
// the method is missing; silently downgrading on a transient error under-prices the cap.
describe("predictedWorstMinFees fallback", () => {
	test("a transient 'block not found' error PROPAGATES (no fee downgrade)", async () => {
		const box = { currentCalls: 0 }
		const n: MinFeeNode = {
			getPredictedMinFees: async () => {
				throw new Error("block not found")
			},
			getCurrentMinFees: async () => {
				box.currentCalls++
				return new GasFees(1n, 1n)
			},
		}
		await expect(predictedWorstMinFees(n)).rejects.toThrow(/block not found/)
		expect(box.currentCalls).toBe(0)
	})

	test("a genuine 'method not found' STILL falls back to getCurrentMinFees", async () => {
		const box = { currentCalls: 0 }
		const n: MinFeeNode = {
			getPredictedMinFees: async () => {
				throw new Error("method not found")
			},
			getCurrentMinFees: async () => {
				box.currentCalls++
				return new GasFees(1n, 1n)
			},
		}
		await expect(predictedWorstMinFees(n)).resolves.toBeInstanceOf(GasFees)
		expect(box.currentCalls).toBe(1)
	})

	test("a JSON-RPC -32601 (via error.cause.code) falls back even without the phrase", async () => {
		const box = { currentCalls: 0 }
		const err = Object.assign(new Error("rpc error"), { cause: { code: -32601 } })
		const n: MinFeeNode = {
			getPredictedMinFees: async () => {
				throw err
			},
			getCurrentMinFees: async () => {
				box.currentCalls++
				return new GasFees(1n, 1n)
			},
		}
		await expect(predictedWorstMinFees(n)).resolves.toBeInstanceOf(GasFees)
		expect(box.currentCalls).toBe(1)
	})
})

// The JSON-RPC client returns a null-like node result as `undefined` before any schema parse.
describe("predictedWorstMinFees reply shape", () => {
	const MALFORMED = "Malformed fee reply from the node"

	test.each([
		["null-like", undefined],
		["L2 component that is not an integer", { feePerDaGas: 1n, feePerL2Gas: "1" }],
	])("a %s current-min reply is refused with the fixed error", async (_, reply) => {
		const n: MinFeeNode = { getCurrentMinFees: async () => reply as unknown as GasFees }
		await expect(predictedWorstMinFees(n)).rejects.toThrow(new Error(MALFORMED))
	})

	test.each([
		["last", [new GasFees(5n, 6n), undefined]],
		["first", [null, new GasFees(100n, 100n)]],
	])("a null-like %s predicted slot is refused with the fixed error, never priced from the current min", async (_, slots) => {
		const n: MinFeeNode = {
			getPredictedMinFees: async () => slots as GasFees[],
			getCurrentMinFees: async () => new GasFees(1n, 1n),
		}
		await expect(predictedWorstMinFees(n)).rejects.toThrow(new Error(MALFORMED))
	})

	test("well-formed replies pass: the component-wise worst slot, and the current min without predictions", async () => {
		const predicting: MinFeeNode = {
			getPredictedMinFees: async () => [new GasFees(5n, 9n), new GasFees(7n, 6n)],
			getCurrentMinFees: async () => new GasFees(1n, 1n),
		}
		expect(await predictedWorstMinFees(predicting)).toEqual(new GasFees(7n, 9n))
		expect(await predictedWorstMinFees({ getCurrentMinFees: async () => new GasFees(3n, 4n) })).toEqual(new GasFees(3n, 4n))
	})
})
