import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import TxFeeRow from "./TxFeeRow.vue"
import { buildGasBreakdown } from "./tx-detail-helpers"

const stubs = { Flex: { template: "<div><slot /></div>" }, Icon: true }

describe("TxFeeRow — the expanded gas breakdown", () => {
	test("a transaction with teardown limits lists L2 gas and DA gas alone, then the Estimated line", () => {
		const gasBreakdown = buildGasBreakdown({
			feePerL2Gas: "1000000000000",
			feePerDaGas: "2000000000000",
			l2GasLimit: 1_000,
			daGasLimit: 500,
			teardownL2GasLimit: 300,
			teardownDaGasLimit: 100,
		})
		const w = mount(TxFeeRow, {
			props: { label: "Fee paid", feeAmount: "0.0015", gasBreakdown, estimatedFee: "0.002", modelValue: true },
			global: { stubs },
		})
		const keys = w.findAll("span").filter((span) => span.classes().some((c) => c.includes("fee_grid_key")))
		expect(keys.map((k) => k.text())).toEqual(["L2 gas", "DA gas", "Estimated"])
		expect(w.text()).not.toContain("Teardown")
	})
})
