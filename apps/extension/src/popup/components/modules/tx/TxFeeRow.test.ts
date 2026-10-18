import { mount } from "@vue/test-utils"
import { describe, expect, test } from "vitest"
import TxFeeRow from "./TxFeeRow.vue"
import { buildGasBreakdown } from "./tx-detail-helpers"

const stubs = { Flex: { template: "<div><slot /></div>" }, Icon: true }

// 1_000 · 1e12 + 500 · 2e12 = 2e15: 0.001 FJ on each line; the teardown sits inside both limits.
const gasBreakdown = buildGasBreakdown({
	feePerL2Gas: "1000000000000",
	feePerDaGas: "2000000000000",
	l2GasLimit: 1_000,
	daGasLimit: 500,
	teardownL2GasLimit: 300,
	teardownDaGasLimit: 100,
})
const factory = (props: Record<string, unknown> = {}) =>
	mount(TxFeeRow, {
		props: { label: "Fee paid", fee: "1500000000000000", gasBreakdown, estimatedFee: "2000000000000000", usdPerFeeJuice: 2, ...props },
		global: { stubs },
	})
const header = (w: ReturnType<typeof factory>) => w.get("button > span")
const styledAsEstimate = (w: ReturnType<typeof factory>) =>
	header(w)
		.classes()
		.some((c) => c.includes("detail_value_est"))
const cells = (w: ReturnType<typeof factory>) => w.findAll("span").filter((span) => span.classes().some((c) => c.includes("fee_grid_val")))

describe("TxFeeRow", () => {
	test("the paid fee in the one grammar, its dollars at today's quote", () => {
		const w = factory()
		expect(header(w).text()).toBe("~0.0015 FJ ($0.003)")
		expect(w.get('[data-testid="tx-fee-usd"]').text()).toBe("($0.003)")
		expect(styledAsEstimate(w)).toBe(false)
	})

	test("an estimate before the receipt reads the same way, set apart as an estimate", () => {
		const w = factory({ label: "Estimated fee", estimated: true, estimatedFee: null })
		expect(header(w).text()).toBe("~0.0015 FJ ($0.003)")
		expect(styledAsEstimate(w)).toBe(true)
	})

	test("the breakdown lists L2 gas and DA gas alone, then the Estimated line, every cost priced", () => {
		const w = factory({ modelValue: true })
		const keys = w.findAll("span").filter((span) => span.classes().some((c) => c.includes("fee_grid_key")))
		expect(keys.map((k) => k.text())).toEqual(["L2 gas", "DA gas", "Estimated"])
		expect(w.text()).not.toContain("Teardown")
		expect(cells(w).map((c) => c.text())).toEqual(["~0.001 FJ ($0.002)", "~0.001 FJ ($0.002)", "~0.002 FJ ($0.004)"])
		expect(w.get('[data-testid="tx-estimate-usd"]').text()).toBe("($0.004)")
	})

	test("with no quote every figure stands without dollars", () => {
		const w = factory({ usdPerFeeJuice: undefined, modelValue: true })
		expect(header(w).text()).toBe("~0.0015 FJ")
		expect(cells(w).map((c) => c.text())).toEqual(["~0.001 FJ", "~0.001 FJ", "~0.002 FJ"])
		expect(w.find('[data-testid="tx-fee-usd"]').exists()).toBe(false)
		expect(w.find('[data-testid="tx-estimate-usd"]').exists()).toBe(false)
	})
})
