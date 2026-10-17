import { beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"
import { priceFake } from "../../../../../tests/helpers/price-client-fake"
import FeeRaisedCard from "./FeeRaisedCard.vue"

vi.mock("@/wallet/services/price/client", async () => (await import("../../../../../tests/helpers/price-client-fake")).priceClientModule())

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>" },
	Skeleton: { template: '<i data-testid="skeleton" />' },
}

const PRIVATE = { type: "private_fpc", fpcId: "pfj-1", isProtocol: true } as const
const PUBLIC = { type: "fj", isProtocol: false } as const

const factory = (props: Record<string, unknown> = {}) =>
	mount(FeeRaisedCard, {
		props: {
			payer: PRIVATE,
			approved: "16000000000000000",
			fee: "21000000000000000",
			available: "1.25",
			availableLoading: false,
			priority: "normal",
			...props,
		},
		global: { stubs: STUBS },
	})
const text = (w: ReturnType<typeof factory>, id: string) => w.find(`[data-testid="${id}"]`).text()

beforeEach(() => priceFake.reset(undefined))

describe("FeeRaisedCard", () => {
	test("names the payer, what it holds, the approved and the new figure, and the speed", () => {
		const w = factory()
		expect(text(w, "fee-raised-method")).toBe("Private Fee Juice")
		expect(w.text()).toContain("Available")
		expect(w.text()).toContain("1.25 FJ")
		expect(text(w, "fee-raised")).toContain("Fee went up")
		expect(text(w, "fee-raised-was")).toBe("Was ~0.016 FJ")
		expect(text(w, "fee-raised-now")).toBe("Now ~0.021 FJ")
		expect(text(w, "fee-raised-priority")).toContain("Normal")
	})

	test("both figures price at the card's own quote, and the window's Confirm names the new one the same way", async () => {
		const unpriced = factory()
		expect(unpriced.emitted<[string]>("update:confirmText")?.at(-1)).toEqual(["Send for ~0.021 FJ"])

		priceFake.reset(2)
		const w = factory()
		await flushPromises()
		expect(text(w, "fee-raised-was")).toBe("Was ~0.016 FJ ($0.032)")
		expect(text(w, "fee-raised-now")).toBe("Now ~0.021 FJ ($0.042)")
		expect(w.emitted<[string]>("update:confirmText")?.at(-1)).toEqual(["Send for ~0.021 FJ ($0.042)"])
		expect(priceFake.refreshes()).toBe(1)
	})

	test("unmounting closes the price client and drops the quote listener it added", () => {
		const w = factory()
		const [client] = priceFake.clients
		const listener = client.onQuotesUpdated.add.mock.calls[0]?.[0]
		w.unmount()
		expect(client.disconnect).toHaveBeenCalledTimes(1)
		expect(client.onQuotesUpdated.remove).toHaveBeenCalledWith(listener)
	})

	test("the account's own Fee Juice reads as public", () => {
		expect(text(factory({ payer: PUBLIC }), "fee-raised-method")).toBe("Public Fee Juice")
	})

	test("an unread balance shows a dash, never a zero, and a read in flight shows a placeholder", () => {
		expect(factory({ available: null }).text()).toContain("— FJ")
		const loading = factory({ availableLoading: true })
		expect(loading.find('[data-testid="skeleton"]').exists()).toBe(true)
		expect(loading.text()).not.toContain("1.25 FJ")
	})

	test("an app's claim pays: no balance row, and with no speed picked no priority row", () => {
		const w = factory({ payer: PUBLIC, hideAvailable: true, priority: undefined })
		expect(w.text()).not.toContain("Available")
		expect(w.find('[data-testid="fee-raised-priority"]').exists()).toBe(false)
		expect(text(w, "fee-raised-now")).toBe("Now ~0.021 FJ")
	})

	test("each speed prints its own word", () => {
		expect(text(factory({ priority: "fast" }), "fee-raised-priority")).toContain("Fast")
		expect(text(factory({ priority: "urgent" }), "fee-raised-priority")).toContain("Urgent")
	})
})
