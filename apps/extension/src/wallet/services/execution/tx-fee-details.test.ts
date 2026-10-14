import { describe, expect, test } from "vitest"
import { Gas, GasFees, GasSettings } from "@aztec-labs/stdlib/gas"
import type { TxExecutionRequest } from "@aztec-labs/stdlib/tx"
import { getEstimatedFee, priorityFeeOf } from "./tx-fee-details"

describe("getEstimatedFee", () => {
	test("is the fee limit the node checks: gas limits × cap, the teardown inside the gas limits counted once", () => {
		const gasSettings = new GasSettings(new Gas(100, 200), new Gas(10, 20), new GasFees(2n, 3n), GasFees.empty())
		const txRequest = { txContext: { gasSettings } } as unknown as TxExecutionRequest
		expect(getEstimatedFee(txRequest)).toBe("800")
		expect(getEstimatedFee(txRequest)).toBe(gasSettings.getFeeLimit().toBigInt().toString())
	})
})

describe("priorityFeeOf", () => {
	const requestWith = (priority: GasFees) =>
		({
			txContext: { gasSettings: new GasSettings(new Gas(100, 200), new Gas(10, 20), new GasFees(20n, 30n), priority) },
		}) as unknown as TxExecutionRequest

	test.each([
		["no priority fee", GasFees.empty(), 0n],
		["a priority below the cap: gas limits × the priority", new GasFees(4n, 5n), 1_400n],
		["a priority above the cap on one gas type: that type counts at the cap", new GasFees(25n, 5n), 3_000n],
	])("%s", (_case, priority, expected) => {
		const txRequest = requestWith(priority)
		expect(priorityFeeOf(txRequest)).toBe(expected)
		expect(priorityFeeOf(txRequest)).toBeLessThanOrEqual(BigInt(getEstimatedFee(txRequest)))
	})
})
