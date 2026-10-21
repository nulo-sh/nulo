import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { flushPromises, mount } from "@vue/test-utils"
import { priceFake } from "../../../../../tests/helpers/price-client-fake"
import { captureWindowDocument } from "@/utils/window-document"
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

// Mounted only by the dApp windows, where every price read is a cache read.
beforeEach(() => {
	priceFake.reset(undefined)
	captureWindowDocument("#/windows/execute?requestId=r1")
})
afterEach(() => captureWindowDocument(""))

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

	test("both figures price at the card's own quote, each on its own row with nothing between them", async () => {
		priceFake.reset(2)
		const w = factory()
		await flushPromises()
		expect(text(w, "fee-raised-was")).toBe("Was ~0.016 FJ ($0.032)")
		expect(text(w, "fee-raised-now")).toBe("Now ~0.021 FJ ($0.042)")
		const rows = w.get('[data-testid="fee-raised"]').element.children
		expect([...rows].map((row) => row.getAttribute("data-testid"))).toEqual([null, "fee-raised-was", "fee-raised-now"])
		expect(text(w, "fee-raised")).not.toContain("·")
		expect([priceFake.reads(), priceFake.refreshes()]).toEqual([1, 0])
	})

	test("hands the new fee up as it prices it: the figure at once, its dollars once the quote lands", async () => {
		priceFake.reset(2)
		const w = factory()
		expect(w.emitted("update:now")).toEqual([[{ amount: "0.021", usd: null }]])
		await flushPromises()
		expect(w.emitted("update:now")?.at(-1)).toEqual([{ amount: "0.021", usd: "$0.042" }])
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
