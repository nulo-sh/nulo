import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { priceFake } from "../../../../../tests/helpers/price-client-fake"
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
	const w = mount(AppFeeLine, { props: { feeEstimate: feeEstimate as never }, global: { stubs: STUBS } })
	await flushPromises()
	return w
}

beforeEach(() => priceFake.reset(0.06))

describe("AppFeeLine", () => {
	test("the app's limit and its priority part, each priced at the one quote the line reads", async () => {
		const w = await factory({ maxFee: "16000000000000000", priorityFee: "4000000000000000", gasDetails: GAS })
		expect(w.get('[data-testid="execute-op-app-fee"]').text()).toBe(
			"Fee up to ~0.016 FJ (<$0.001), includes a ~0.004 FJ (<$0.001) priority fee the app asked for",
		)
		expect(priceFake.clients).toHaveLength(1)
		expect(priceFake.refreshes()).toBe(1)
	})

	test("no priority part unless the worker set one, and the loading bar until the estimate lands", async () => {
		expect((await factory({ maxFee: "3577823500000000001", gasDetails: GAS })).text()).toBe("Fee up to ~3.577824 FJ ($0.215)")
		const waiting = await factory()
		expect(waiting.find('[data-testid="execute-op-app-fee-estimating"]').exists()).toBe(true)
		expect(waiting.find('[data-testid="skeleton"]').exists()).toBe(true)
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
