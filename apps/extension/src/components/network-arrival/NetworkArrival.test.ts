/**
 * The arrival renders its copy in order and wires each control to its action. The strings here are
 * the normative copy, written out, not read from `copy.ts`, so a copy change fails here first.
 */
import { flushPromises, mount } from "@vue/test-utils"
import { beforeEach, describe, expect, test, vi } from "vitest"
import { ref } from "vue"
import type { Network } from "@/wallet/services/network/client"

const H = vi.hoisted(() => ({
	push: vi.fn(),
	lock: vi.fn(),
	activate: vi.fn(async (_network: unknown) => "activated"),
	closeAll: vi.fn(),
}))

vi.mock("@/utils/core", () => ({ managers: { profile: {}, network: {} } }))
vi.mock("@/composables/useLockWallet", () => ({ useLockWallet: () => ({ lock: H.lock, dispose: vi.fn() }) }))
vi.mock("@/composables/useNetworkActivation", () => ({ useNetworkActivation: () => ({ activate: H.activate }) }))
vi.mock("@/stores/popup.store", () => ({ usePopupStore: () => ({ closeAll: H.closeAll }) }))
vi.mock("vue-router", async (importOriginal) => {
	const mod = await importOriginal<typeof import("vue-router")>()
	return { ...mod, useRouter: () => ({ push: H.push }) }
})

import { NETWORK_ARRIVAL_KEY } from "@/composables/useNetworkArrival"
import NetworkArrival from "./NetworkArrival.vue"

const MAINNET = { id: "mn", profileId: "p1", name: "Mainnet", kind: "mainnet" } as unknown as Network

function fakeArrival() {
	return { arrived: ref<Network | null>(MAINNET), answering: ref(false), refresh: vi.fn(), stay: vi.fn(async () => {}), dispose: vi.fn() }
}

function mountArrival(arrival = fakeArrival()) {
	const wrapper = mount(NetworkArrival, {
		props: { network: MAINNET, current: "Testnet" },
		global: {
			provide: { [NETWORK_ARRIVAL_KEY as symbol]: arrival },
			stubs: {
				Flex: { template: "<div><slot /></div>" },
				Icon: { template: '<i :data-icon="name" />', props: ["name"] },
			},
		},
	})
	return { wrapper, arrival }
}

/** Every text node in document order: the screen as a reader meets it. */
function lines(root: Element): string[] {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
	const out: string[] = []
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const text = node.textContent?.trim()
		if (text) out.push(text)
	}
	return out
}

const byId = (w: ReturnType<typeof mountArrival>["wrapper"], id: string) => w.get(`[data-testid="${id}"]`)

beforeEach(() => {
	for (const fn of [H.push, H.lock, H.activate, H.closeAll]) fn.mockClear()
})

describe("NetworkArrival", () => {
	test("names both networks, says switching sends nothing, and offers both choices", () => {
		const { wrapper } = mountArrival()
		expect(lines(wrapper.element)).toEqual([
			"TESTNET",
			"NEW NETWORK",
			"Mainnet is in your wallet",
			"This version of Nulo adds Mainnet to your networks. You are still on Testnet.",
			"SWITCHING TO MAINNET",
			"Sends nothing and costs nothing. It only changes the network you see.",
			"Shows your Mainnet account, at its own address.",
			"Keeps Testnet as it is. You can switch back at any time.",
			"SWITCH TO MAINNET",
			"STAY ON TESTNET",
		])
		expect(byId(wrapper, "network-arrival-takeover").attributes("data-screen")).toBe("arrival")
	})

	test("Switch activates the arrived network through the guarded switch, and holds both buttons meanwhile", async () => {
		let finish!: (value: string) => void
		H.activate.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
		const { wrapper, arrival } = mountArrival()

		await byId(wrapper, "network-arrival-switch").trigger("click")
		expect(H.activate).toHaveBeenCalledWith(MAINNET)
		expect(byId(wrapper, "network-arrival-switch").attributes("disabled")).toBeDefined()
		expect(byId(wrapper, "network-arrival-stay").attributes("disabled")).toBeDefined()

		finish("activated")
		await flushPromises()
		expect(byId(wrapper, "network-arrival-switch").attributes("disabled")).toBeUndefined()
		expect(arrival.stay).not.toHaveBeenCalled()
	})

	test("Stay answers the arrival for this network, and never switches", async () => {
		const { wrapper, arrival } = mountArrival()
		await byId(wrapper, "network-arrival-stay").trigger("click")
		expect(arrival.stay).toHaveBeenCalledWith("mn")
		expect(H.activate).not.toHaveBeenCalled()
	})

	test("while an answer is written both buttons hold", () => {
		const arrival = fakeArrival()
		arrival.answering.value = true
		const { wrapper } = mountArrival(arrival)
		expect(byId(wrapper, "network-arrival-switch").attributes("disabled")).toBeDefined()
		expect(byId(wrapper, "network-arrival-stay").attributes("disabled")).toBeDefined()
	})

	test("the chip opens Networks and the padlock locks; neither answers", async () => {
		const { wrapper, arrival } = mountArrival()
		await byId(wrapper, "network-arrival-chip").trigger("click")
		expect(H.push).toHaveBeenCalledWith("/popup/settings/networks")
		await byId(wrapper, "network-arrival-lock").trigger("click")
		expect(H.lock).toHaveBeenCalledOnce()
		expect(arrival.stay).not.toHaveBeenCalled()
		expect(H.activate).not.toHaveBeenCalled()
	})

	test("closes any popup open over the route it replaces", () => {
		mountArrival()
		expect(H.closeAll).toHaveBeenCalledOnce()
	})
})
