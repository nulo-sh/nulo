import { flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { priceFake } from "../../../../../tests/helpers/price-client-fake"
import { captureWindowDocument } from "@/utils/window-document"
import AppFeeLine from "./AppFeeLine.vue"

vi.mock("@/wallet/services/price/client", async () => (await import("../../../../../tests/helpers/price-client-fake")).priceClientModule())

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>" },
	Skeleton: { template: '<i data-testid="skeleton" />' },
	DottedTerm: { template: "<span><slot /></span>" },
}
const GAS = { l2GasLimit: 1, daGasLimit: 1, teardownL2GasLimit: 0, teardownDaGasLimit: 0, feePerL2Gas: "1", feePerDaGas: "1" }
const factory = async (feeEstimate?: Record<string, unknown>) => {
	const w = mount(AppFeeLine, { props: { feeEstimate: feeEstimate as never }, slots: { default: "Swap" }, global: { stubs: STUBS } })
	await flushPromises()
	return w
}

// Mounted only by the dApp windows, where every price read is a cache read.
beforeEach(() => {
	priceFake.reset(0.06)
	captureWindowDocument("#/windows/execute?requestId=r1")
})
afterEach(() => captureWindowDocument(""))

describe("AppFeeLine", () => {
	test("the app's limit and its priority part, each priced at the one quote the line reads", async () => {
		const w = await factory({ maxFee: "16000000000000000", priorityFee: "4000000000000000", gasDetails: GAS })
		expect(w.get('[data-testid="execute-op-app-fee"]').text()).toBe(
			"About ~0.016 FJ (<$0.001); payment method set by Swap. Includes a ~0.004 FJ (<$0.001) priority fee the app asked for.",
		)
		expect(priceFake.clients).toHaveLength(1)
		expect([priceFake.reads(), priceFake.refreshes()]).toEqual([1, 0])
	})

	test("no priority part unless the worker set one, and the loading bar in the amount's place until the estimate lands", async () => {
		expect((await factory({ maxFee: "3577823500000000001", gasDetails: GAS })).text()).toBe(
			"About ~3.577824 FJ ($0.215); payment method set by Swap.",
		)
		const waiting = (await factory()).get('[data-testid="execute-op-app-fee-estimating"]')
		expect(waiting.html().replaceAll("<!--v-if-->", "")).toMatch(
			/About <i data-testid="skeleton"[^>]*><\/i>; payment method set by Swap\.<\/span>$/,
		)
	})

	test("paid from Private Fee Juice: the person pays first, the app's method on its own line, then any priority part", async () => {
		const mountPfj = async (feeEstimate?: Record<string, unknown>) => {
			const w = mount(AppFeeLine, {
				props: { feeEstimate: feeEstimate as never, privateFeeJuice: true },
				slots: { default: "Swap" },
				global: { stubs: STUBS },
			})
			await flushPromises()
			return w
		}
		const landed = await mountPfj({ maxFee: "3577823500000000001", gasDetails: GAS })
		const [first] = landed.get('[data-testid="execute-op-app-fee"]').findAll("span")
		expect(first.text()).toBe("You pay about ~3.577824 FJ ($0.215) from Private Fee Juice")
		expect(landed.text()).toBe("You pay about ~3.577824 FJ ($0.215) from Private Fee Juice method set by Swap")
		const priced = await mountPfj({ maxFee: "16000000000000000", priorityFee: "4000000000000000", gasDetails: GAS })
		expect(priced.text()).toBe(
			"You pay about ~0.016 FJ (<$0.001) from Private Fee Juice method set by Swap. Includes a ~0.004 FJ (<$0.001) priority fee the app asked for.",
		)
		const waiting = (await mountPfj()).get('[data-testid="execute-op-app-fee-estimating"]')
		expect(waiting.find('[data-testid="skeleton"]').exists()).toBe(true)
		expect(waiting.html({ raw: true }).replaceAll("<!--v-if-->", "")).toMatch(
			/You pay about <i data-testid="skeleton"[^>]*><\/i> from Private Fee Juice<\/span> method set by Swap<\/span>$/,
		)
	})

	test("unmounting closes the price client and drops the quote listener it added", async () => {
		const w = await factory({ maxFee: "16000000000000000", gasDetails: GAS })
		const [client] = priceFake.clients
		const listener = client.onQuotesUpdated.add.mock.calls[0]?.[0]
		w.unmount()
		expect(client.disconnect).toHaveBeenCalledTimes(1)
		expect(client.onQuotesUpdated.remove).toHaveBeenCalledWith(listener)
	})
})
