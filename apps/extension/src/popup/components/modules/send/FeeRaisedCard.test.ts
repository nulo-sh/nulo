import { describe, expect, test } from "vitest"
import { mount } from "@vue/test-utils"
import FeeRaisedCard from "./FeeRaisedCard.vue"

const STUBS = {
	Flex: { template: "<div><slot /></div>" },
	Text: { template: "<span><slot /></span>" },
	Skeleton: { template: '<i data-testid="skeleton" />' },
}

const PRIVATE = { type: "private_fpc", fpcId: "pfj-1", isProtocol: true } as const
const PUBLIC = { type: "fj", isProtocol: false } as const

const factory = (props: Record<string, unknown> = {}) =>
	mount(FeeRaisedCard, {
		props: { payer: PRIVATE, was: "0.016", now: "0.021", available: "1.25", availableLoading: false, priority: "normal", ...props },
		global: { stubs: STUBS },
	})
const text = (w: ReturnType<typeof factory>, id: string) => w.find(`[data-testid="${id}"]`).text()

describe("FeeRaisedCard", () => {
	test("names the payer, what it holds, the approved and the new figure, and the speed", () => {
		const w = factory()
		expect(text(w, "fee-raised-method")).toBe("Private Fee Juice")
		expect(w.text()).toContain("Available")
		expect(w.text()).toContain("1.25 FJ")
		expect(text(w, "fee-raised")).toContain("Fee went up")
		expect(text(w, "fee-raised-was")).toBe("Was 0.016 FJ")
		expect(text(w, "fee-raised-now")).toBe("Now 0.021 FJ")
		expect(text(w, "fee-raised-priority")).toContain("Normal")
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
		expect(text(w, "fee-raised-now")).toBe("Now 0.021 FJ")
	})

	test("each speed prints its own word", () => {
		expect(text(factory({ priority: "fast" }), "fee-raised-priority")).toContain("Fast")
		expect(text(factory({ priority: "urgent" }), "fee-raised-priority")).toContain("Urgent")
	})
})
