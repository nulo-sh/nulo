import { Tooltip } from "@nulo/design"
import { createTestingPinia } from "@pinia/testing"
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../../tests/helpers/chrome-storage-mock"
import { useAppStore } from "@/stores/app.store"
import TokensIndex from "./index.vue"

const H = vi.hoisted(() => ({ tokens: [] as Array<Record<string, unknown>>, disconnect: vi.fn() }))
const L = vi.hoisted(() => ({ refresh: vi.fn(), disconnect: vi.fn() }))

vi.mock("@/wallet/services/token/client", async () => {
	const { EventHandler } = await import("@nulo/wallet-core/utils")
	return {
		TokenServiceClient: function TokenServiceClient() {
			return {
				getTokens: vi.fn(async () => H.tokens),
				onTokenAdded: new EventHandler(),
				onTokenUpdated: new EventHandler(),
				onTokenDeleted: new EventHandler(),
				deleteToken: vi.fn(),
				disconnect: H.disconnect,
			}
		},
	}
})

vi.mock("@/wallet/services/token-list/client", () => ({
	TokenListServiceClient: function TokenListServiceClient() {
		return L
	},
}))

enableAutoUnmount(afterEach)

const NETWORK = { id: "a", chainId: 1 }
const bubble = () => document.querySelector('[data-testid="tooltip-bubble"]')

// The app store reads and watches `chrome.storage.local` when it is created.
beforeEach(() => {
	vi.stubGlobal("chrome", {
		storage: {},
	})
	installChromeStorage({}, { persist: false })
	document.body.innerHTML = '<div id="tooltip"></div>'
	H.tokens = [{ id: "t", symbol: "TST", name: "Test token" }]
	H.disconnect.mockClear()
	L.refresh.mockReset()
	L.disconnect.mockClear()
})
afterEach(() => {
	document.body.innerHTML = ""
	vi.unstubAllGlobals()
})

function mountPage() {
	const pinia = createTestingPinia({ createSpy: vi.fn })
	const appStore = useAppStore(pinia)
	appStore.profile = { id: "p" } as never
	appStore.network = NETWORK as never
	appStore.networks = [NETWORK, { id: "b", chainId: 2 }] as never
	const wrapper = mount(TokensIndex, {
		attachTo: document.body,
		global: {
			plugins: [pinia],
			components: { Tooltip },
			stubs: {
				SettingsPageShell: { template: "<div><slot /></div>" },
				SettingItem: { template: "<div><slot name='description' /><slot name='right' /></div>" },
				Flex: { template: "<div><slot /></div>" },
				Icon: { inheritAttrs: false, template: "<i v-bind='$attrs' />" },
				ItemsContainer: { template: "<div><slot /></div>" },
				SectionLabel: true,
				ListStatusMessage: true,
			},
		},
	})
	return { wrapper, appStore }
}

test("the delete icon's tooltip leaves with the icon, and stops taking Escape", async () => {
	const { wrapper, appStore } = mountPage()
	await flushPromises()
	await wrapper.find('[data-testid="token-delete"]').trigger("focusin")
	expect(bubble()).not.toBeNull()

	appStore.networks = [NETWORK] as never
	await flushPromises()
	expect(wrapper.find('[data-testid="token-delete"]').exists()).toBe(false)
	expect(bubble()).toBeNull()
	const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
	document.body.dispatchEvent(esc)
	expect(esc.defaultPrevented).toBe(false)
})

test("a row whose symbol or name is blank reads the empty-value dash; a normal row keeps its own", async () => {
	H.tokens = [
		{ id: "t", symbol: "TST", name: "Test token" },
		{ id: "b", symbol: "   ", name: "" },
	]
	const { wrapper } = mountPage()
	await flushPromises()
	const rows = wrapper.findAll('[data-testid="token-row"]').map((r) => [r.attributes("title"), r.attributes("description")])
	expect(rows).toEqual([
		["—", "—"],
		["TST", "Test token"],
	])
})

const refreshRow = (wrapper: ReturnType<typeof mountPage>["wrapper"]) => wrapper.find('[data-testid="token-list-refresh"]')
const refreshLine = (wrapper: ReturnType<typeof mountPage>["wrapper"]) => wrapper.find('[data-testid="token-list-refresh-result"]')

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (error: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

test("the refresh line is a live region from the first render, with no tokens too", async () => {
	H.tokens = []
	const { wrapper } = mountPage()
	await flushPromises()
	const line = refreshLine(wrapper)
	expect(line.attributes()).toMatchObject({ role: "status", "data-state": "idle" })
	expect(line.element.textContent).toBe("Default tokens and their prices")
	expect(L.refresh).not.toHaveBeenCalled()
})

test("a press shows the running line, a second press starts nothing, and the result reads in the page's words", async () => {
	const call = deferred<string>()
	L.refresh.mockReturnValueOnce(call.promise)
	const { wrapper } = mountPage()
	await flushPromises()

	await refreshRow(wrapper).trigger("click")
	await refreshRow(wrapper).trigger("click")
	expect(L.refresh).toHaveBeenCalledTimes(1)
	expect(refreshRow(wrapper).attributes("loading")).toBe("true")
	expect(refreshLine(wrapper).element.textContent).toBe("Checking the list")

	call.resolve("unchanged")
	await flushPromises()
	expect(refreshRow(wrapper).attributes("loading")).toBe("false")
	expect(refreshLine(wrapper).attributes("data-state")).toBe("current")
	expect(refreshLine(wrapper).element.textContent).toBe("No newer token list.")
	expect(refreshLine(wrapper).classes()).not.toContain("color--txt-danger")
})

test("an unreached host reads in the danger colour, and a call that fails reads as not updated", async () => {
	L.refresh.mockResolvedValueOnce("network").mockRejectedValueOnce(new Error("port closed"))
	const { wrapper } = mountPage()
	await flushPromises()

	await refreshRow(wrapper).trigger("click")
	await flushPromises()
	expect(refreshLine(wrapper).attributes("data-state")).toBe("unreachable")
	expect(refreshLine(wrapper).element.textContent).toBe("Could not reach the token list. Try again later.")
	expect(refreshLine(wrapper).classes()).toContain("color--txt-danger")

	await refreshRow(wrapper).trigger("click")
	await flushPromises()
	expect(refreshLine(wrapper).attributes("data-state")).toBe("failed")
	expect(refreshLine(wrapper).element.textContent).toBe("Could not update the token list. Try again later.")
	expect(L.refresh).toHaveBeenCalledTimes(2)
})

test("leaving the page disconnects both clients, the token client first", async () => {
	const { wrapper } = mountPage()
	await flushPromises()
	wrapper.unmount()
	expect(H.disconnect).toHaveBeenCalledTimes(1)
	expect(L.disconnect).toHaveBeenCalledTimes(1)
	expect(H.disconnect.mock.invocationCallOrder[0]).toBeLessThan(L.disconnect.mock.invocationCallOrder[0])
})
