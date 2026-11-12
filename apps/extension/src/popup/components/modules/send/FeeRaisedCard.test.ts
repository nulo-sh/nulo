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
/** What a screen reader reads from the row: its text with every `aria-hidden` subtree removed. */
const spokenRow = (w: ReturnType<typeof factory>) => {
	const row = w.get('[data-testid="fee-raised"]').element.cloneNode(true) as HTMLElement
	for (const hidden of row.querySelectorAll('[aria-hidden="true"]')) hidden.remove()
	return row.textContent
}

// Mounted only by the dApp windows, where every price read is a cache read.
beforeEach(() => {
	priceFake.reset(undefined)
	captureWindowDocument("#/windows/execute?requestId=r1")
})
afterEach(() => captureWindowDocument(""))

describe("FeeRaisedCard", () => {
	test("the fee row names the new figure with the approved one struck beside it, then the payer; what it holds and the speed follow", () => {
		const w = factory()
		expect(text(w, "fee-raised-now")).toBe("~0.021 FJ")
		const was = w.get('[data-testid="fee-raised-was"]')
		expect([was.element.tagName, was.text()]).toEqual(["S", "was ~0.016 FJ"])
		const method = w.get('[data-testid="fee-raised-method"]')
		expect(method.text()).toBe("Private Fee Juice")
		expect(was.element.compareDocumentPosition(method.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
		expect(w.text()).toContain("Available")
		expect(w.text()).toContain("1.25 FJ")
		expect(text(w, "fee-raised-priority")).toContain("Normal")
	})

	test("with the card's quote the new figure carries its dollars and the struck one none, both in the fee's role", async () => {
		priceFake.reset(2)
		const w = factory()
		await flushPromises()
		expect(text(w, "fee-raised-now")).toBe("~0.021 FJ ($0.042)")
		expect(text(w, "fee-raised-was")).toBe("was ~0.016 FJ")
		for (const id of ["fee-raised-now", "fee-raised-was"]) expect(w.get(`[data-testid="${id}"]`).classes()).toContain("type--meta")
		expect([priceFake.reads(), priceFake.refreshes()]).toEqual([1, 0])
	})

	test("the row is spoken as one sentence: the dot and the drawn figures are hidden, and only that sentence says the fee went up", async () => {
		priceFake.reset(2)
		const w = factory()
		await flushPromises()
		const row = w.get('[data-testid="fee-raised"]')
		const hidden = row.findAll('[aria-hidden="true"]')
		expect(hidden.map((el) => el.text())).toEqual(["", "~0.021 FJ ($0.042)was ~0.016 FJ"])
		expect(spokenRow(w)).toBe("FeeFee went up. Was ~0.016 FJ. Now ~0.021 FJ ($0.042).Private Fee Juice")
		expect(w.text().split("Fee went up")).toHaveLength(2)
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
		expect(text(w, "fee-raised-now")).toBe("~0.021 FJ")
	})

	test("each speed prints its own word", () => {
		expect(text(factory({ priority: "fast" }), "fee-raised-priority")).toContain("Fast")
		expect(text(factory({ priority: "urgent" }), "fee-raised-priority")).toContain("Urgent")
	})
})
