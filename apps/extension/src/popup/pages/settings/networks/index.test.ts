import { createTestingPinia } from "@pinia/testing"
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils"
import { nextTick } from "vue"
import { createMemoryHistory, createRouter } from "vue-router"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { installChromeStorage } from "../../../../../tests/helpers/chrome-storage-mock"
import { pressOn } from "../../../../../tests/helpers/press-key"
import { useAppStore } from "@/stores/app.store"
import { CHAIN_IDS } from "@/utils/chain-ids"
import SettingsPageShell from "@/components/composite/SettingsPageShell.vue"
import SettingItem from "@/components/ui/Settings/SettingItem.vue"
import NetworksIndex from "./index.vue"

const configState = vi.hoisted(() => ({ developerMode: false, listeners: [] as Array<(s: { key: string; value: unknown }) => void> }))
vi.mock("@/wallet/services/config/client", () => ({
	ConfigServiceClient: function ConfigServiceClient() {
		return {
			getValue: vi.fn(async (key: string) => (key === "developerMode" ? configState.developerMode : undefined)),
			onUpdate: { add: (fn: (s: { key: string; value: unknown }) => void) => configState.listeners.push(fn), remove: vi.fn() },
			disconnect: vi.fn(),
		}
	},
}))
const activate = vi.hoisted(() => vi.fn(async (_target: { id: string }): Promise<string> => "blocked"))
const openToast = vi.hoisted(() => vi.fn())
vi.mock("@/utils/core", () => ({ managers: { network: { setActiveNetwork: vi.fn(), getActiveNetwork: vi.fn() } } }))
vi.mock("@/composables/useNetworkActivation", () => ({ useNetworkActivation: () => ({ activate }) }))
vi.mock("@/composables/toast", () => ({ useToast: () => ({ openToast }) }))

enableAutoUnmount(afterEach)

// The app store's setup runs `useSyncedRef` → `chrome.storage.local` on instantiation; stub it.
beforeEach(() => {
	activate.mockReset().mockResolvedValue("blocked")
	openToast.mockClear()
	vi.stubGlobal("chrome", {
		storage: {},
		runtime: { connect: vi.fn(), onMessage: { addListener: vi.fn(), removeListener: vi.fn() } },
	})
	installChromeStorage({}, { persist: false })
})
afterEach(() => {
	document.body.innerHTML = ""
	vi.unstubAllGlobals()
})

const NETS = [
	{ id: "alpha", name: "Alpha V6", chainId: CHAIN_IDS.MAINNET, kind: "mainnet", endpoints: [], primaryEndpointId: "" },
	{ id: "local", name: "Local Network", chainId: CHAIN_IDS.SANDBOX, kind: "sandbox", endpoints: [], primaryEndpointId: "" },
	{ id: "tn", name: "Testnet", chainId: CHAIN_IDS.TESTNET, kind: "testnet", endpoints: [], primaryEndpointId: "" },
]

async function mountList(activeId: string) {
	const router = createRouter({
		history: createMemoryHistory(),
		routes: [{ path: "/:pathMatch(.*)*", component: { template: "<div />" } }],
	})
	await router.push("/start")
	const wrapper = mount(NetworksIndex, {
		attachTo: document.body,
		global: {
			plugins: [createTestingPinia({ createSpy: vi.fn }), router],
			components: { SettingsPageShell, SettingItem },
			stubs: {
				Flex: { inheritAttrs: false, template: "<div v-bind='$attrs'><slot /></div>" },
				Text: { template: "<span><slot /></span>" },
				Icon: { props: ["name"], template: "<span data-testid='stub-icon' :data-name='name' />" },
				Spinner: true,
				// Badge is the @nulo/design chip; the stub keeps the testid and text assertions deterministic.
				Badge: { inheritAttrs: false, template: "<span v-bind='$attrs'><slot /></span>" },
				SubPageHeader: true,
				SectionLabel: true,
				ItemsContainer: { template: "<div><slot /></div>" },
				Button: {
					props: ["variant", "size"],
					inheritAttrs: false,
					template: "<button type='button' :data-variant='variant' :data-size='size' v-bind='$attrs'><slot /></button>",
				},
			},
		},
	})
	const appStore = useAppStore()
	appStore.networks = NETS as never
	appStore.network = appStore.networks.find((n) => n.id === activeId)
	await flushPromises()
	return { wrapper, appStore, router }
}

const rowLink = (name: string) => document.querySelector<HTMLElement>(`[data-testid="network-row"][data-network-name="${name}"]`)
const switchOf = (name: string) => document.querySelector<HTMLElement>(`[data-testid="network-row-switch"][data-network-name="${name}"]`)
const named = (el: Element) => `${el.getAttribute("data-testid")}:${el.getAttribute("data-network-name")}`

describe("Settings › Networks list: links, the active row, the Switch buttons", () => {
	test("every row is one link to its page carrying the row's testid and data attributes, in Testnet, Local, then name order", async () => {
		await mountList("alpha")
		const rows = [...document.querySelectorAll('[data-testid="network-row"]')]
		expect(
			rows.map((r) => [r.tagName, r.getAttribute("href"), r.getAttribute("data-network-id"), r.getAttribute("data-network-name")]),
		).toEqual([
			["A", "/popup/settings/networks/tn", "tn", "Testnet"],
			["A", "/popup/settings/networks/local", "local", "Local Network"],
			["A", "/popup/settings/networks/alpha", "alpha", "Alpha V6"],
		])
	})

	test("the active row alone shows the dot and the Active badge, inside its link", async () => {
		await mountList("alpha")
		const dots = document.querySelectorAll('[data-testid="network-active-dot"]')
		const badges = document.querySelectorAll('[data-testid="network-active-badge"]')
		expect(dots).toHaveLength(1)
		expect(badges).toHaveLength(1)
		expect(badges[0]?.textContent).toContain("Active")
		expect(rowLink("Alpha V6")?.contains(dots[0] ?? null)).toBe(true)
		expect(rowLink("Alpha V6")?.contains(badges[0] ?? null)).toBe(true)
	})

	test("each inactive row has an outlined Switch named for its network, outside every link; the active row has none", async () => {
		await mountList("alpha")
		const switches = [...document.querySelectorAll<HTMLElement>('[data-testid="network-row-switch"]')]
		expect(switches.map((s) => s.getAttribute("data-network-name"))).toEqual(["Testnet", "Local Network"])
		for (const s of switches) {
			expect(s.tagName).toBe("BUTTON")
			expect(s.textContent?.trim()).toBe("Switch")
			expect(s.getAttribute("aria-label")).toBe(`Switch to ${s.getAttribute("data-network-name")}`)
			expect(s.dataset.variant).toBe("primary_outline")
			expect(s.dataset.size).toBe("mini")
			expect(s.closest("a")).toBeNull()
		}
		expect(switchOf("Alpha V6")).toBeNull()
	})

	test("Tab stops follow reading order: each inactive row's link then its Switch, the active row's link alone", async () => {
		const { wrapper } = await mountList("alpha")
		// DOM order is Tab order: nothing on the page sets a positive tabindex.
		const stops = [
			...(wrapper.element as HTMLElement).querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]"),
		].filter((el) => el.tabIndex >= 0)
		expect(stops.map(named)).toEqual([
			"network-row:Testnet",
			"network-row-switch:Testnet",
			"network-row:Local Network",
			"network-row-switch:Local Network",
			"network-row:Alpha V6",
		])
	})

	test("a click, Enter and Space on a Switch each activate that row's network once and leave the route alone", async () => {
		const { router } = await mountList("alpha")
		const local = switchOf("Local Network") as HTMLElement
		for (const press of [() => local.click(), () => pressOn(local, "Enter"), () => pressOn(local, " ")]) {
			activate.mockClear()
			press()
			await flushPromises()
			expect(activate).toHaveBeenCalledTimes(1)
			expect(activate.mock.calls[0]?.[0]).toMatchObject({ id: "local", name: "Local Network" })
		}
		expect(router.currentRoute.value.path).toBe("/start")
	})

	test("only an activated switch toasts 'Active network updated'; a refused, unconfirmed or stale one leaves the toast to the composable", async () => {
		await mountList("alpha")
		for (const result of ["blocked", "unconfirmed", "stale"]) {
			activate.mockResolvedValueOnce(result)
			switchOf("Testnet")?.click()
			await flushPromises()
		}
		expect(activate).toHaveBeenCalledTimes(3)
		expect(openToast).not.toHaveBeenCalled()

		activate.mockResolvedValueOnce("activated")
		switchOf("Testnet")?.click()
		await flushPromises()
		expect(openToast).toHaveBeenCalledTimes(1)
		expect(openToast).toHaveBeenCalledWith({ kind: "success", label: "Active network updated" })
	})

	test("a Switch that holds focus as its row becomes active hands focus to that row's link; a Switch on another row keeps it", async () => {
		const { appStore } = await mountList("alpha")
		activate.mockImplementation(async (target) => {
			appStore.network = target as never
			return "activated"
		})
		pressOn(switchOf("Testnet") as HTMLElement, "Enter")
		await flushPromises()
		await nextTick()
		expect(switchOf("Testnet")).toBeNull()
		expect(document.activeElement).toBe(rowLink("Testnet"))
		expect(rowLink("Testnet")?.querySelector('[data-testid="network-active-badge"]')).not.toBeNull()

		const local = switchOf("Local Network") as HTMLElement
		local.focus()
		appStore.network = appStore.networks.find((n) => n.id === "alpha")
		await flushPromises()
		await nextTick()
		expect(document.activeElement).toBe(local)
	})

	test("no left radio/circle icon remains (the source of the 'looks selectable' confusion)", async () => {
		const { wrapper } = await mountList("tn")
		const html = wrapper.html()
		expect(html).not.toContain("square-check")
		expect(html).not.toContain('data-name="square"')
	})
})

describe("Settings › Networks list — Add network is a Developer-Mode surface", () => {
	beforeEach(() => {
		configState.developerMode = false
		configState.listeners.length = 0
	})

	test("hidden by default, shown once Developer Mode is on, and follows a live config update", async () => {
		const { wrapper } = await mountList("alpha")
		expect(wrapper.find('[data-testid="network-new-btn"]').exists()).toBe(false)
		// Existing rows stay fully reachable regardless of the gate.
		expect(document.querySelectorAll('[data-testid="network-row"]')).toHaveLength(3)

		for (const fn of configState.listeners) fn({ key: "developerMode", value: true })
		await nextTick()
		expect(wrapper.find('[data-testid="network-new-btn"]').exists()).toBe(true)

		for (const fn of configState.listeners) fn({ key: "developerMode", value: false })
		await nextTick()
		expect(wrapper.find('[data-testid="network-new-btn"]').exists()).toBe(false)
	})

	test("an existing custom network stays listed and reachable with Developer Mode off", async () => {
		const { wrapper, appStore } = await mountList("alpha")
		appStore.networks = [
			...NETS,
			{ id: "mine", name: "My Chain", chainId: 4242, kind: "custom", endpoints: [], primaryEndpointId: "" },
		] as never
		await flushPromises()
		expect(rowLink("My Chain")?.getAttribute("href")).toBe("/popup/settings/networks/mine")
		expect(wrapper.find('[data-testid="network-new-btn"]').exists()).toBe(false)
	})

	test("mounts visible when Developer Mode is already on", async () => {
		configState.developerMode = true
		const { wrapper } = await mountList("alpha")
		expect(wrapper.find('[data-testid="network-new-btn"]').exists()).toBe(true)
	})
})
