import { describe, expect, test } from "vitest"
import { Gas, GasFees, GasSettings } from "@aztec-labs/stdlib/gas"
import type { TxExecutionRequest } from "@aztec-labs/stdlib/tx"
import { getEstimatedFee } from "./tx-fee-details"

describe("getEstimatedFee", () => {
	test("is the fee limit the node checks: gas limits × cap, the teardown inside the gas limits counted once", () => {
		const gasSettings = new GasSettings(new Gas(100, 200), new Gas(10, 20), new GasFees(2n, 3n), GasFees.empty())
		const txRequest = { txContext: { gasSettings } } as unknown as TxExecutionRequest
		expect(getEstimatedFee(txRequest)).toBe("800")
		expect(getEstimatedFee(txRequest)).toBe(gasSettings.getFeeLimit().toBigInt().toString())
	})
})
