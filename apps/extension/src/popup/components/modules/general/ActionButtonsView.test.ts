import { Flex } from "@nulo/design"
import { mount } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"

const H = vi.hoisted(() => ({
	push: vi.fn(),
	open: vi.fn(),
	store: {} as Record<string, unknown>,
}))

vi.mock("@/stores/app.store", () => ({ useAppStore: () => H.store }))
vi.mock("@/stores/popup.store", () => ({ usePopupStore: () => ({ open: H.open }) }))
vi.mock("vue-router", async (importOriginal) => {
	const mod = await importOriginal<typeof import("vue-router")>()
	return { ...mod, useRouter: () => ({ push: H.push }) }
})

import ActionButtonsView from "./ActionButtonsView.vue"

const activeStore = (): Record<string, unknown> => ({
	profile: { id: "p1" },
	network: { id: "tn", chainId: 2 },
	staleNetwork: null,
	account: { profileId: "p1", chainId: 2, address: "0x01" },
})

function mountActions(over: Record<string, unknown> = {}) {
	H.store = { ...activeStore(), ...over }
	return mount(ActionButtonsView, { global: { components: { Flex } } })
}

async function clickBoth(over: Record<string, unknown> = {}) {
	const wrapper = mountActions(over)
	await wrapper.find('[data-testid="actions-send"]').trigger("click")
	await wrapper.find('[data-testid="actions-receive"]').trigger("click")
}

beforeEach(() => {
	H.push.mockClear()
	H.open.mockClear()
})

describe("ActionButtonsView", () => {
	test("Send and Receive are native buttons, so Tab reaches them and Enter and Space press them", () => {
		const wrapper = mountActions()
		for (const testid of ["actions-send", "actions-receive"]) {
			const action = wrapper.find(`[data-testid="${testid}"]`).element
			expect(action.tagName, testid).toBe("BUTTON")
			expect(action.getAttribute("type"), testid).toBe("button")
		}
	})

	test("Send and Receive act on the active network's account", async () => {
		await clickBoth()
		expect(H.push).toHaveBeenCalledWith({ path: "/popup/send", query: {} })
		expect(H.open).toHaveBeenCalledWith("receive")
	})

	test("while the previous network's account is still loaded, or the network is quarantined, they do nothing", async () => {
		await clickBoth({ network: { id: "ln", chainId: 3 } })
		await clickBoth({ account: { profileId: "p0", chainId: 2, address: "0x01" } })
		await clickBoth({ account: undefined })
		await clickBoth({ staleNetwork: { networkId: "tn" } })
		expect(H.push).not.toHaveBeenCalled()
		expect(H.open).not.toHaveBeenCalled()
	})
})
